import {mkdir,readFile,writeFile,unlink,access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {TargetObserver} from '../lib/target-observer.mjs';
import {readSharedState,sendPending} from '../lib/observer.mjs';
import {firebaseConfig} from '../public/firebase-config.js';

const dir=process.env.SWEET_HOME_OBSERVER_DIR||path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'sweetOurHome','observer');
await mkdir(dir,{recursive:true});
const stopFile=path.join(dir,'targets-stop');
const args=process.argv.slice(2);
if(args.some(a=>!['--watch','--stop','--status'].includes(a)))throw Error('지원 옵션: --watch, --stop, --status');
if(args.includes('--stop')){await writeFile(stopFile,'');process.exit(0);}
const lock=net.createServer();
await new Promise((resolve,reject)=>{lock.once('error',()=>reject(Error('알림 프로세스가 이미 실행 중이거나 9225 포트를 사용 중입니다.')));lock.listen(9225,'127.0.0.1',resolve);});
const observer=new TargetObserver(path.join(dir,'targets.sqlite'));
let stopping=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;});
try {
  if(args.includes('--status'))console.log(JSON.stringify(observer.status()));
  else {
    await unlink(stopFile).catch(()=>{});
    do {
      try {
        let settings;
        try{settings=JSON.parse(await readFile(path.join(dir,'telegram.json'),'utf8'));}catch{throw Error('텔레그램 설정 필요: PC observer/telegram.json (docs/target-alerts.md 참고)');}
        const state=await readSharedState(firebaseConfig.projectId);
        observer.observe(state);
        const sent=await sendPending(observer,settings);
        console.log(`${new Date().toISOString()} Telegram 전송 ${sent}건`);
      }catch(error){observer.failure(error.message);console.error(`${new Date().toISOString()} ${error.message}`);if(!args.includes('--watch'))process.exitCode=1;}
      if(!args.includes('--watch'))break;
      for(let i=0;i<60&&!stopping;i++){
        if(await access(stopFile).then(()=>true,()=>false)){stopping=true;break;}
        await new Promise(resolve=>setTimeout(resolve,1000));
      }
    }while(!stopping);
  }
}finally{observer.close();lock.close();}
