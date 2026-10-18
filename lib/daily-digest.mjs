import {cleanState} from '../public/storage.js';
import {seoulDate} from '../public/daily-history.js';

export function noonWindow(now){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 return parts.hour==='12'&&Number(parts.minute)<30;
}
export function buildDigest(input,previous={},now=new Date()){
 const state=cleanState(input),next={},blocks=[];let skipped=0;
 const money=n=>`${(n/10000).toLocaleString('ko-KR',{maximumFractionDigits:4})}억`;
 for(const c of state.complexes){
   const old=previous[c.id]?.url===c.complexUrl?previous[c.id]:null;
   if(old)next[c.id]=old;
   const at=c.collection?.lastSuccessAt,age=now-Date.parse(at);
   if(!c.collectionEnabled||c.collection?.status!=='partial'||!(age>=0&&age<=30*60000)){skipped++;continue;}
   const rows=state.listings.filter(l=>l.complexId===c.id&&l.source==='naver-snapshot'&&l.sourceObservedAt===at);
   if(!rows.length){skipped++;continue;}
   next[c.id]={url:c.complexUrl,at,rows:rows.map(l=>({id:l.id,area:l.area,price:l.price,label:l.label}))};
   if(!old){blocks.push(`${c.name}\n새 관심 단지: 개별 매물 ${rows.length}건 첫 관찰`);continue;}
   const oldById=new Map(old.rows.map(l=>[l.id,l])),newById=new Map(rows.map(l=>[l.id,l]));
   const added=rows.filter(l=>!oldById.has(l.id));
   const absent=old.rows.filter(l=>!newById.has(l.id));
   const changed=rows.filter(l=>oldById.has(l.id)&&oldById.get(l.id).price!==l.price);
   if(!added.length&&!absent.length&&!changed.length)continue;
   const lines=[c.name,`지난 비교 ${new Date(old.at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}`,`호가 변경 ${changed.length}건 · 새로 관찰 ${added.length}건 · 이번 수집 미확인 ${absent.length}건`];
   for(const l of changed.slice(0,3))lines.push(`${l.area}㎡ ${l.label}: ${money(oldById.get(l.id).price)} → ${money(l.price)}`);
   if(changed.length>3)lines.push(`외 호가 변경 ${changed.length-3}건`);
   blocks.push(lines.join('\n'));
 }
 const text=blocks.length?[`[우리집] ${seoulDate(now)} 낮 12시 매물 변동`,...blocks,skipped?`최신 수집이 없는 단지 ${skipped}곳은 비교 보류했습니다.`:'','부분 수집 기준입니다. 미확인은 삭제·거래 완료를 뜻하지 않습니다.','https://amazing-hyunho.github.io/sweetOurHome/'].filter(Boolean).join('\n\n'):'';
 return {next,text:text.length>3900?text.slice(0,3700)+'\n\n이하 상세 생략 · 전체 현황: https://amazing-hyunho.github.io/sweetOurHome/':text,changedComplexes:blocks.length,skipped};
}
