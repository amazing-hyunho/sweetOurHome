import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateListing,lowestPriceListings } from '../lib/listings.mjs';
const filters = { minExclusiveAreaM2:59, minHouseholds:400, minFloor:3, discountThreshold:.05 };
const complex = { households:710 };
const date = new Date('2026-10-10');
test('dashboard keeps ties per complex and area and ignores older collection batches',()=>{
  const row=(id,complexId,area,price,at='2026-10-23T01:00:00Z')=>({id,complexId,area,price,source:'naver-snapshot',sourceObservedAt:at});
  const rows=[row('old','a',84,1,'2026-10-22T01:00:00Z'),row('one','a',84,100),row('tie','a',84,100),row('high','a',84,110),row('small','a',59,80),row('other','b',84,120)];
  assert.deepEqual(lowestPriceListings(rows).map(l=>l.id),['one','tie','small','other']);
  assert.equal(rows.length,6);
  assert.deepEqual(lowestPriceListings([]),[]);
});
const trades = [
  {date:'2026-08-01',price:70000,area:84.99,floor:5},
  {date:'2026-09-01',price:71000,area:84.99,floor:8},
  {date:'2026-09-10',price:69000,area:84.99,floor:10},
  {date:'2026-09-20',price:90000,area:84.99,floor:8,cancelled:true},
  {date:'2025-01-01',price:30000,area:84.99,floor:8}
];
test('candidate depends on property and price, without financial inputs',()=>{
  const e=evaluateListing({price:60000,area:84.99,floor:3,trades},complex,filters,date);
  assert.equal(e.alertCandidate,true); assert.equal(e.median,70000); assert.equal(e.tradeCount,3);
});
test('unknown floors do not qualify',()=>assert.equal(evaluateListing({price:60000,area:84.99,floor:null,trades},complex,filters,date).alertCandidate,false));
test('target price works without comparable transactions',()=>assert.equal(evaluateListing({price:60000,area:84.99,floor:5,trades:[]},{...complex,targets:[{area:84.99,price:61000}]},filters,date).alertCandidate,true));
test('insufficient comparables do not qualify without a target',()=>assert.equal(evaluateListing({price:60000,area:84.99,floor:5,trades:trades.slice(0,2)},complex,filters,date).alertCandidate,false));

test('target for another area and legacy unscoped target do not trigger',()=>{
  const item={price:60000,area:59.94,floor:5,trades:[]};
  assert.equal(evaluateListing(item,{...complex,targets:[{area:84.99,price:110000}]},filters,date).alertCandidate,false);
  assert.equal(evaluateListing(item,{...complex,targetPrice:110000},filters,date).alertCandidate,false);
});
