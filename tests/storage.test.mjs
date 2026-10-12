import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.location={hostname:'example.github.io',port:''};
const { cleanState }=await import('../public/storage.js');
const seed={complexes:[{id:'48',name:'보라매삼성',households:710,complexUrl:'https://fin.land.naver.com/complexes/48'}],regions:['봉천동'],listings:[],filters:{minExclusiveAreaM2:59,minHouseholds:400,minFloor:3,discountThreshold:.05},finance:{cash:100},runtime:{dataDir:'private'}};
test('backup round trip preserves settings and excludes finance/runtime',()=>{const result=cleanState(JSON.parse(JSON.stringify(seed)));assert.equal(result.complexes[0].name,'보라매삼성');assert.equal(result.filters.minFloor,3);assert.equal('finance' in result,false);assert.equal('runtime' in result,false);});
test('invalid link and filter backups are rejected',()=>{assert.throws(()=>cleanState({...seed,complexes:[{...seed.complexes[0],complexUrl:'javascript:alert(1)'}]}));assert.throws(()=>cleanState({...seed,filters:{...seed.filters,discountThreshold:9}}));});
