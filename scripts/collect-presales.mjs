import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import net from 'node:net';
import {fetchPresales,publishPresales} from '../lib/presales.mjs';
import {presaleStatus} from '../public/presale-model.js';
import {seoulDate} from '../public/daily-history.js';
import {Observer,sendPending} from '../lib/observer.mjs';
import {firebaseConfig} from '../public/firebase-config.js';
const dir=path.join(process.env.LOCALAPPDATA,'sweetOurHome','presales');
await mkdir(dir,{recursive:true});
const args=process.argv.slice(2);
if(args.some(a=>!['--telegram-only','--no-send','--auto'].includes(a)))throw Error('지원 옵션: --telegram-only, --no-send, --auto');
const lock=net.createServer();
await new Promise((resolve,reject)=>{lock.once('error',()=>reject(Error('분양 수집이 이미 실행 중입니다.')));lock.listen(9226,'127.0.0.1',resolve);});
const o=new Observer(path.join(dir,'notifications.sqlite'));
try{
 const {serviceKey,webEnabled}=JSON.parse(await readFile(path.join(dir,'api.json'),'utf8'));
 if(typeof serviceKey!=='string'||!serviceKey.trim())throw Error('PC 청약 API 인증키 설정 필요');
 const feed=await fetchPresales(serviceKey);
 await writeFile(path.join(dir,'latest.json'),JSON.stringify(feed));
 if(!args.includes('--telegram-only')&&(!args.includes('--auto')||webEnabled===true))await publishPresales(firebaseConfig.projectId,feed);
 if(!args.includes('--no-send')){
   const settings=JSON.parse(await readFile(path.join(process.env.LOCALAPPDATA,'sweetOurHome','observer','telegram.json'),'utf8'));
   const today=seoulDate(new Date());
   o.db.exec('BEGIN IMMEDIATE');
   try{
     o.db.exec("UPDATE events SET status='obsolete' WHERE status='pending'");
     for(const item of feed.items){
       if(!['접수 예정','접수 중'].includes(presaleStatus(item,today)))continue;
       const id=item.id+':'+createHash('sha256').update(JSON.stringify(item)).digest('hex');
       const prior=o.db.prepare('SELECT seq,status FROM events WHERE id=?').get(id);
       if(prior){if(prior.status==='obsolete')o.db.prepare("UPDATE events SET status='pending' WHERE seq=?").run(prior.seq);continue;}
       const changed=!!o.db.prepare('SELECT seq FROM events WHERE id LIKE ?').get(item.id+':%');
       const text=`[우리집] 경기 남부 분양 ${changed?'공고 변경':'공고 안내'}\n${item.name} · ${item.city}시\n${item.address}\n${item.households}세대 · ${presaleStatus(item,today)}\n공고 ${item.announced||'확인 필요'}\n접수 ${item.start} ~ ${item.end}\n특별공급 ${item.special||'공고 확인'} · 해당지역 1순위 ${item.first||'공고 확인'}\n당첨 발표 ${item.winner||'공고 확인'}\n신청 자격·세부 일정은 공식 공고를 확인하세요.\n${item.url}`;
       o.db.prepare('INSERT INTO events(id,at,payload) VALUES (?,?,?)').run(id,feed.fetchedAt,JSON.stringify({source:'daily-digest',text}));
     }
     o.db.exec('COMMIT');
   }catch(e){o.db.exec('ROLLBACK');throw e;}
   console.log(JSON.stringify({items:feed.items.length,sent:await sendPending(o,settings),pending:o.pending().length}));
 }else console.log(JSON.stringify({items:feed.items.length,sent:0}));
 o.setMeta('lastSuccess',feed.fetchedAt);o.setMeta('lastError','');
}catch(e){o.failure('분양 수집 또는 전송 실패');console.error('분양 수집 또는 전송 실패. API 승인·네트워크·Firebase 규칙과 PC 설정을 확인하세요.');process.exitCode=1;}
finally{o.close();lock.close();}
