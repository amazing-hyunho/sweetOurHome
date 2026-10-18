import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeSnapshot} from '../lib/merge-snapshot.mjs';
import {encodeValue,decodeValue,readSharedDocument,commitSharedState} from '../lib/shared-state.mjs';

const note={id:'n',body:'배우자 방문 후기',author:'방문자',createdAt:'2026-10-10T00:00:00Z',updatedAt:'2026-10-10T00:00:00Z'};
const state=()=>({complexes:[{id:'c',name:'테스트아파트',households:500,notes:[note],targets:[{area:84.85,price:120000}]}],regions:['관심지역'],filters:{minExclusiveAreaM2:59,minHouseholds:400,minFloor:3,discountThreshold:.05},listings:[{id:'manual-id',complexId:'c',label:'직접 남긴 설명',price:130000,area:84.85,floor:17,url:'https://fin.land.naver.com/articles/123',observedDate:'2026-10-10',trades:[],pinned:true,notes:[note]},{id:'keep',complexId:'c',label:'목록에 안 보여도 보존',price:100000,area:59,floor:3,url:'',observedDate:'2026-10-10',trades:[],pinned:false}]});
const card=(id='123',floor='17')=>({text:`테스트아파트 201동\n매매 12억\n아파트108㎡ (전용84.85)${floor}/20층동향`,url:id?`/articles/${id}`:null});
const snapshot=()=>({observedAt:'2026-10-12T00:00:00Z',expectedCount:3,rows:[card(),card('456','중'),card(null,'고')]});

test('merge matches manual URL, preserves notes/pins/targets/trades and never deletes absent records',()=>{
  const input=state(),untouched=structuredClone(input);
  const merged=mergeSnapshot(input,'c',snapshot());
  assert.deepEqual(input,untouched);
  const old=merged.state.listings.find(l=>l.id==='manual-id');
  assert.equal(old.price,120000);assert.equal(old.label,'직접 남긴 설명');assert.equal(old.pinned,true);assert.deepEqual(old.notes,[note]);
  assert.equal(merged.state.listings.find(l=>l.id==='naver:456').pinned,false);
  assert.equal(merged.state.listings.find(l=>l.id==='naver:456').floor,null);
  assert.ok(merged.state.listings.find(l=>l.id==='keep'));
  assert.deepEqual(merged.state.complexes[0].targets,[{area:84.85,price:120000}]);
  assert.deepEqual(merged.state.complexes[0].notes,[note]);
  assert.equal(merged.stats.skippedGroups,1);
  assert.deepEqual(merged.state.complexes[0].dailyHistory.days[0].groups,[{area:84.85,min:120000,max:120000,count:2}]);
  assert.equal(merged.state.complexes[0].dailyHistory.days[0].date,'2026-10-12');
  const repeated=mergeSnapshot(merged.state,'c',snapshot());
  assert.equal(repeated.stats.added,0);assert.equal(repeated.stats.updated,0);
});
test('wrong complex, duplicate existing IDs, empty and stale snapshots are rejected',()=>{
  assert.throws(()=>mergeSnapshot(state(),'missing',snapshot()));
  const wrong=state();wrong.complexes[0].name='다른단지';assert.throws(()=>mergeSnapshot(wrong,'c',snapshot()),/단지명/);
  assert.throws(()=>mergeSnapshot(state(),'c',{observedAt:'2026-10-12T00:00:00Z',rows:[]}),/빈 스냅샷/);
  const first=mergeSnapshot(state(),'c',snapshot()).state;
  assert.throws(()=>mergeSnapshot(first,'c',{...snapshot(),observedAt:'2026-10-11T23:00:00Z'}),/오래된/);
  const duplicate=state();duplicate.listings.push({...duplicate.listings[0],id:'second'});
  assert.throws(()=>mergeSnapshot(duplicate,'c',snapshot()),/중복/);
});
test('Firebase codec roundtrips normalized state and versioned read rejects missing version',async()=>{
  const data=mergeSnapshot(state(),'c',snapshot()).state;
  assert.deepEqual(decodeValue(encodeValue(data)),data);
  const reply={fields:{state:encodeValue(data),revision:{integerValue:'8'}},updateTime:'2026-10-12T00:00:00Z'};
  assert.equal((await readSharedDocument('test-project',async()=>({ok:true,json:async()=>reply}))).revision,8);
  await assert.rejects(readSharedDocument('test-project',async()=>({ok:true,json:async()=>({fields:{state:encodeValue(data)}})})),/버전/);
});
test('Firebase write uses revision plus updateTime precondition and server timestamp',async()=>{
  const before={revision:8,updateTime:'2026-10-12T00:00:00Z'},next=mergeSnapshot(state(),'c',snapshot()).state;
  let request;
  const result=await commitSharedState('test-project',before,next,async(url,options)=>{
    assert.equal(url,'https://firestore.googleapis.com/v1/projects/test-project/databases/(default)/documents:commit');request=JSON.parse(options.body);
    return {ok:true,json:async()=>({commitTime:'done',writeResults:[{updateTime:'done'}]})};
  });
  assert.equal(result.revision,9);
  assert.deepEqual(request.writes[0].currentDocument,{updateTime:before.updateTime});
  assert.equal(request.writes[0].update.fields.revision.integerValue,'9');
  assert.deepEqual(request.writes[0].updateTransforms,[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}]);
  assert.deepEqual(decodeValue(request.writes[0].update.fields.state),next);
});
test('concurrent edit conflict is surfaced without overwriting or retrying',async()=>{
  let calls=0;
  await assert.rejects(commitSharedState('test-project',{revision:8,updateTime:'old'},state(),async()=>{calls++;return {ok:false,status:409};}),/다른 기기/);
  assert.equal(calls,1);
});
