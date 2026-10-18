import {mergeSnapshot} from './merge-snapshot.mjs';
import {parseVisibleSnapshot} from './naver-snapshot.mjs';
import {readSharedDocument,commitSharedState} from './shared-state.mjs';

export function validateNaverUrl(value){
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port||!['naver.me','fin.land.naver.com','new.land.naver.com','m.land.naver.com','land.naver.com'].includes(url.hostname))throw Error('HTTPS 네이버 부동산 단지 링크가 필요합니다.');
  return url.href;
}

// The anchor says only "매물 보러가기". Prices and areas are siblings in
// the ArticleCard, while unrelated recent-history links also use /articles/.
export function readRenderedSaleCards(){
  return Array.from(document.querySelectorAll('a[href*="/articles/"]')).flatMap(a=>{
    const card=a.closest('li[class*="ArticleCard-"]');
    if(!card||!card.innerText.includes('매매')||!card.innerText.includes('전용'))return [];
    if(card.querySelectorAll('a[href*="/articles/"]').length!==1)return [];
    return [{text:card.innerText,url:a.href}];
  });
}

// Read rendered, individual sale cards only. Grouped advertisements are not
// given synthetic identities; absence from this partial scan is never deletion.
export async function collectPage(page,url){
  let rateLimited=false;
  let delay=30*60*1000;
  const onResponse=response=>{
    const responseUrl=new URL(response.url());
    if(response.status()===429&&responseUrl.hostname==='fin.land.naver.com'){
      rateLimited=true;
      delay=Math.max(delay,retryDelay(response.headers?.()['retry-after']));
    }
  };
  page.on?.('response',onResponse);
  const checkLimit=()=>{if(rateLimited)throw Error('조회 제한');};
  try{const result=await collectLoadedPage(page,url,checkLimit);checkLimit();return result;}
  catch(error){
    if(rateLimited)throw Object.assign(Error('네이버 조회 제한(HTTP 429)으로 수집을 중단했습니다. 링크 오류가 아니며 기존 결과를 유지합니다.'),{code:'RATE_LIMITED',retryAfterMs:delay});
    throw error;
  }finally{page.off?.('response',onResponse);}
}

export function retryDelay(value,now=Date.now()){
  const seconds=typeof value==='string'&&/^\d+$/.test(value.trim())?Number(value.trim()):NaN;
  const delay=Number.isFinite(seconds)?seconds*1000:typeof value==='string'?Date.parse(value)-now:NaN;
  return Number.isFinite(delay)?Math.max(30*60*1000,delay):30*60*1000;
}

async function collectLoadedPage(page,url,checkLimit){
  await page.goto(validateNaverUrl(url),{waitUntil:'domcontentloaded',timeout:45000});
  checkLimit();
  if(page.url().includes('financial.pstatic.net/404'))throw Error('네이버가 페이지를 찾을 수 없다고 응답했습니다. 단지 링크를 확인하세요.');
  validateNaverUrl(page.url());
  try{
    await page.waitForFunction(()=>location.hostname==='financial.pstatic.net'||Array.from(document.querySelectorAll('a[href*="/articles/"]')).some(a=>a.closest('li[class*="ArticleCard-"]')?.innerText.includes('매매')),{},{timeout:30000});
  }catch{
    if(page.url().includes('financial.pstatic.net/404'))throw Error('PC 수집 브라우저에서 네이버 오류 페이지로 이동했습니다. 링크 자체의 유효성과는 별도로 확인이 필요합니다.');
    throw Error('30초 안에 개별 매매 카드가 표시되지 않았습니다. 기존 결과를 유지합니다.');
  }
  // Client navigation can redirect after DOMContentLoaded.
  if(page.url().includes('financial.pstatic.net/404'))throw Error('PC 수집 브라우저에서 네이버 오류 페이지로 이동했습니다. 링크 자체의 유효성과는 별도로 확인이 필요합니다.');
  validateNaverUrl(page.url());
  const found=new Map();
  let stable=0;
  for(let pass=0;pass<30;pass++){
    checkLimit();
    const rows=await page.evaluate(readRenderedSaleCards);
    const before=found.size;
    for(const row of rows){
      const parsed=parseVisibleSnapshot([row]);
      if(parsed.listings.length)found.set(row.url,row);
    }
    stable=found.size===before?stable+1:0;
    if(stable>=3)break;
    await page.evaluate(()=>{
      for(const e of [document.scrollingElement,...document.querySelectorAll('main,section,div,ul')]){
        if(e&&e.clientHeight>100&&e.scrollHeight>e.clientHeight&&['auto','scroll'].includes(getComputedStyle(e).overflowY))e.scrollTop+=Math.max(e.clientHeight-100,300);
      }
      window.scrollBy(0,window.innerHeight);
    });
    await page.waitForTimeout(1500);
  }
  if(!found.size)throw Error('개별 매매 카드를 확인하지 못했습니다. 기존 결과를 유지합니다.');
  return {observedAt:new Date().toISOString(),rows:[...found.values()]};
}

export async function runCollection({projectId,collect,read=readSharedDocument,commit=commitSharedState,log=console.log,onRateLimit=async()=>{}}){
  const initial=await read(projectId);
  const results=[];
  for(const complex of initial.state.complexes.filter(c=>c.complexUrl&&c.collectionEnabled!==false)){
    const attemptedAt=new Date().toISOString();
    let snapshot,error,rateLimit;
    try{validateNaverUrl(complex.complexUrl);snapshot=await collect(complex.complexUrl);}
    catch(e){error=e.message.slice(0,500);if(e.code==='RATE_LIMITED')rateLimit=Date.now()+e.retryAfterMs;}
    if(rateLimit)await onRateLimit(rateLimit);
    // Re-read after browser work, then CAS. Rebase only on a fresh document.
    for(let attempt=0;attempt<3;attempt++){
      const before=await read(projectId);
      const current=before.state.complexes.find(c=>c.id===complex.id);
      if(!current||current.complexUrl!==complex.complexUrl||!current.collectionEnabled)break;
      let next=before.state,count=0;
      if(!error){
        try{const merged=mergeSnapshot(next,complex.id,snapshot);next=merged.state;count=merged.summary.resolved;if(!count)throw Error('식별 가능한 개별 매물이 없습니다.');}
        catch(e){error=e.message.slice(0,500);next=before.state;}
      }
      const status={attemptedAt,lastSuccessAt:error?current.collection?.lastSuccessAt||null:snapshot.observedAt,status:error?'error':'partial',count:error?current.collection?.count||0:count,error:error||''};
      next={...next,complexes:next.complexes.map(c=>c.id===complex.id?{...c,collection:status}:c)};
      try{await commit(projectId,before,next);results.push({id:complex.id,...status});log(`${complex.name}: ${error||count+'개 개별 매매 갱신 (부분 수집)'}`);break;}
      catch(e){if(e.code!=='CONFLICT'||attempt===2)throw e;}
    }
    if(rateLimit){
      // Include a control result even when this complex was removed meanwhile.
      results.push({status:'cooldown',retryAt:rateLimit});
      break;
    }
  }
  return results;
}
