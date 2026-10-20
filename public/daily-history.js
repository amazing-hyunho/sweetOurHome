const seoulFormatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'});
export const seoulDate=value=>seoulFormatter.format(new Date(value));

export function cleanHistory(history,url){
  if(history==null||history.url!==url)return {url,days:[]};
  if(!Array.isArray(history.days)||history.days.length>365)throw Error('일별 호가 기록 형식을 확인해주세요.');
  const days=history.days.map(d=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date)||!Number.isFinite(Date.parse(d.observedAt))||seoulDate(d.observedAt)!==d.date||!Array.isArray(d.groups)||d.groups.length>100)throw Error('일별 호가 날짜를 확인해주세요.');
    const groups=d.groups.map(g=>{
      if(![g.area,g.min,g.max,g.count].every(Number.isFinite)||g.area<1||g.area>1000||g.min<1||g.max<g.min||g.max>10000000||!Number.isInteger(g.count)||g.count<1||g.count>5000)throw Error('일별 호가 금액을 확인해주세요.');
      return {area:g.area,min:g.min,max:g.max,count:g.count};
    }).sort((a,b)=>a.area-b.area);
    if(new Set(groups.map(g=>g.area)).size!==groups.length)throw Error('일별 호가 면적이 중복됩니다.');
    return {date:d.date,observedAt:d.observedAt,groups};
  }).sort((a,b)=>a.date.localeCompare(b.date));
  if(new Set(days.map(d=>d.date)).size!==days.length)throw Error('일별 호가 날짜가 중복됩니다.');
  return {url,days};
}

// Each day represents the last successful observed batch, not intraday extrema.
export function recordDailyHistory(history,url,listings,observedAt){
  const current=cleanHistory(history,url),date=seoulDate(observedAt);
  const previous=current.days.find(d=>d.date===date);
  if(previous&&Date.parse(previous.observedAt)>Date.parse(observedAt))return current;
  const groups=new Map();
  for(const l of listings){
    const g=groups.get(l.area)||{area:l.area,min:l.price,max:l.price,count:0};
    g.min=Math.min(g.min,l.price);g.max=Math.max(g.max,l.price);g.count++;groups.set(l.area,g);
  }
  if(!groups.size)return current;
  const days=[...current.days.filter(d=>d.date!==date),{date,observedAt,groups:[...groups.values()]}].sort((a,b)=>a.date.localeCompare(b.date)).slice(-365);
  return cleanHistory({url,days},url);
}

export function periodKey(date,period){
  if(period==='month')return date.slice(0,7)+'-01';
  if(period==='week'){
    const d=new Date(date+'T00:00:00Z');
    d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
    return d.toISOString().slice(0,10);
  }
  return date;
}
export function aggregateHistory(history,period='day'){
  const groups=new Map();
  for(const day of [...(history?.days||[])].sort((a,b)=>a.date.localeCompare(b.date))){
    const key=periodKey(day.date,period);
    groups.set(key,{...day,date:key,observedDate:day.date});
  }
  return [...groups.values()];
}
function adjacent(a,b,period){
  if(period==='month'){
    const d=new Date(a+'T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);
    return d.toISOString().slice(0,10)===b;
  }
  return Date.parse(b)-Date.parse(a)===(period==='week'?7:1)*86400000;
}
export function renderHistory(history,period='day'){
  if(!['day','week','month'].includes(period))period='day';
  const label={day:'일',week:'주',month:'월'}[period];
  const controls=`<div class="tabs" aria-label="호가 그래프 단위">${[['day','일단위'],['week','주단위'],['month','월단위']].map(([id,text])=>`<button type="button" class="chip ${id===period?'active':''}" data-history-period="${id}" aria-pressed="${id===period}">${text}</button>`).join('')}</div>`;
  const days=aggregateHistory(history,period);
  if(!days.length)return `<section class="price-history"><h3>호가 추이</h3>${controls}<p class="muted">첫 수집 성공부터 날짜별 호가가 쌓입니다.</p></section>`;
  const areas=[...new Set(days.flatMap(d=>d.groups.map(g=>g.area)))].sort((a,b)=>a-b);
  const charts=areas.map(area=>{
    const points=days.flatMap(d=>{const g=d.groups.find(g=>g.area===area);return g?[{...g,date:d.date,observedDate:d.observedDate}]:[];});
    const start=Date.parse(days[0].date),end=Date.parse(days.at(-1).date);
    const lo=Math.min(...points.map(p=>p.min)),hi=Math.max(...points.map(p=>p.max));
    const pad=Math.max((hi-lo)*.15,1000),bottom=Math.max(0,lo-pad),top=hi+pad;
    const x=p=>end===start?270:58+(Date.parse(p.date)-start)/(end-start)*434;
    const y=v=>170-(v-bottom)/(top-bottom)*140;
    const value=v=>(v/10000).toLocaleString('ko-KR',{maximumFractionDigits:3});
    const series=(key,color)=>points.map((p,i)=>{
      const prev=points[i-1];
      // Missing collection days are gaps, never fabricated straight-line data.
      const line=prev&&adjacent(prev.date,p.date,period)?`<line x1="${x(prev)}" y1="${y(prev[key])}" x2="${x(p)}" y2="${y(p[key])}" stroke="${color}" stroke-width="2"/>`:'';
      return `${line}<circle cx="${x(p)}" cy="${y(p[key])}" r="4" fill="${color}"><title>${p.date} 기준 · 실제 수집 ${p.observedDate} · ${key==='min'?'최저':'최고'} ${value(p[key])}억 · ${p.count}건</title></circle>`;
    }).join('');
    return `<div class="history-area"><h4>전용 ${area}㎡</h4><svg viewBox="0 0 520 215" role="img" aria-label="전용 ${area}제곱미터 ${label}별 최저 최고 호가 그래프"><text x="8" y="16">억원</text>${[bottom,(bottom+top)/2,top].map(v=>`<line x1="58" y1="${y(v)}" x2="492" y2="${y(v)}" stroke="#e5e7eb"/><text x="50" y="${y(v)+4}" text-anchor="end">${value(v)}</text>`).join('')}${series('max','#b45309')}${series('min','#16796b')}<text x="58" y="198">${days[0].date}</text><text x="492" y="198" text-anchor="end">${end===start?'':days.at(-1).date}</text></svg><details><summary>${label}별 가격 · ${points.length}개 기간</summary><div class="area-table-wrap"><table class="area-table"><thead><tr><th>기간 시작 / 수집일</th><th>최저</th><th>최고</th><th>매물</th></tr></thead><tbody>${points.slice().reverse().map(p=>`<tr><th>${p.date}${period==='day'?'':`<br><small>${p.observedDate} 수집</small>`}</th><td>${value(p.min)}억</td><td>${value(p.max)}억</td><td>${p.count}건</td></tr>`).join('')}</tbody></table></div></details></div>`;
  }).join('');
  return `<section class="price-history"><h3>호가 추이</h3>${controls}<p class="history-legend"><span>● 최저 호가</span><span>● 최고 호가</span></p><p class="label-note">한국시간 · ${label}별 마지막 성공 수집 기준${period==='week'?' (월요일~일요일)':''} · 최근 365개 기록일 보관. 진행 중인 기간은 수집 때마다 갱신됩니다. 기록이 없는 기간은 비워둡니다.</p>${charts}<p class="label-note">수집된 개별 매물의 호가이며 실거래가가 아닙니다. 매물 구성 변화로도 가격 범위가 달라질 수 있어요.</p></section>`;
}
