import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSalePrice,parseVisibleCard,parseVisibleSnapshot} from '../lib/naver-snapshot.mjs';
const card=(floor='17',url='/articles/123')=>({text:`관심매물\n테스트아파트 201동\n매매 12억 3,000\n아파트108㎡ (전용84.85)${floor}/20층동향`,url});
test('Korean sale prices convert to units of ten thousand won',()=>{
  for(const [raw,expected] of [['12억',120000],['12억 3,000',123000],['10억',100000],['9,500',9500],['9,500만',9500]])assert.equal(parseSalePrice(raw),expected);
  assert.throws(()=>parseSalePrice('협의'));assert.throws(()=>parseSalePrice('0억'));
});
test('exact floors and canonical article IDs extracted; middle floors stay unknown',()=>{
  const item=parseVisibleCard(card());assert.equal(item.floor,17);assert.equal(item.area,84.85);assert.equal(item.sourceArticleId,'123');
  const unknown=parseVisibleCard(card('중'));assert.equal(unknown.floor,null);assert.equal(unknown.needsFloorReview,true);
});
test('grouped cards without article links are unresolved and cannot form a complete inventory',()=>{
  const result=parseVisibleSnapshot([card(),card('고',null),{text:'',url:null}],{expectedCount:2});
  assert.equal(result.completeArticleInventory,false);assert.equal(result.summary.unresolvedGroups,1);
  assert.throws(()=>parseVisibleSnapshot([card()],{expectedCount:2}));
});
test('bad URL, duplicate identities and missing fields are rejected',()=>{
  assert.throws(()=>parseVisibleCard(card('17','https://other.example/articles/123')));
  assert.throws(()=>parseVisibleSnapshot([card(),card()]));
  assert.throws(()=>parseVisibleCard({text:'테스트아파트 201동\n매매 협의',url:null}));
});
