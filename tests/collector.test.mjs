import test from 'node:test';
import assert from 'node:assert/strict';
import {collectPage,runCollection,validateNaverUrl,readRenderedSaleCards,retryDelay} from '../lib/collector.mjs';
import {cleanState} from '../public/storage.js';

const url='https://fin.land.naver.com/complexes/48';
const seed=()=>cleanState({complexes:[{id:'c',name:'테스트',households:500,complexUrl:url}],regions:[],listings:[],filters:{minExclusiveAreaM2:59,minHouseholds:400,minFloor:3,discountThreshold:.05}});
const snapshot=()=>({observedAt:new Date().toISOString(),rows:[{text:'테스트 101동\n매매 12억\n아파트108㎡ (전용84.85)중/20층남향',url:'https://fin.land.naver.com/articles/123'}]});
test('collector reads links, saves parsed listings and survives serialization',async()=>{
  let state=seed();
  await runCollection({projectId:'test',read:async()=>({state}),collect:async actual=>{assert.equal(actual,url);return snapshot();},commit:async(p,b,n)=>{state=cleanState(n);},log:()=>{}});
  assert.equal(state.listings[0].price,120000);
  assert.equal(state.listings[0].floor,null);
  assert.equal(state.complexes[0].collection.status,'partial');
  assert.equal(state.complexes[0].collection.count,1);
  assert.ok(state.complexes[0].collection.lastSuccessAt);
});
test('failed scrape preserves last success and listings, disabled links are skipped',async()=>{
  let state=seed();state.complexes[0].collection={attemptedAt:'2026-10-01T00:00:00Z',lastSuccessAt:'2026-10-01T00:00:00Z',count:2,status:'partial',error:''};
  await runCollection({projectId:'test',read:async()=>({state}),collect:async()=>{throw Error('HTTP 429');},commit:async(p,b,n)=>{state=cleanState(n);},log:()=>{}});
  assert.equal(state.complexes[0].collection.lastSuccessAt,'2026-10-01T00:00:00Z');
  assert.equal(state.complexes[0].collection.status,'error');
  assert.equal(state.complexes[0].collection.count,2);
  state.complexes[0].collectionEnabled=false;
  assert.deepEqual(await runCollection({projectId:'test',read:async()=>({state}),collect:async()=>assert.fail(),commit:async()=>assert.fail()}),[]);
});
test('CAS conflict rebases on latest notes without re-scraping',async()=>{
  let state=seed(),writes=0,scrapes=0;
  await runCollection({projectId:'test',read:async()=>({state}),collect:async()=>{scrapes++;return snapshot();},commit:async(p,b,n)=>{
    if(++writes===1){state.complexes[0].targets=[{area:84.85,price:100000}];throw Object.assign(Error('conflict'),{code:'CONFLICT'});}
    state=cleanState(n);
  },log:()=>{}});
  assert.equal(scrapes,1);assert.equal(writes,2);assert.equal(state.complexes[0].targets[0].price,100000);
});
test('link changed or complex deleted during collection is not resurrected',async()=>{
  for(const deleted of [true,false]){
    let state=seed();
    await runCollection({projectId:'test',read:async()=>({state}),collect:async()=>{state=seed();if(deleted)state.complexes=[];else state.complexes[0].complexUrl='https://naver.me/new';return snapshot();},commit:async()=>assert.fail()});
  }
});
test('wrong complex never merges; arbitrary URLs are rejected',async()=>{
  for(const url of ['http://naver.me/a','https://evil.com','https://naver.me.evil.com/a','https://user:pass@naver.me/a','https://naver.me:444/a'])assert.throws(()=>validateNaverUrl(url));
  let state=seed();
  await runCollection({projectId:'test',read:async()=>({state}),collect:async()=>({...snapshot(),rows:snapshot().rows.map(r=>({...r,text:r.text.replace('테스트','다른단지')}))}),commit:async(p,b,n)=>{state=n;},log:()=>{}});
  assert.equal(state.listings.length,0);assert.equal(state.complexes[0].collection.status,'error');
});
test('rendered reader deduplicates cards across scrolling and rejects error redirects',async()=>{
  const page={goto:async()=>{},url:()=>url,waitForFunction:async()=>{},waitForTimeout:async()=>{},evaluate:async fn=>fn===readRenderedSaleCards?snapshot().rows:undefined};
  const result=await collectPage(page,url);assert.equal(result.rows.length,1);
  await assert.rejects(collectPage({...page,url:()=> 'https://financial.pstatic.net/404.html'},url),/페이지/);
});

test('client-side error redirect after DOM load is reported without reading cards',async()=>{
  let redirected=false;
  const page={goto:async()=>{},url:()=>redirected?'https://financial.pstatic.net/404.html':url,waitForFunction:async()=>{redirected=true;},evaluate:async()=>assert.fail('error page must not be parsed')};
  await assert.rejects(collectPage(page,url),/오류 페이지/);
});

test('complex HTTP 429 is distinguished from invalid links and listener is removed',async()=>{
  let listener,removed=false;
  const page={on:(event,fn)=>{listener=fn;},off:(event,fn)=>{assert.equal(fn,listener);removed=true;},goto:async()=>{listener({url:()=> 'https://fin.land.naver.com/front-api/v1/complex',status:()=>429});},url:()=>url,waitForFunction:async()=>{throw Error('timeout');}};
  await assert.rejects(collectPage(page,url),/조회 제한\(HTTP 429\)/);
  assert.equal(removed,true);
});

test('Retry-After seconds and HTTP date preserve server delay with 30 minute minimum',()=>{
  const now=Date.parse('2026-10-16T00:00:00Z');
  assert.equal(retryDelay('7200',now),7200000);
  assert.equal(retryDelay('Fri, 16 Oct 2026 02:00:00 GMT',now),7200000);
  for(const value of [undefined,'invalid','0','120'])assert.equal(retryDelay(value,now),1800000);
});

test('429 persists cooldown before Firebase write and stops remaining complexes',async()=>{
  let state=seed(),calls=0,persisted;
  state.complexes.push({...state.complexes[0],id:'second'});
  const result=await runCollection({projectId:'test',read:async()=>({state}),collect:async()=>{calls++;throw Object.assign(Error('429'),{code:'RATE_LIMITED',retryAfterMs:3600000});},onRateLimit:async at=>{persisted=at;},commit:async(p,b,n)=>{assert.ok(persisted>Date.now());state=n;},log:()=>{}});
  assert.equal(calls,1);assert.equal(result.at(-1).retryAt,persisted);
  assert.equal(state.complexes[0].collection.status,'error');
  assert.equal(state.complexes[1].collection,null);
});
