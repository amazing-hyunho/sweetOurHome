import { mkdir,readFile,writeFile,copyFile } from 'node:fs/promises';
await mkdir('dist',{recursive:true});
for(const file of ['daily-history.js','index.html','app.js','style.css','storage.js','cloud.js','firebase-config.js'])await copyFile('public/'+file,'dist/'+file);
for(const file of ['listings.mjs','merge-snapshot.mjs','naver-snapshot.mjs'])await copyFile('lib/'+file,'dist/'+file);
const seed=JSON.parse(await readFile('config/watchlist.json','utf8'));
await writeFile('dist/seed.json',JSON.stringify({schemaVersion:1,complexes:seed.complexes.map(c=>({...c,id:c.sourceComplexId})),regions:[],filters:seed.filters,listings:[],alertSettings:{enabled:false}},null,2));
await writeFile('dist/.nojekyll','');
console.log('GitHub Pages assets built in dist/');
