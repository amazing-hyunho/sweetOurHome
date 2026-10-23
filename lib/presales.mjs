import {normalizePresale} from '../public/presale-model.js';
import {seoulDate} from '../public/daily-history.js';

export async function fetchPresales(serviceKey,{fetcher=fetch,now=new Date()}={}){
 const since=seoulDate(new Date(+now-180*86400000)),rows=[];
 for(let page=1;page<=100;page++){
   const url=new URL('https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail');
   url.search=new URLSearchParams({serviceKey,page:String(page),perPage:'100',returnType:'JSON','cond[SUBSCRPT_AREA_CODE_NM::EQ]':'경기','cond[RCRIT_PBLANC_DE::GTE]':since});
   let response,data;
   try{response=await fetcher(url,{signal:AbortSignal.timeout(20000)});data=await response.json();}catch{throw Error('청약홈 API 연결 실패');}
   if(!response.ok||!Array.isArray(data.data)||!Number.isInteger(data.matchCount)||data.matchCount<0)throw Error(`청약홈 API 응답 오류 (HTTP ${response.status})`);
   rows.push(...data.data);
   if(rows.length>=data.matchCount){
     const items=rows.map(normalizePresale).filter(Boolean);
     if(new Set(items.map(i=>i.id)).size!==items.length)throw Error('청약 공고 중복: 목록 갱신 보류');
     return {source:'한국부동산원 청약홈',since,fetchedAt:now.toISOString(),items:items.sort((a,b)=>(b.announced||'').localeCompare(a.announced||'')||a.id.localeCompare(b.id))};
   }
   if(!data.data.length)throw Error('청약 API 페이지 누락');
 }
 throw Error('청약 API 페이지 한도 초과');
}

const document=project=>`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/households/home/feeds/presales`;
export async function publishPresales(project,feed,fetcher=fetch){
 const payload=JSON.stringify(feed);
 if(payload.length>200000)throw Error('분양정보 저장 용량 초과');
 for(let attempt=0;attempt<3;attempt++){
   const old=await fetcher(document(project),{signal:AbortSignal.timeout(20000)});
   if(!old.ok&&old.status!==404)throw Error(`분양정보 Firebase 읽기 실패 (HTTP ${old.status})`);
   const data=old.ok?await old.json():null;
   const update={name:`projects/${project}/databases/(default)/documents/households/home/feeds/presales`,fields:{payload:{stringValue:payload},revision:{integerValue:String(Number(data?.fields?.revision?.integerValue||0)+1)},updatedBy:{stringValue:'public'}}};
   const response=await fetcher(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:commit`,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({writes:[{update,currentDocument:data?{updateTime:data.updateTime}:{exists:false},updateTransforms:[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}]}]})});
   if(response.ok)return;
   if(![409,412].includes(response.status)||attempt===2)throw Error(`분양정보 Firebase 저장 실패 (HTTP ${response.status})`);
 }
}
