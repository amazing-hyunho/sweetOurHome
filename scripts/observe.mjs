import { mkdir,readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Observer,readSharedState,sendPending } from '../lib/observer.mjs';
import { firebaseConfig } from '../public/firebase-config.js';

const dir=process.env.SWEET_HOME_OBSERVER_DIR||path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'sweetOurHome','observer');
await mkdir(dir,{recursive:true});
const observer=new Observer(path.join(dir,'history.sqlite'));
const args=process.argv.slice(2);
const supported=new Set(['--status','--history','--events','--send','--watch']);
let stopping=false;
let wake;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;wake?.();});
async function runOnce(){
  // Validate local send settings before consuming a new shared snapshot.
  let settings;
  if(args.includes('--send')){
    try{settings=JSON.parse(await readFile(path.join(dir,'telegram.json'),'utf8'));}catch{throw Error('PC 전용 telegram.json 설정 파일이 필요합니다. docs/observer.md를 확인하세요.');}
  }
  const state=await readSharedState(firebaseConfig.projectId);
  console.log(JSON.stringify(observer.observe(state),null,2));
  if(settings)console.log(`Telegram 전송: ${await sendPending(observer,settings)}건`);
}
try {
  if(args.some(arg=>!supported.has(arg)))throw Error('지원 옵션: --status, --history, --events, --watch, --send');
  if(args.filter(arg=>['--status','--history','--events'].includes(arg)).length>1||args.some(arg=>['--status','--history','--events'].includes(arg))&&args.some(arg=>['--watch','--send'].includes(arg)))throw Error('조회 옵션은 단독으로 사용하세요.');
  if(args.includes('--status'))console.log(JSON.stringify({...observer.status(),pending:observer.pending().length,dataDir:dir,source:'공동 목록 입력값',naverCollectionEnabled:false},null,2));
  else if(args.includes('--history'))console.log(JSON.stringify(observer.history(),null,2));
  else if(args.includes('--events'))console.log(JSON.stringify(observer.events(),null,2));
  else {
    if(args.includes('--watch'))console.log('공동 목록을 5분마다 확인합니다. 네이버 매물 수집은 미연결입니다. 종료: Ctrl+C');
    do{
      try{await runOnce();}
      catch(error){observer.failure(error.message);console.error(error.message);if(!args.includes('--watch'))throw error;}
      if(!args.includes('--watch')||stopping)break;
      await new Promise(resolve=>{const timer=setTimeout(resolve,5*60*1000);wake=()=>{clearTimeout(timer);resolve();};});
      wake=undefined;
    }while(!stopping);
  }
} catch(error){observer.failure(error.message);console.error(error.message);process.exitCode=1;}
finally{observer.close();}
