import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateListing } from '../lib/listings.mjs';
const filters = { minExclusiveAreaM2:59, minHouseholds:400, minFloor:3, discountThreshold:.05 };
const complex = { households:710 };
const date = new Date('2026-10-10');
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
