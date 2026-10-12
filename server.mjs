import { cleanState } from './public/storage.js';
import http from 'node:http';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.SWEET_HOME_DATA_DIR || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'sweetOurHome');
const stateFile = path.join(dataDir, 'state.json');
await mkdir(dataDir, { recursive: true });
const seed = JSON.parse(await readFile(path.join(root, 'config/watchlist.json'), 'utf8'));
let state;
try { state = JSON.parse(await readFile(stateFile, 'utf8')); }
catch (err) { if (err.code !== 'ENOENT') throw err; state = { complexes: seed.complexes.map(c => ({ ...c, id: c.sourceComplexId })), regions: [], filters: seed.filters, listings: [], alertSettings: { enabled: false } }; }
let queue = Promise.resolve();
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8' };
function validate(s) {
  if (!s || !Array.isArray(s.complexes) || !Array.isArray(s.listings) || !Array.isArray(s.regions) || s.complexes.length > 500 || s.listings.length > 5000) throw new Error('설정 형식이 올바르지 않습니다.');
  const num = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  const text = v => typeof v === 'string' && v.length <= 500;
  const url = v => !v || typeof v === 'string' && /^https?:\/\//.test(v) && v.length <= 3000;
  if (!num(s.filters?.minExclusiveAreaM2, 1, 1000) || !num(s.filters.minHouseholds, 1, 100000) || !num(s.filters.minFloor, 1, 200) || !num(s.filters.discountThreshold, 0, 1)) throw new Error('필터 범위를 확인해주세요.');
  if (s.complexes.some(c => !text(c.id) || !text(c.name) || !c.name.trim() || !num(c.households, 0, 100000) || !url(c.complexUrl) || c.targetPrice != null && !num(c.targetPrice, 0, 10000000))) throw new Error('단지 정보를 확인해주세요.');
  if (new Set(s.complexes.map(c=>c.id)).size !== s.complexes.length || s.regions.some(r=>!text(r))) throw new Error('관심 목록을 확인해주세요.');
  if (s.listings.some(l => !text(l.id) || !text(l.label) || !s.complexes.some(c=>c.id===l.complexId) || !num(l.price, 1, 10000000) || !num(l.area, 1, 1000) || l.floor !== null && !num(l.floor, 1, 200) || !url(l.url) || !Array.isArray(l.trades) || l.trades.length > 1000 || l.trades.some(t=>!num(t.price, 1, 10000000) || !num(t.area, 1, 1000) || !num(t.floor, 1, 200) || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)))) throw new Error('매물 또는 비교 거래 정보를 확인해주세요.');

}
const server = http.createServer(async (req,res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','no-store');
  const host = req.headers.host;
  if (!/^127\.0\.0\.1:\d+$/.test(host || '')) { res.writeHead(403); res.end('Local access only'); return; }
  try {
    const url = new URL(req.url, `http://${host}`);
    if (url.pathname === '/api/state') {
      res.setHeader('Content-Type','application/json; charset=utf-8');
      if (req.method === 'GET') { const { finance, ...publicState } = state; res.end(JSON.stringify({ ...publicState, runtime: { collectionEnabled: false, telegramEnabled: false, dataDir } })); return; }
      if (req.method === 'PUT') {
        if (req.headers.origin !== `http://${host}` || !req.headers['content-type']?.startsWith('application/json')) { res.writeHead(403); res.end('{}'); return; }
        let body=''; for await (const chunk of req) { body+=chunk; if (body.length>2000000) throw new Error('저장 용량을 초과했습니다.'); }
        const next=cleanState(JSON.parse(body)); validate(next);
        if (state.finance != null) next.finance = state.finance;
        next.alertSettings={ ...(next.alertSettings || {}), enabled:false };
        queue=queue.catch(()=>{}).then(async()=>{ await writeFile(stateFile+'.tmp', JSON.stringify(next,null,2), 'utf8'); await rename(stateFile+'.tmp',stateFile); state=next; });
        await queue; res.end('{"saved":true}'); return;
      }
      res.writeHead(405); res.end('{}'); return;
    }
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    const files = { '/':'public/index.html', '/app.js':'public/app.js', '/storage.js':'public/storage.js', '/cloud.js':'public/cloud.js', '/firebase-config.js':'public/firebase-config.js', '/style.css':'public/style.css', '/listings.mjs':'lib/listings.mjs' };
    const file = files[url.pathname]; if (!file) { res.writeHead(404); res.end('Not found'); return; }
    res.setHeader('Content-Type',mime[path.extname(file)]); res.end(await readFile(path.join(root,file)));
  } catch(err) { res.writeHead(400,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify({error:err.message})); }
});
server.listen(Number(process.env.PORT || 4310), '127.0.0.1', ()=>console.log(`sweetOurHome: http://127.0.0.1:${server.address().port}\nData: ${dataDir}`));
