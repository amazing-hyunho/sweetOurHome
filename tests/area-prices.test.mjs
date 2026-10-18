import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeAreaPrices} from '../lib/listings.mjs';
const item=(area,price,extra={})=>({complexId:'c',source:'naver-snapshot',sourceObservedAt:'2026-10-18T00:00:00Z',area,price,...extra});
test('area prices group exact exclusive areas, sort numerically, include unknown floors',()=>{
  const result=summarizeAreaPrices([item(84.85,120000),item(59.93,90000),item(84.85,112000,{floor:null}),item(84.99,125000)],'c');
  assert.deepEqual(result.groups,[{area:59.93,min:90000,max:90000,count:1},{area:84.85,min:112000,max:120000,count:2},{area:84.99,min:125000,max:125000,count:1}]);
});
test('old retained ads, manual entries and other complexes cannot skew latest batch',()=>{
  const rows=[item(84.85,120000),item(84.85,50000,{sourceObservedAt:'2026-10-17T00:00:00Z'}),item(59.93,80000,{sourceObservedAt:'2026-10-17T00:00:00Z'}),item(84.85,1,{source:'manual'}),item(84.85,999999,{complexId:'other'})];
  assert.deepEqual(summarizeAreaPrices(rows,'c').groups,[{area:84.85,min:120000,max:120000,count:1}]);
  assert.deepEqual(summarizeAreaPrices(rows,'missing'),{observedAt:null,groups:[]});
});
