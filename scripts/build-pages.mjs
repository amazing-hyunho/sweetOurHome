import { mkdir,readFile,writeFile,copyFile } from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readdir} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
for(const file of ['presales.js','presale-model.js','daily-history.js','index.html','app.js','style.css','storage.js','cloud.js','firebase-config.js'])await copyFile('public/'+file,'dist/'+file);
for(const file of ['listings.mjs','merge-snapshot.mjs','naver-snapshot.mjs'])await copyFile('lib/'+file,'dist/'+file);
const seed=JSON.parse(await readFile('config/watchlist.json','utf8'));
await writeFile('dist/seed.json',JSON.stringify({schemaVersion:1,complexes:seed.complexes.map(c=>({...c,id:c.sourceComplexId})),regions:[],filters:seed.filters,listings:[],alertSettings:{enabled:false}},null,2));
await writeFile('dist/.nojekyll','');
// Keep a new page from mixing old cached modules with a newer deployment.
const assets=(await readdir('dist')).filter(name=>/\.(js|mjs|css)$/.test(name)).sort();
const version=createHash('sha256');
for(const name of assets)version.update(await readFile('dist/'+name));
const tag=version.digest('hex').slice(0,12);
for(const name of assets.filter(name=>/\.(js|mjs)$/.test(name))){
  const code=await readFile('dist/'+name,'utf8');
  await writeFile('dist/'+name,code.replace(/((?:from\s*|import\s*\()\s*['"])(\.\.?\/[^'"?]+\.(?:js|mjs))(['"])/g,`$1$2?v=${tag}$3`));
}
const html=await readFile('dist/index.html','utf8');
await writeFile('dist/index.html',html.replace(/((?:src|href)=["'])([^"'?]+\.(?:js|css))(["'])/g,`$1$2?v=${tag}$3`));
console.log('GitHub Pages assets built in dist/');
