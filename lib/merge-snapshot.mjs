import {cleanState} from '#storage';
import {parseVisibleSnapshot} from './naver-snapshot.mjs';

// A partial snapshot can upsert identified articles, but never remove listings.
// Group cards without an article ID are reported and skipped.
export function mergeSnapshot(input,complexId,snapshot,{expectedComplexName}={}){
  const state=cleanState(input);
  const complex=state.complexes.find(c=>c.id===complexId);
  if(!complex)throw Error('등록된 관심 단지를 선택해주세요.');
  if(typeof snapshot.observedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(snapshot.observedAt)||!Number.isFinite(Date.parse(snapshot.observedAt)))throw Error('스냅샷의 실제 관찰 시각이 필요합니다.');
  if(Date.parse(snapshot.observedAt)>Date.now()+60000)throw Error('미래 관찰 시각은 사용할 수 없습니다.');
  const observedDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(snapshot.observedAt));
  const parsed=parseVisibleSnapshot(snapshot.rows,{expectedCount:snapshot.expectedCount});
  if(!parsed.listings.length)throw Error('빈 스냅샷은 반영하지 않습니다. 로딩 완료 여부를 확인하세요.');
  if(parsed.listings.some(l=>l.complexName!==(expectedComplexName??complex.name)))throw Error('선택한 단지와 스냅샷 단지명이 다릅니다.');
  const stats={added:0,updated:0,unchanged:0,skippedGroups:parsed.summary.unresolvedGroups};
  const listings=[...state.listings];
  for(const item of parsed.listings){
    if(!item.identityResolved)continue;
    // Match a manual record by article URL before assigning a stable source ID.
    const matches=listings.map((l,i)=>({l,i})).filter(({l})=>{
      if(l.id===`naver:${item.sourceArticleId}`)return true;
      try{const u=new URL(l.url);return u.origin==='https://fin.land.naver.com'&&u.pathname===`/articles/${item.sourceArticleId}`;}catch{return false;}
    });
    if(matches.length>1)throw Error('같은 매물 링크의 기존 기록이 중복됩니다. 먼저 정리해주세요.');
    const previous=matches[0]?.l;
    if(previous&&previous.complexId!==complexId)throw Error('매물 ID가 다른 단지에 이미 연결돼 있습니다.');
    if(previous?.sourceObservedAt&&Date.parse(previous.sourceObservedAt)>Date.parse(snapshot.observedAt))throw Error('기존 기록보다 오래된 스냅샷입니다. 최신 값을 확인해주세요.');
    if(previous?.observedDate>observedDate)throw Error('기존 기록보다 오래된 스냅샷입니다. 최신 값을 확인해주세요.');
    const next={
      ...(previous||{}),id:previous?.id||`naver:${item.sourceArticleId}`,complexId,
      label:previous?.label||item.building,price:item.price,area:item.area,floor:item.floor,
      url:item.url,observedDate,source:'naver-snapshot',sourceObservedAt:snapshot.observedAt,trades:previous?.trades||[],notes:previous?.notes||[],
      pinned:previous?previous.pinned:false
    };
    if(previous){
      const changed=JSON.stringify(previous)!==JSON.stringify(next);
      listings[matches[0].i]=next;stats[changed?'updated':'unchanged']++;
    }else{listings.push(next);stats.added++;}
  }
  return {state:cleanState({...state,listings}),stats,summary:parsed.summary};
}
