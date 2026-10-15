import { DatabaseSync } from 'node:sqlite';
import { cleanState } from '../public/storage.js';
import { evaluateListing } from './listings.mjs';

export function decodeValue(value) {
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k,v])=>[k,decodeValue(v)]));
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  throw Error('지원하지 않는 Firebase 데이터 형식');
}

export async function readSharedState(projectId, fetcher=fetch) {
  if(!/^[a-z0-9-]+$/.test(projectId))throw Error('Firebase 프로젝트 ID 확인 필요');
  const url=`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/households/home`;
  const response=await fetcher(url,{signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error(response.status===403?'Firebase 접근 거부: 공개 규칙 게시 여부를 확인하세요.':response.status===404?'공동 목록이 없습니다. 웹앱에서 단지를 먼저 저장하세요.':`Firebase 조회 실패 (HTTP ${response.status})`);
  const data=await response.json();
  if(!data.fields?.state)throw Error('공동 목록 응답에 state가 없습니다.');
  return cleanState(decodeValue(data.fields.state));
}

export class Observer {
  constructor(filename) {
    this.db=new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS listings(id TEXT PRIMARY KEY,price REAL NOT NULL,candidate INTEGER NOT NULL,active INTEGER NOT NULL,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS history(seq INTEGER PRIMARY KEY,id TEXT NOT NULL,at TEXT NOT NULL,kind TEXT NOT NULL,price REAL NOT NULL);
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY,id TEXT NOT NULL,at TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending');`);
  }
  close(){this.db.close();}
  setMeta(key,value){this.db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run(key,value);}
  status(){return Object.fromEntries(this.db.prepare('SELECT * FROM meta').all().map(r=>[r.key,r.value]));}
  failure(message,now=new Date()){this.setMeta('lastError',message);this.setMeta('lastAttempt',now.toISOString());}
  observe(input,now=new Date()) {
    // Validate the whole snapshot before any mutation. An unavailable source is
    // never an empty successful snapshot.
    const state=cleanState(input), at=now.toISOString();
    const changes=[];
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const initial=!this.status().initialized;
      const previous=new Map(this.db.prepare('SELECT * FROM listings').all().map(r=>[r.id,r]));
      for(const item of state.listings){
        const complex=state.complexes.find(c=>c.id===item.complexId);
        const evaluation=evaluateListing(item,complex,state.filters,now);
        const old=previous.get(item.id);
        const kind=!old?'new':!old.active?'returned':old.price!==item.price?'price':null;
        if(kind){this.db.prepare('INSERT INTO history(id,at,kind,price) VALUES (?,?,?,?)').run(item.id,at,kind,item.price);changes.push({id:item.id,kind});}
        const reasons=[];
        if(!initial && evaluation.alertCandidate && (!old||!old.active||!old.candidate||item.price<old.price))reasons.push('급매 후보');
        if(!initial && old?.active && item.pinned && evaluation.physical && item.price<old.price)reasons.push('찜한 매물 가격 인하');
        if(reasons.length){
          const event={id:item.id,name:complex.name,label:item.label,area:item.area,floor:item.floor,price:item.price,previousPrice:old?.price??null,url:item.url,reasons,source:'공동 목록 입력값'};
          this.db.prepare('INSERT INTO events(id,at,payload) VALUES (?,?,?)').run(item.id,at,JSON.stringify(event));
        }
        this.db.prepare('INSERT OR REPLACE INTO listings VALUES (?,?,?,?,?)').run(item.id,item.price,Number(evaluation.alertCandidate),1,JSON.stringify(item));
        // Edits to pins, floors, targets or names can invalidate queued alerts
        // even when the price has not changed since the previous observation.
        for(const queued of this.db.prepare("SELECT seq,payload FROM events WHERE id=? AND status='pending'").all(item.id)){
          const event=JSON.parse(queued.payload);
          const reasons=event.reasons.filter(reason=>reason==='급매 후보'?evaluation.alertCandidate:item.pinned&&evaluation.physical&&item.price<event.previousPrice);
          if(!reasons.length)this.db.prepare("UPDATE events SET status='obsolete' WHERE seq=?").run(queued.seq);
          else this.db.prepare('UPDATE events SET payload=? WHERE seq=?').run(JSON.stringify({...event,name:complex.name,label:item.label,area:item.area,floor:item.floor,url:item.url,reasons}),queued.seq);
        }
        previous.delete(item.id);
      }
      for(const old of previous.values())if(old.active){
        this.db.prepare('UPDATE listings SET active=0 WHERE id=?').run(old.id);
        this.db.prepare('INSERT INTO history(id,at,kind,price) VALUES (?,?,?,?)').run(old.id,at,'removed_from_watchlist',old.price);
        this.db.prepare("UPDATE events SET status='obsolete' WHERE id=? AND status='pending'").run(old.id);
        changes.push({id:old.id,kind:'removed_from_watchlist'});
      }
      // Keep only the newest event at the current price, never send stale prices.
      this.db.exec(`UPDATE events SET status='obsolete' WHERE status='pending' AND
        (seq NOT IN (SELECT MAX(seq) FROM events WHERE status='pending' GROUP BY id)
        OR json_extract(payload,'$.price') != (SELECT price FROM listings WHERE listings.id=events.id));`);
      this.setMeta('initialized','true');this.setMeta('lastSuccess',at);this.setMeta('lastAttempt',at);this.setMeta('lastError','');
      this.db.exec('COMMIT');
      return {initial,listings:state.listings.length,changes:changes.length,pending:this.pending().length,source:'Firebase 공동 목록 (네이버 수집 아님)'};
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  pending(){return this.db.prepare("SELECT * FROM events WHERE status='pending' ORDER BY seq").all().map(r=>({...r,event:JSON.parse(r.payload)}));}
  history(limit=50){return this.db.prepare('SELECT h.*,l.payload FROM history h JOIN listings l ON l.id=h.id ORDER BY h.seq DESC LIMIT ?').all(limit).map(({payload,...row})=>({...row,label:JSON.parse(payload).label}));}
  events(limit=50){return this.db.prepare('SELECT seq,id,at,status,payload FROM events ORDER BY seq DESC LIMIT ?').all(limit).map(({payload,...row})=>({...row,event:JSON.parse(payload)}));}
}

export function formatAlert(event){
  const money=n=>`${(n/10000).toLocaleString('ko-KR',{maximumFractionDigits:4})}억`;
  return [`[공동 목록] ${event.reasons.join(' · ')}`,`${event.name} ${event.label}`,`전용 ${event.area}㎡ · ${event.floor}층`,event.previousPrice?`${money(event.previousPrice)} → ${money(event.price)}`:money(event.price),'직접 등록·수정된 값 기준이며 네이버 자동 수집이 아닙니다.',event.url].filter(Boolean).join('\n');
}

export async function sendPending(observer,{token,chatId},fetcher=fetch){
  if(!/^\d+:[\w-]+$/.test(token||'')||!/^-[0-9]+$/.test(chatId||''))throw Error('PC의 Telegram 봇 토큰과 그룹 chat ID를 설정하세요.');
  let sent=0;
  // Claim before network I/O to avoid duplicate sends by another PC process.
  // Ambiguous failures stay uncertain; no automatic retry that could duplicate.
  for(const row of observer.pending().slice(0,10)){
    const claimed=observer.db.prepare("UPDATE events SET status='sending' WHERE seq=? AND status='pending'").run(row.seq);
    if(!claimed.changes)continue;
    try {
      const response=await fetcher(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text:formatAlert(row.event),link_preview_options:{is_disabled:true}}),signal:AbortSignal.timeout(15000)});
      const result=await response.json();
      if(!response.ok||!result.ok)throw Error('Telegram 전송 응답 실패');
      observer.db.prepare("UPDATE events SET status='sent' WHERE seq=?").run(row.seq);sent++;
    }catch{
      observer.db.prepare("UPDATE events SET status='uncertain' WHERE seq=?").run(row.seq);
      throw Error('Telegram 전송 결과가 불확실합니다. 중복 방지를 위해 자동 재전송하지 않습니다.');
    }
  }
  return sent;
}
