import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Observer,readSharedState,sendPending,decodeValue} from '../lib/observer.mjs';
const now=new Date('2026-10-12T00:00:00Z');
const state=()=>({complexes:[{id:'48',name:'테스트 단지',households:710,targets:[{area:84.99,price:100000}]}],regions:[],filters:{minExclusiveAreaM2:59,minHouseholds:400,minFloor:3,discountThreshold:.05},listings:[{id:'a',complexId:'48',label:'103동',price:110000,area:84.99,floor:5,observedDate:'2026-10-12',trades:[],pinned:true}]});
test('baseline silent, pinned reduction alerts once and history retained on deletion',()=>{
  const o=new Observer(':memory:');try{
    const s=state();assert.equal(o.observe(s,now).pending,0);
    s.listings[0].price=105000;assert.equal(o.observe(s,now).pending,1);
    o.observe(s,now);assert.equal(o.pending().length,1);
    assert.deepEqual(o.pending()[0].event.reasons,['찜한 매물 가격 인하']);
    s.listings[0].price=99000;o.observe(s,now);
    assert.equal(o.pending().length,1);
    assert.deepEqual(o.pending()[0].event.reasons,['급매 후보','찜한 매물 가격 인하']);
    s.listings=[];o.observe(s,now);assert.equal(o.pending().length,0);
    assert.equal(o.db.prepare('SELECT COUNT(*) AS n FROM history').get().n,4);
  }finally{o.close();}
});
test('invalid snapshot and source failure retain known prices and success timestamp',()=>{
  const o=new Observer(':memory:');try{
    o.observe(state(),now);const before=o.status().lastSuccess;
    assert.throws(()=>o.observe({...state(),listings:[{id:'bad'}]},now));
    o.failure('HTTP 403');assert.equal(o.status().lastSuccess,before);
    assert.equal(o.db.prepare('SELECT price FROM listings').get().price,110000);
  }finally{o.close();}
});
test('unknown floor reduction and unpinned non-candidate do not alert',()=>{
  const o=new Observer(':memory:');try{
    const s=state();o.observe(s,now);s.listings[0].floor=null;s.listings[0].price=80000;o.observe(s,now);assert.equal(o.pending().length,0);
  }finally{o.close();}
});
test('Telegram successful send is not repeated; uncertain send is not retried',async()=>{
  const o=new Observer(':memory:');try{
    const s=state();o.observe(s,now);s.listings[0].price=100000;o.observe(s,now);
    let calls=0;const ok=async()=>{calls++;return {ok:true,json:async()=>({ok:true})};};
    const config={token:'123:test',chatId:'-123'};
    assert.equal(await sendPending(o,config,ok),1);assert.equal(await sendPending(o,config,ok),0);assert.equal(calls,1);
    s.listings[0].price=99000;o.observe(s,now);
    await assert.rejects(sendPending(o,config,async()=>{throw Error('secret URL');}),/불확실/);
    assert.equal(o.pending().length,0);assert.equal(o.db.prepare("SELECT COUNT(*) AS n FROM events WHERE status='uncertain'").get().n,1);
  }finally{o.close();}
});
test('Firestore errors are not treated as empty data and decoder preserves values',async()=>{
  await assert.rejects(readSharedState('test-project',async()=>({ok:false,status:403})),/접근 거부/);
  await assert.rejects(readSharedState('test-project',async()=>({ok:true,json:async()=>({})})),/state/);
  assert.deepEqual(decodeValue({mapValue:{fields:{price:{integerValue:'100000'},floor:{nullValue:null},pinned:{booleanValue:false}}}}),{price:100000,floor:null,pinned:false});
});
test('pending alerts are revalidated when pin, floor or target changes at the same price',()=>{
  const o=new Observer(':memory:');try{
    const s=state();o.observe(s,now);s.listings[0].price=105000;o.observe(s,now);
    assert.equal(o.pending().length,1);
    s.listings[0].pinned=false;o.observe(s,now);assert.equal(o.pending().length,0);
    s.complexes[0].targets[0].price=106000;o.observe(s,now);assert.equal(o.pending().length,1);
    s.listings[0].floor=null;o.observe(s,now);assert.equal(o.pending().length,0);
  }finally{o.close();}
});
test('restart preserves baseline, pending events and price history without duplicates',()=>{
  const folder=mkdtempSync(path.join(os.tmpdir(),'sweet-home-observer-'));
  const file=path.join(folder,'history.sqlite');
  let o;
  try{
    const s=state();o=new Observer(file);o.observe(s,now);s.listings[0].price=99000;o.observe(s,now);o.close();
    o=new Observer(file);assert.equal(o.observe(s,now).initial,false);
    assert.equal(o.pending().length,1);assert.equal(o.history().length,2);
    assert.equal(o.events()[0].status,'pending');
  }finally{o?.close();rmSync(folder,{recursive:true,force:true});}
});
