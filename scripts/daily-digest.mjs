import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Observer,readSharedState,sendPending} from '../lib/observer.mjs';
import {buildDigest,noonWindow} from '../lib/daily-digest.mjs';
import {seoulDate} from '../public/daily-history.js';
import {firebaseConfig} from '../public/firebase-config.js';
const args=process.argv.slice(2);
if(args.some(a=>!['--baseline','--preview'].includes(a)))throw Error('지원 옵션: --baseline, --preview');
const now=new Date(),date=seoulDate(now);
if(!args.length&&!noonWindow(now)){console.log('한국시간 12:00~12:29 실행만 전송합니다. 오늘 발송을 건너뜁니다.');process.exit(0);}
const dir=process.env.SWEET_HOME_OBSERVER_DIR||path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'sweetOurHome','observer');
await mkdir(dir,{recursive:true});
const o=new Observer(path.join(dir,'daily-digest.sqlite'));
try{
 const state=await readSharedState(firebaseConfig.projectId);
 const settings=args.length?null:JSON.parse(await readFile(path.join(dir,'telegram.json'),'utf8'));
 if(settings&&(!/^\d+:[\w-]+$/.test(settings.token||'')||! /^-?[1-9][0-9]*$/.test(settings.chatId||'')))throw Error('PC 텔레그램 설정 확인 필요');
 o.db.exec('BEGIN IMMEDIATE');
 let result;
 try{
   const meta=o.status();
   result=buildDigest(state,JSON.parse(meta.baseline||'{}'),now);
   if(args.includes('--preview')){o.db.exec('ROLLBACK');console.log(JSON.stringify({changedComplexes:result.changedComplexes,skipped:result.skipped,text:result.text}));process.exitCode=0;}
   else if(args.includes('--baseline')){
     if(!meta.baseline)o.setMeta('baseline',JSON.stringify(result.next));
     o.db.exec('COMMIT');console.log('기준 기록 준비 완료 (전송 없음)');
   }else if(meta.lastDate===date){o.db.exec('ROLLBACK');console.log('오늘 확인 완료: 중복 전송하지 않습니다.');}
   else{
     o.db.prepare("UPDATE events SET status='obsolete' WHERE status='pending' AND id!=?").run(date);
     o.setMeta('baseline',JSON.stringify(result.next));o.setMeta('lastDate',date);
     if(result.text&&meta.baseline)o.db.prepare('INSERT INTO events(id,at,payload) VALUES (?,?,?)').run(date,now.toISOString(),JSON.stringify({source:'daily-digest',text:result.text}));
     o.db.exec('COMMIT');
     const sent=await sendPending(o,settings);
     console.log(JSON.stringify({date,sent,changedComplexes:result.changedComplexes,skipped:result.skipped}));
   }
 }catch(e){if(o.db.isTransaction)o.db.exec('ROLLBACK');throw e;}
}catch{console.error('일별 알림 실행 실패. PC 설정·Firebase 연결·daily-digest.sqlite의 전송 상태를 확인하세요. 토큰은 출력하지 않습니다.');process.exitCode=1;}
finally{o.close();}
