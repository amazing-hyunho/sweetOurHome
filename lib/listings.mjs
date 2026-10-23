// Only the latest successful batch: retained, unseen ads must not skew prices.
export function summarizeAreaPrices(listings,complexId){
  const collected=listings.filter(l=>l.complexId===complexId&&l.source==='naver-snapshot'&&Number.isFinite(Date.parse(l.sourceObservedAt)));
  const latest=collected.reduce((max,l)=>Math.max(max,Date.parse(l.sourceObservedAt)),0);
  const groups=new Map();
  for(const l of collected){
    if(Date.parse(l.sourceObservedAt)!==latest)continue;
    if(!Number.isFinite(l.area)||l.area<=0||!Number.isFinite(l.price)||l.price<=0)continue;
    const group=groups.get(l.area)||{area:l.area,min:l.price,max:l.price,count:0};
    group.min=Math.min(group.min,l.price);group.max=Math.max(group.max,l.price);group.count++;
    groups.set(l.area,group);
  }
  return {observedAt:collected.length?new Date(latest).toISOString():null,groups:[...groups.values()].sort((a,b)=>a.area-b.area)};
}

// Compare before applying dashboard tabs so a filter cannot promote a higher price.
export function lowestPriceListings(listings){
  const latest=new Map(),minimum=new Map();
  for(const l of listings)if(l.source==='naver-snapshot'&&Number.isFinite(Date.parse(l.sourceObservedAt)))latest.set(l.complexId,Math.max(latest.get(l.complexId)||0,Date.parse(l.sourceObservedAt)));
  const current=listings.filter(l=>Number.isFinite(l.price)&&l.price>0&&Number.isFinite(l.area)&&l.area>0&&(l.source!=='naver-snapshot'||Date.parse(l.sourceObservedAt)===latest.get(l.complexId)));
  const key=l=>JSON.stringify([l.complexId,l.area]);
  for(const l of current)minimum.set(key(l),Math.min(minimum.get(key(l))??Infinity,l.price));
  return current.filter(l=>l.price===minimum.get(key(l)));
}

export function evaluateListing(item, complex, filters, now = new Date()) {
  const cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 6);
  const trades = (item.trades || []).filter(t => !t.cancelled && t.date >= cutoff.toISOString().slice(0,10) && t.date <= now.toISOString().slice(0,10) && Math.abs(t.area - item.area) <= 0.5 && t.floor >= 3);
  const prices = trades.map(t=>t.price).sort((a,b)=>a-b);
  const median = prices.length >= 3 ? (prices[Math.floor((prices.length-1)/2)] + prices[Math.ceil((prices.length-1)/2)]) / 2 : null;
  const discount = median ? (median-item.price)/median : null;
  const targetPrice = (complex?.targets || []).find(t => Math.abs(t.area - item.area) < 0.005)?.price;
  const target = targetPrice > 0 && item.price <= targetPrice;
  const physical = item.area >= filters.minExclusiveAreaM2 && complex?.households >= filters.minHouseholds && item.floor !== null && item.floor >= filters.minFloor;
  const bargain = target || discount !== null && discount >= filters.discountThreshold;
  return { median, discount, tradeCount: prices.length, target, physical, bargain, alertCandidate: physical && bargain };
}
