import test from 'node:test';
import assert from 'node:assert/strict';
import {saveResult} from '../scripts/python-collector-bridge.mjs';
import {cleanState} from '../public/storage.js';
const url='https://naver.me/test';
const seed=()=>cleanState({complexes:[{id:'c',name:'테스트',complexUrl:url,households:500}],listings:[],regions:[],filters:{minExclusiveAreaM2:59,minHouseholds:400,minFloor:3,discountThreshold:.05}});
const request=()=>({id:'c',url,snapshot:{observedAt:new Date().toISOString(),rows:[{text:'테스트 101동\n매매 12억\n아파트108㎡ (전용84.85)17/20층남향',url:'https://fin.land.naver.com/articles/123'}]}});
test('Python bridge reparses raw rows and retries CAS preserving latest edits',async()=>{
  let state=seed(),writes=0;
  const result=await saveResult(request(),{read:async()=>({state}),commit:async(p,b,n)=>{
    if(++writes===1){state.complexes[0].targets=[{area:84.85,price:110000}];throw Object.assign(Error(),{code:'CONFLICT'});}
    state=n;
  }});
  assert.equal(result.status,'partial');assert.equal(result.count,1);assert.equal(state.listings[0].price,120000);
  assert.equal(state.complexes[0].targets[0].price,110000);
});
test('Python bridge does not resurrect removed or changed links',async()=>{
  const state=seed();state.complexes[0].complexUrl='https://naver.me/changed';
  assert.deepEqual(await saveResult(request(),{read:async()=>({state}),commit:async()=>assert.fail()}),{skipped:true});
});
test('Python bridge rejects wrong complex data and records error without adding listings',async()=>{
  let state=seed();const r=request();r.snapshot.rows[0].text=r.snapshot.rows[0].text.replace('테스트','다른단지');
  const result=await saveResult(r,{read:async()=>({state}),commit:async(p,b,n)=>{state=n;}});
  assert.equal(result.status,'error');assert.equal(state.listings.length,0);
});

test('link-bound source name allows aliases without changing display name',async()=>{
  let state=seed();state.complexes[0].name='내 별칭';
  const r=request();r.snapshot.complexName='테스트';r.snapshot.requestedUrl=url;
  const result=await saveResult(r,{read:async()=>({state}),commit:async(p,b,n)=>{state=n;}});
  assert.equal(result.status,'partial');assert.equal(state.complexes[0].name,'내 별칭');assert.equal(state.listings[0].complexId,'c');
});
test('snapshot from a different link cannot use source name override',async()=>{
  let state=seed();const r=request();r.snapshot.complexName='테스트';r.snapshot.requestedUrl='https://naver.me/other';
  const result=await saveResult(r,{read:async()=>({state}),commit:async(p,b,n)=>{state=n;}});
  assert.equal(result.status,'error');assert.equal(state.listings.length,0);
});
