import test from 'node:test';
import assert from 'node:assert/strict';
import {TargetObserver} from '../lib/target-observer.mjs';
import {sendPending,formatAlert} from '../lib/observer.mjs';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const now=new Date('2026-10-18T07:30:00Z');
function state(){return {regions:[],filters:{minExclusiveAreaM2:59,minHouseholds:400,minFloor:3,discountThreshold:.05},complexes:[{id:'c',households:0,name:'별칭',targets:[{area:84.85,price:110000}],collection:{attemptedAt:now.toISOString(),lastSuccessAt:now.toISOString(),status:'partial',count:1,error:''}}],listings:[{id:'a',complexId:'c',label:'101동',price:110000,area:84.85,floor:null,observedDate:'2026-10-18',source:'naver-snapshot',sourceObservedAt:now.toISOString(),trades:[]}]};}
test('target equality alerts immediately with unknown floor and personal Telegram chat; deduplicates',async()=>{
 const o=new TargetObserver(':memory:');try{
 const s=state();assert.equal(o.observe(s,now).pending,1);
 assert.match(formatAlert(o.pending()[0].event),/층수 미확인/);
 assert.equal(await sendPending(o,{token:'123:test',chatId:'123'},async()=>({ok:true,json:async()=>({ok:true})})),1);
 assert.equal(o.observe(s,now).pending,0);
 s.complexes[0].targets=[];o.observe(s,now);s.complexes[0].targets=[{area:84.85,price:120000}];assert.equal(o.observe(s,now).pending,0);
 s.listings[0].price=109000;assert.equal(o.observe(s,now).pending,1);
 }finally{o.close();}
});
test('stale, mismatched area, above-target, failed and disabled collection cannot send; pending revoked',()=>{
 const o=new TargetObserver(':memory:');try{
 for(const mutate of [s=>s.listings[0].area=84.9,s=>s.listings[0].price=110001,s=>s.complexes[0].collection.status='error',s=>s.complexes[0].collectionEnabled=false,s=>s.complexes[0].targets=[],s=>s.listings[0].source='manual',s=>s.listings[0].sourceObservedAt='2026-10-18T07:20:00Z']){
 const s=state();assert.equal(o.observe(s,now).pending,1);mutate(s);assert.equal(o.observe(s,now).pending,0);
 }
 assert.equal(o.observe(state(),new Date(+now+31*60000)).pending,0);
 }finally{o.close();}
});
test('sent prices remain deduplicated after process restart',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'target-alert-'));
 let o=new TargetObserver(path.join(dir,'test.sqlite'));
 try{
 o.observe(state(),now);
 await sendPending(o,{token:'123:test',chatId:'123'},async()=>({ok:true,json:async()=>({ok:true})}));
 o.close();o=new TargetObserver(path.join(dir,'test.sqlite'));
 assert.equal(o.observe(state(),now).pending,0);
 }finally{o.close();rmSync(dir,{recursive:true,force:true});}
});
