import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDigest,noonWindow} from '../lib/daily-digest.mjs';
const now=new Date('2026-10-19T03:00:00Z');
const state=()=>({regions:[],filters:{minExclusiveAreaM2:59,minHouseholds:400,minFloor:3,discountThreshold:.05},complexes:[{id:'c',name:'단지',households:0,complexUrl:'https://naver.me/a',collection:{attemptedAt:now.toISOString(),lastSuccessAt:now.toISOString(),status:'partial',count:1,error:''}}],listings:[{id:'a',complexId:'c',label:'101동',price:100000,area:84.85,floor:null,observedDate:'2026-10-19',source:'naver-snapshot',sourceObservedAt:now.toISOString(),trades:[]}]});
test('Seoul noon window independent of host timezone',()=>{
 assert.equal(noonWindow(now),true);
 assert.equal(noonWindow(new Date('2026-10-19T02:59:59Z')),false);
 assert.equal(noonWindow(new Date('2026-10-19T03:30:00Z')),false);
 assert.equal(noonWindow(new Date('2026-10-19T15:00:00Z')),false);
});
test('unchanged listings silent, price and identities tracked even when ranges are similar',()=>{
 const s=state(),base=buildDigest(s,{},now).next;
 assert.equal(buildDigest(s,base,now).text,'');
 s.listings[0].price=99000;
 assert.match(buildDigest(s,base,now).text,/10억 → 9.9억/);
 s.listings[0].id='b';s.listings[0].price=100000;
 const result=buildDigest(s,base,now);
 assert.match(result.text,/새로 관찰 1건 · 이번 수집 미확인 1건/);
 assert.match(result.text,/삭제·거래 완료를 뜻하지 않습니다/);
});
test('stale and failed batches preserve comparison baseline and do not claim changes',()=>{
 const s=state(),base=buildDigest(s,{},now).next;
 s.complexes[0].collection.status='error';s.listings[0].price=90000;
 const failed=buildDigest(s,base,now);assert.equal(failed.text,'');assert.deepEqual(failed.next,base);
 s.complexes[0].collection.status='partial';
 assert.equal(buildDigest(s,base,new Date(+now+31*60000)).text,'');
 s.listings.push({...s.listings[0],id:'old',sourceObservedAt:'2026-10-18T00:00:00Z'});
 assert.equal(buildDigest(s,base,now).next.c.rows.length,1);
});
test('changed link is a fresh baseline; removed complexes do not generate removal alerts',()=>{
 const s=state(),base=buildDigest(s,{},now).next;
 s.complexes[0].complexUrl='https://naver.me/new';
 assert.match(buildDigest(s,base,now).text,/첫 관찰/);
 s.complexes=[];s.listings=[];assert.equal(buildDigest(s,base,now).text,'');
});
