import {firebaseConfig} from './firebase-config.js';
import {PRESALE_CITIES,presaleStatus} from './presale-model.js';
import {seoulDate} from './daily-history.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let feed=null,city='',showEnded=false;
export async function renderPresales(container){
 container.innerHTML='<section class="panel"><h2>경기 남부 분양정보</h2><p>공식 청약홈 공고를 불러오는 중입니다.</p></section>';
 try{
   const response=await fetch(`https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/households/home/feeds/presales`,{signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('분양정보 연결 대기 중입니다. 수집 상태를 확인해주세요.');
   const document=await response.json();
   const parsed=JSON.parse(document.fields.payload.stringValue);
   if(!Array.isArray(parsed.items)||!Number.isFinite(Date.parse(parsed.fetchedAt)))throw Error('분양정보 형식을 확인해주세요.');
   // Navigation may have changed while the request was in flight.
   if(!container.querySelector('h2')?.textContent.includes('경기 남부 분양정보'))return;
   feed=parsed;draw(container);
 }catch(e){if(container.querySelector('h2')?.textContent.includes('경기 남부 분양정보'))container.innerHTML=`<section class="panel"><h2>경기 남부 분양정보</h2><p>${esc(e.message)}</p></section>`;}
}
function draw(container){
 const today=seoulDate(new Date());
 const items=feed.items.filter(i=>(!city||i.city===city)&&(showEnded||presaleStatus(i,today)!=='접수 종료'));
 const stale=Date.now()-Date.parse(feed.fetchedAt)>3*3600000;
 container.innerHTML=`<section class="panel"><h2>경기 남부 분양정보</h2><p>청약홈에 공고된 아파트 분양 · 경기 남부 14개 시</p><p class="label-note">최근 확인 ${esc(new Date(feed.fetchedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))}${stale?' · 업데이트 지연':''} · 모집공고일 ${esc(feed.since)} 이후</p><div class="form-grid"><label class="field">지역<select id="presale-city"><option value="">전체 지역</option>${PRESALE_CITIES.map(c=>`<option value="${c}" ${city===c?'selected':''}>${c}시</option>`).join('')}</select></label><label class="field"><span><input id="presale-ended" type="checkbox" ${showEnded?'checked':''}> 접수 종료 공고 포함</span></label></div><p class="label-note">출처: 한국부동산원 청약홈. LH·GH 별도 공고 및 아직 모집공고가 없는 분양예정 단지는 포함하지 않습니다.</p></section><div class="section-head"><h2>${items.length}개 공고</h2><button class="btn" id="presale-refresh">새로고침</button></div><div class="listing-grid">${items.map(i=>{
 let url='';try{const u=new URL(i.url);if(u.protocol==='https:'&&u.hostname==='www.applyhome.co.kr')url=u.href;}catch{}
 return `<article class="listing"><span class="badge ${presaleStatus(i,today)==='접수 중'?'':'gray'}">${esc(presaleStatus(i,today))} · ${esc(i.city)}시</span><h3>${esc(i.name)}</h3><p class="label-note">${esc(i.address)}</p>${[['공급',`${i.households}세대 · ${i.type}`],['모집공고',i.announced],['접수',`${i.start||'미정'} ~ ${i.end||'미정'}`],['특별공급',i.special],['1순위 · 해당지역',i.first],['2순위 · 해당지역',i.second],['당첨 발표',i.winner],['계약 시작',i.contract]].map(([k,v])=>`<div class="row"><span>${k}</span><b>${esc(v||'공고 확인')}</b></div>`).join('')}<p class="label-note">지역별 접수일·자격 요건은 공식 공고를 확인하세요.</p>${url?`<a class="btn" href="${esc(url)}" target="_blank" rel="noreferrer">청약홈 공고 ↗</a>`:''}</article>`;
 }).join('')||'<section class="panel"><p>선택한 조건에 해당하는 공고가 없습니다.</p></section>'}</div>`;
 container.querySelector('#presale-city').onchange=e=>{city=e.target.value;draw(container);};
 container.querySelector('#presale-ended').onchange=e=>{showEnded=e.target.checked;draw(container);};
 container.querySelector('#presale-refresh').onclick=()=>renderPresales(container);
}
