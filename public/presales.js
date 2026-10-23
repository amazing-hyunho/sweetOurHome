import {firebaseConfig} from './firebase-config.js';
import {PRESALE_CITIES,presaleStatus} from './presale-model.js';
import {seoulDate} from './daily-history.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let feed=null,city='',showEnded=false;
const defaults={getFavorites:()=>[],toggleFavorite:async()=>{},clearFavorites:async()=>{},onError:()=>{}};
async function loadFeed(){
 const response=await fetch(`https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/households/home/feeds/presales`,{signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('분양정보 연결 대기 중입니다. 수집 상태를 확인해주세요.');
 const document=await response.json(),parsed=JSON.parse(document.fields.payload.stringValue);
 if(!Array.isArray(parsed.items)||!Number.isFinite(Date.parse(parsed.fetchedAt)))throw Error('분양정보 형식을 확인해주세요.');
 return parsed;
}
function bindFavorites(container,options,redraw){
 container.querySelectorAll('[data-presale-favorite]').forEach(button=>button.onclick=async()=>{
  button.disabled=true;try{await options.toggleFavorite(button.dataset.presaleFavorite);if(button.isConnected&&container.isConnected)redraw();}catch(e){options.onError(e.message);button.disabled=false;}
 });
}
function cards(items,options){return items.map(i=>{
 let url='';try{const u=new URL(i.url);if(u.protocol==='https:'&&u.hostname==='www.applyhome.co.kr')url=u.href;}catch{}
 const selected=options.getFavorites().includes(i.id);
 return `<article class="listing"><div class="listing-top"><span class="badge ${presaleStatus(i,seoulDate(new Date()))==='접수 중'?'':'gray'}">${esc(presaleStatus(i,seoulDate(new Date())))} · ${esc(i.city)}시</span><button class="btn small" aria-label="${esc(i.name)} 선호" aria-pressed="${selected}" data-presale-favorite="${esc(i.id)}">${selected?'★ 선호 해제':'☆ 선호하기'}</button></div><h3>${esc(i.name)}</h3><p class="label-note">${esc(i.address)}</p>${[['공급',`${i.households}세대 · ${i.type}`],['모집공고',i.announced],['접수',`${i.start||'미정'} ~ ${i.end||'미정'}`],['특별공급',i.special],['1순위 · 해당지역',i.first],['2순위 · 해당지역',i.second],['당첨 발표',i.winner],['계약 시작',i.contract]].map(([k,v])=>`<div class="row"><span>${k}</span><b>${esc(v||'공고 확인')}</b></div>`).join('')}<p class="label-note">지역별 접수일·자격 요건은 공식 공고를 확인하세요.</p>${url?`<a class="btn" href="${esc(url)}" target="_blank" rel="noreferrer">청약홈 공고 ↗</a>`:''}</article>`;
 }).join('');}
export async function renderFavoritePresales(container,options=defaults){
 const ids=options.getFavorites();
 container.innerHTML='<div class="section-head"><div><h2>선호하는 경기 남부 분양</h2><p>경기 남부 분양 메뉴에서 ☆ 선호하기를 눌러 추가하세요. 공동 목록에 저장됩니다.</p></div></div><div class="favorite-presale-list"></div>';
 const target=container.querySelector('.favorite-presale-list');
 if(!ids.length){target.innerHTML='<section class="panel"><p>아직 선호하는 분양 공고가 없어요.</p></section>';return;}
 target.textContent='선호 공고를 불러오는 중입니다.';
 try{const data=await loadFeed();if(!container.isConnected)return;const items=data.items.filter(i=>ids.includes(i.id));const missing=ids.length-items.length;
 target.innerHTML=`<p class="label-note">최근 확인 ${esc(new Date(data.fetchedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))} · 접수 종료 공고도 선호 해제 전까지 표시${missing?` · 현재 수집 범위 밖 공고 ${missing}건`:''}</p><div class="listing-grid">${cards(items,options)}</div>${missing?'<p class="label-note">수집 범위를 벗어난 공고는 경기 남부 분양의 선호 목록 초기화로 정리할 수 있어요.</p>':''}`;
 bindFavorites(container,options,()=>renderFavoritePresales(container,options));
 }catch(e){if(container.isConnected)target.textContent=e.message;}
}
export async function renderPresales(container,options=defaults){
 container.innerHTML='<section class="panel"><h2>경기 남부 분양정보</h2><p>공식 청약홈 공고를 불러오는 중입니다.</p></section>';
 try{
   const parsed=await loadFeed();
   // Navigation may have changed while the request was in flight.
   if(!container.querySelector('h2')?.textContent.includes('경기 남부 분양정보'))return;
   feed=parsed;draw(container,options);
 }catch(e){if(container.querySelector('h2')?.textContent.includes('경기 남부 분양정보'))container.innerHTML=`<section class="panel"><h2>경기 남부 분양정보</h2><p>${esc(e.message)}</p></section>`;}
}
function draw(container,options){
 const today=seoulDate(new Date());
 const items=feed.items.filter(i=>(!city||i.city===city)&&(showEnded||presaleStatus(i,today)!=='접수 종료'));
 const stale=Date.now()-Date.parse(feed.fetchedAt)>3*3600000;
 container.innerHTML=`<section class="panel"><h2>경기 남부 분양정보</h2><p>청약홈에 공고된 아파트 분양 · 경기 남부 14개 시</p><p class="label-note">최근 확인 ${esc(new Date(feed.fetchedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))}${stale?' · 업데이트 지연':''} · 모집공고일 ${esc(feed.since)} 이후</p><div class="form-grid"><label class="field">지역<select id="presale-city"><option value="">전체 지역</option>${PRESALE_CITIES.map(c=>`<option value="${c}" ${city===c?'selected':''}>${c}시</option>`).join('')}</select></label><label class="field"><span><input id="presale-ended" type="checkbox" ${showEnded?'checked':''}> 접수 종료 공고 포함</span></label></div><p class="label-note">출처: 한국부동산원 청약홈. LH·GH 별도 공고 및 아직 모집공고가 없는 분양예정 단지는 포함하지 않습니다.</p></section><div class="section-head"><h2>${items.length}개 공고</h2><div class="actions"><button class="btn" id="presale-clear">선호 목록 초기화</button><button class="btn" id="presale-refresh">새로고침</button></div></div><div class="listing-grid">${cards(items,options)||'<section class="panel"><p>선택한 조건에 해당하는 공고가 없습니다.</p></section>'}</div>`;
 bindFavorites(container,options,()=>draw(container,options));
 container.querySelector('#presale-city').onchange=e=>{city=e.target.value;draw(container,options);};
 container.querySelector('#presale-ended').onchange=e=>{showEnded=e.target.checked;draw(container,options);};
 container.querySelector('#presale-clear').onclick=async()=>{if(!options.getFavorites().length)return;if(!confirm('분양 선호 목록을 모두 해제할까요?'))return;try{await options.clearFavorites();draw(container,options);}catch(e){options.onError(e.message);}};
 container.querySelector('#presale-refresh').onclick=()=>renderPresales(container,options);
}
