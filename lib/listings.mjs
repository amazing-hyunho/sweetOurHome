export function evaluateListing(item, complex, filters, now = new Date()) {
  const cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 6);
  const trades = (item.trades || []).filter(t => !t.cancelled && t.date >= cutoff.toISOString().slice(0,10) && t.date <= now.toISOString().slice(0,10) && Math.abs(t.area - item.area) <= 0.5 && t.floor >= 3);
  const prices = trades.map(t=>t.price).sort((a,b)=>a-b);
  const median = prices.length >= 3 ? (prices[Math.floor((prices.length-1)/2)] + prices[Math.ceil((prices.length-1)/2)]) / 2 : null;
  const discount = median ? (median-item.price)/median : null;
  const target = complex?.targetPrice > 0 && item.price <= complex.targetPrice;
  const physical = item.area >= filters.minExclusiveAreaM2 && complex?.households >= filters.minHouseholds && item.floor !== null && item.floor >= filters.minFloor;
  const bargain = target || discount !== null && discount >= filters.discountThreshold;
  return { median, discount, tradeCount: prices.length, target, physical, bargain, alertCandidate: physical && bargain };
}
