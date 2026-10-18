import {chromium} from 'playwright';
import {mkdir,open,readFile,unlink,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {firebaseConfig} from '../public/firebase-config.js';
import {collectPage,runCollection} from '../lib/collector.mjs';

const args=process.argv.slice(2);
if(args.some(a=>!['--watch','--headed'].includes(a)))throw Error('사용법: npm run collect -- [--watch] [--headed]');
const dir=path.join(process.env.LOCALAPPDATA||os.homedir(),'sweetOurHome','collector');
await mkdir(dir,{recursive:true});
const lockPath=path.join(dir,'collector.lock');
const cooldownPath=path.join(dir,'cooldown.json');
const profilePath=path.join(dir,'browser-profile');
let lock,browser,stop=false,wake;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stop=true;wake?.();});
try{
  try{lock=await open(lockPath,'wx');}
  catch(e){
    if(e.code!=='EEXIST')throw e;
    const pid=Number(await readFile(lockPath,'utf8'));
    if(!Number.isSafeInteger(pid)||pid<1)throw Error('수집기 잠금 파일을 확인하세요: '+lockPath);
    try{process.kill(pid,0);throw Error('이미 실행 중인 PC 수집기가 있습니다.');}
    catch(check){if(check.code!=='ESRCH')throw check;}
    await unlink(lockPath);lock=await open(lockPath,'wx');
  }
  await lock.writeFile(String(process.pid));
  console.log('Firebase 관심 단지 → PC 브라우저 → Firebase 매물. 종료: Ctrl+C');
  console.log(`수집 전용 브라우저 프로필: ${profilePath}`);
  do{
    let nextDelay=600000;
    try{
      let retryAt=0;
      try{retryAt=JSON.parse(await readFile(cooldownPath,'utf8')).retryAt;if(!Number.isFinite(retryAt))throw Error('잘못된 수집 대기 파일');}catch(e){if(e.code!=='ENOENT')throw e;}
      if(retryAt>Date.now())throw Error(`조회 제한 대기 중입니다. 다음 실행 가능: ${new Date(retryAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}`);
      const context=await chromium.launchPersistentContext(profilePath,{channel:process.env.SWEET_HOME_BROWSER||'msedge',headless:!args.includes('--headed'),locale:'ko-KR'});
      browser=context;
      const results=await runCollection({projectId:firebaseConfig.projectId,onRateLimit:async retryAt=>{
        await writeFile(cooldownPath,JSON.stringify({retryAt}));
        nextDelay=Math.max(nextDelay,retryAt-Date.now());
      },collect:async url=>{
        const page=await context.newPage();
        try{return await collectPage(page,url);}finally{await page.close();}
      }});
      if(!results.length)console.log('수집할 관심 단지가 없습니다. 웹에서 네이버 단지 링크를 등록하세요.');
      const cooldown=results.find(r=>r.status==='cooldown');
      if(cooldown){
        console.log(`429 이후 추가 단지 조회 중단. 다음 실행 가능: ${new Date(cooldown.retryAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}`);
      }
      if(results.some(r=>r.status==='error')&&!args.includes('--watch'))process.exitCode=1;
    }catch(e){console.error(e.message);if(!args.includes('--watch'))process.exitCode=1;}
    finally{await browser?.close();browser=null;}
    if(stop||!args.includes('--watch'))break;
    await new Promise(resolve=>{const timer=setTimeout(resolve,Math.min(nextDelay,2147483647));wake=()=>{clearTimeout(timer);resolve();};});wake=null;
  }while(!stop);
}catch(e){console.error(e.message);process.exitCode=1;}
finally{await browser?.close();if(lock){await lock.close();await unlink(lockPath);}}
