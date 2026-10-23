import test from 'node:test';
import assert from 'node:assert/strict';
import {presaleCity,presaleStatus,normalizePresale} from '../public/presale-model.js';
import {fetchPresales,publishPresales} from '../lib/presales.mjs';
const row={HOUSE_SECD:'01',RENT_SECD:'0',HOUSE_MANAGE_NO:'1',PBLANC_NO:'2',HOUSE_NM:'테스트',HSSPLY_ADRES:'경기도 화성특례시 동탄구 반송동',RCRIT_PBLANC_DE:'2026-10-21',RCEPT_BGNDE:'2026-10-26',RCEPT_ENDDE:'2026-10-28',PBLANC_URL:'https://www.applyhome.co.kr/ai/test',TOT_SUPLY_HSHLDCO:10};
test('region boundaries include special cities but exclude Gwangju metropolitan and northern Gyeonggi',()=>{
 assert.equal(presaleCity('경기도 화성특례시 동탄구'),'화성');
 assert.equal(presaleCity('경기도 광주시 역동'),'광주');
 assert.equal(presaleCity('광주광역시 동구'),null);
 assert.equal(presaleCity('경기도 남양주시'),null);
 assert.equal(normalizePresale({...row,RENT_SECD:'1'}),null);
 assert.equal(normalizePresale({...row,HOUSE_SECD:'02'}),null);
 assert.throws(()=>normalizePresale({...row,PBLANC_URL:'https://example.com'}));
});
test('status includes opening and closing dates without interpreting unknown schedules as open',()=>{
 const i=normalizePresale(row);
 assert.equal(presaleStatus(i,'2026-10-25'),'접수 예정');assert.equal(presaleStatus(i,'2026-10-26'),'접수 중');
 assert.equal(presaleStatus(i,'2026-10-28'),'접수 중');assert.equal(presaleStatus(i,'2026-10-29'),'접수 종료');
 assert.equal(presaleStatus({...i,start:null},'2026-10-26'),'일정 확인');
});
test('pagination completes before publishing and errors do not expose credentials',async()=>{
 let calls=0;
 const feed=await fetchPresales('SECRET',{fetcher:async()=>({ok:true,json:async()=>({matchCount:2,data:[{...row,PBLANC_NO:String(++calls)}]})})});
 assert.equal(calls,2);assert.equal(feed.items.length,2);
 await assert.rejects(fetchPresales('SECRET',{fetcher:async()=>{throw Error('URL SECRET');}}),e=>!e.message.includes('SECRET'));
 await assert.rejects(fetchPresales('SECRET',{fetcher:async()=>({ok:true,json:async()=>({matchCount:1,data:[]})})}),/누락/);
});
test('Firebase revision conflicts retry without touching main household state',async()=>{
 let reads=0,writes=0;
 await publishPresales('project',{items:[]},async(url,options)=>{
 if(!options?.method){reads++;return {ok:true,json:async()=>({updateTime:'now',fields:{revision:{integerValue:'2'}}})};}
 writes++;const write=JSON.parse(options.body).writes[0];assert.match(write.update.name,/feeds\/presales$/);assert.equal(write.update.fields.revision.integerValue,'3');
 return writes===1?{ok:false,status:409}:{ok:true};
 });assert.equal(reads,2);assert.equal(writes,2);
});
