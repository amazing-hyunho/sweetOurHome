const KEY='sweetOurHome:v1';
export const browserMode=!(globalThis.location?.hostname==='127.0.0.1' && globalThis.location?.port==='4310');
export function cleanState(input){
  if(!input||!Array.isArray(input.complexes)||!Array.isArray(input.regions)||!Array.isArray(input.listings)||!input.filters)throw Error('백업 형식을 확인해주세요.');
  if(input.complexes.length>500||input.listings.length>5000||input.regions.length>500)throw Error('기록 수가 너무 많습니다.');
  const num=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
  const text=x=>typeof x==='string'&&x.length<=500;
  const link=x=>!x||typeof x==='string'&&x.length<=3000&&/^https?:\/\//i.test(x);
  const filters=input.filters;
  if(!num(filters.minExclusiveAreaM2,1,1000)||!num(filters.minHouseholds,1,100000)||!num(filters.minFloor,1,200)||!num(filters.discountThreshold,0,1))throw Error('매물 조건을 확인해주세요.');
  if(input.regions.some(x=>!text(x)))throw Error('지역 이름을 확인해주세요.');
  const notes=value=>{
    if(value==null)return [];
    if(!Array.isArray(value)||value.length>200)throw Error('메모는 항목당 200개까지 저장할 수 있어요.');
    const result=value.map(n=>{
      if(!text(n.id)||!n.id||typeof n.body!=='string'||!n.body.trim()||n.body.length>3000||!text(n.author)||!text(n.createdAt)||!text(n.updatedAt))throw Error('메모 내용을 확인해주세요.');
      return {id:n.id,body:n.body,author:n.author,createdAt:n.createdAt,updatedAt:n.updatedAt};
    });
    if(new Set(result.map(n=>n.id)).size!==result.length)throw Error('메모 ID가 중복됩니다.');
    return result;
  };
  const complexes=input.complexes.map(c=>{
    if(!text(c.id)||!text(c.name)||!c.name.trim()||!num(c.households,0,100000)||!link(c.complexUrl)||c.targetPrice!=null&&!num(c.targetPrice,0,10000000))throw Error('단지 정보를 확인해주세요.');
    const targets=c.targets??[];
    if(!Array.isArray(targets)||targets.length>100||targets.some(t=>!num(t.area,1,1000)||!num(t.price,1,10000000))||new Set(targets.map(t=>t.area)).size!==targets.length)throw Error('면적별 목표 가격을 확인해주세요.');
    return {notes:notes(c.notes),targets:targets.map(t=>({area:t.area,price:t.price})),id:c.id,name:c.name,address:text(c.address)?c.address:'',households:c.households,approvalDate:text(c.approvalDate)?c.approvalDate:'',complexUrl:c.complexUrl||'',targetPrice:c.targetPrice||0,source:c.source==='naver'?'naver':'manual',observedDate:text(c.observedDate)?c.observedDate:'',collectionEnabled:false};
  });
  if(new Set(complexes.map(c=>c.id)).size!==complexes.length)throw Error('단지 ID가 중복됩니다.');
  const listings=input.listings.map(l=>{
    if(!text(l.id)||!text(l.label)||!complexes.some(c=>c.id===l.complexId)||!num(l.price,1,10000000)||!num(l.area,1,1000)||l.floor!==null&&!num(l.floor,1,200)||!link(l.url)||!text(l.observedDate)||!Array.isArray(l.trades)||l.trades.length>1000)throw Error('매물 정보를 확인해주세요.');
    const trades=l.trades.map(t=>{if(!num(t.price,1,10000000)||!num(t.area,1,1000)||!num(t.floor,1,200)||!/^\d{4}-\d{2}-\d{2}$/.test(t.date))throw Error('비교 거래를 확인해주세요.');return {date:t.date,price:t.price,area:t.area,floor:t.floor,cancelled:!!t.cancelled};});
    if(l.sourceObservedAt!=null&&(typeof l.sourceObservedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(l.sourceObservedAt)||!Number.isFinite(Date.parse(l.sourceObservedAt))))throw Error('매물 관찰 시각을 확인해주세요.');
    return {source:l.source==='naver-snapshot'?'naver-snapshot':'manual',sourceObservedAt:l.sourceObservedAt||null,notes:notes(l.notes),pinned:l.pinned!==false,id:l.id,label:l.label,complexId:l.complexId,price:l.price,area:l.area,floor:l.floor,url:l.url||'',observedDate:l.observedDate,trades};
  });
  if(new Set(listings.map(l=>l.id)).size!==listings.length)throw Error('매물 ID가 중복됩니다.');
  return {schemaVersion:2,complexes,regions:input.regions,filters:{tradeType:'sale',propertyType:'apartment',minExclusiveAreaM2:filters.minExclusiveAreaM2,minHouseholds:filters.minHouseholds,minFloor:filters.minFloor,discountThreshold:filters.discountThreshold,unknownFloorAction:'review_without_alert'},listings,alertSettings:{enabled:false}};
}
let cloud=null;
export function connectCloud(adapter){cloud=adapter;}
export async function loadState(){
  if(cloud)return cloud.load();
  if(!browserMode){const r=await fetch('/api/state');if(!r.ok)throw Error('설정을 불러오지 못했어요.');return r.json();}
  const existing=localStorage.getItem(KEY);
  if(existing)return {...cleanState(JSON.parse(existing)),runtime:{browserStorage:true,collectionEnabled:false,telegramEnabled:false}};
  const r=await fetch('./seed.json');if(!r.ok)throw Error('초기 설정을 불러오지 못했어요.');
  return {...cleanState(await r.json()),runtime:{browserStorage:true,collectionEnabled:false,telegramEnabled:false}};
}
export async function saveState(input){
  const next=cleanState(input);
  if(cloud)return cloud.save(next,input.runtime?.revision);
  if(browserMode){localStorage.setItem(KEY,JSON.stringify(next));return {...next,runtime:{browserStorage:true,collectionEnabled:false,telegramEnabled:false}};}
  const r=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)});const data=await r.json();if(!r.ok)throw Error(data.error||'저장 실패');return {...next,runtime:input.runtime};
}
