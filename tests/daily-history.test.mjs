import test from 'node:test';
import assert from 'node:assert/strict';
import {recordDailyHistory,cleanHistory,renderHistory,aggregateHistory,periodKey} from '../public/daily-history.js';
const url='https://naver.me/test';
const rows=[{area:84.85,price:120000},{area:84.85,price:130000},{area:59.9,price:90000}];
test('Korea dates, last batch replaces same-day extrema and absent areas; older writes ignored',()=>{
 const h=recordDailyHistory(null,url,rows,'2026-10-17T15:10:00Z');
 assert.equal(h.days[0].date,'2026-10-18');
 assert.deepEqual(h.days[0].groups[1],{area:84.85,min:120000,max:130000,count:2});
 const next=recordDailyHistory(h,url,[{area:84.85,price:125000}],'2026-10-18T01:00:00Z');
 assert.equal(next.days.length,1);assert.equal(next.days[0].groups.length,1);assert.equal(next.days[0].groups[0].min,125000);
 assert.deepEqual(recordDailyHistory(next,url,rows,'2026-10-17T16:00:00Z'),next);
 assert.deepEqual(recordDailyHistory(next,url,[],'2026-10-18T02:00:00Z'),next);
});
test('retains separate days, resets changed links and bounds retention to 365 records',()=>{
 let h;
 for(let i=0;i<367;i++)h=recordDailyHistory(h,url,rows,new Date(Date.UTC(2025,0,1+i)).toISOString());
 assert.equal(h.days.length,365);assert.equal(h.days[0].date,'2025-01-03');
 assert.equal(cleanHistory(h,'https://naver.me/other').days.length,0);
 assert.throws(()=>cleanHistory({...h,days:[h.days[0],h.days[0]]},url),/중복/);
});
test('chart renders one-day points and exact-area series; gaps are not connected',()=>{
 const h=recordDailyHistory(null,url,rows,'2026-10-17T15:10:00Z');
 const one=renderHistory(h);assert.match(one,/<circle/);assert.doesNotMatch(one,/NaN|Infinity/);
 const gap=recordDailyHistory(h,url,rows,'2026-10-20T00:00:00Z');
 assert.doesNotMatch(renderHistory(gap),/stroke-width="2"/);
 const consecutive=recordDailyHistory(h,url,rows,'2026-10-19T00:00:00Z');
 assert.match(renderHistory(consecutive),/stroke-width="2"/);
 assert.match(one,/전용 59.9㎡/);assert.match(one,/전용 84.85㎡/);
});

test('weekly and monthly periods use last observed batch across calendar boundaries',()=>{
 assert.equal(periodKey('2026-01-04','week'),'2025-12-29');
 assert.equal(periodKey('2026-01-05','week'),'2026-01-05');
 const history={days:[
  {date:'2025-12-31',groups:[{area:84,min:10,max:20,count:2}]},
  {date:'2026-01-04',groups:[{area:84,min:12,max:18,count:1}]},
  {date:'2026-01-05',groups:[{area:59,min:8,max:9,count:1}]}
 ]};
 const weekly=aggregateHistory(history,'week');
 assert.equal(weekly.length,2);assert.equal(weekly[0].observedDate,'2026-01-04');
 assert.equal(weekly[0].groups[0].min,12);
 const monthly=aggregateHistory(history,'month');
 assert.equal(monthly.length,2);assert.equal(monthly[1].observedDate,'2026-01-05');
 assert.equal(monthly[1].groups[0].area,59);
 assert.match(renderHistory(history,'month'),/월별 마지막 성공 수집/);
});
