import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.location={hostname:'example.github.io',port:''};
const { cleanState }=await import('../public/storage.js');
const seed={complexes:[{id:'48',name:'보라매삼성',households:710,complexUrl:'https://fin.land.naver.com/complexes/48'}],regions:['봉천동'],listings:[],filters:{minExclusiveAreaM2:59,minHouseholds:400,minFloor:3,discountThreshold:.05},finance:{cash:100},runtime:{dataDir:'private'}};
test('backup round trip preserves settings and excludes finance/runtime',()=>{const result=cleanState(JSON.parse(JSON.stringify(seed)));assert.equal(result.complexes[0].name,'보라매삼성');assert.equal(result.filters.minFloor,3);assert.equal('finance' in result,false);assert.equal('runtime' in result,false);});
test('invalid link and filter backups are rejected',()=>{assert.throws(()=>cleanState({...seed,complexes:[{...seed.complexes[0],complexUrl:'javascript:alert(1)'}]}));assert.throws(()=>cleanState({...seed,filters:{...seed.filters,discountThreshold:9}}));});

test('notes, pins and area targets survive backup and local save normalization',()=>{
  const note={id:'n1',body:'방문 후기\n채광 좋음',author:'가족',createdAt:'2026-10-12T00:00:00Z',updatedAt:'2026-10-12T00:00:00Z'};
  const result=cleanState({...seed,complexes:[{...seed.complexes[0],notes:[note],targets:[{area:84.99,price:110000}]}],listings:[{id:'l1',label:'103동',complexId:'48',price:117000,area:84.99,floor:null,url:'',observedDate:'2026-10-12',trades:[],pinned:false,notes:[note]}]});
  assert.deepEqual(result.complexes[0].notes,[note]);
  assert.deepEqual(result.complexes[0].targets,[{area:84.99,price:110000}]);
  assert.equal(result.listings[0].pinned,false);
  assert.deepEqual(cleanState(JSON.parse(JSON.stringify(result))),result);
});
test('invalid notes and duplicate area targets are rejected',()=>{
  assert.throws(()=>cleanState({...seed,complexes:[{...seed.complexes[0],notes:[{id:'bad',body:''}]}]}));
  assert.throws(()=>cleanState({...seed,complexes:[{...seed.complexes[0],targets:[{area:59,price:90000},{area:59,price:80000}]}]}));
});
