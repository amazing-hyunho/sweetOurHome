import {Observer} from './observer.mjs';
import {cleanState} from '../public/storage.js';

// Separate database from the older bargain/pinned-listing observer.
export class TargetObserver extends Observer {
  observe(input, now=new Date()) {
    const state=cleanState(input), at=now.toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec("UPDATE events SET status='obsolete' WHERE status='pending'");
      for(const item of state.listings) {
        const c=state.complexes.find(c=>c.id===item.complexId);
        const target=c?.targets.find(t=>Math.abs(t.area-item.area)<.005 && t.price>0);
        const age=now-Date.parse(item.sourceObservedAt);
        const fresh=c?.collectionEnabled!==false && c?.collection?.status==='partial' &&
          item.source==='naver-snapshot' && item.sourceObservedAt===c.collection.lastSuccessAt && age>=0 && age<=30*60*1000;
        if(!fresh || !target || item.price>target.price)continue;
        // A listing/price is delivered at most once, including after restarts,
        // target edits, stale snapshots and temporary removal from the results.
        const prior=this.db.prepare("SELECT seq,status FROM events WHERE id=? AND json_extract(payload,'$.price')=? ORDER BY seq DESC LIMIT 1").get(item.id,item.price);
        if(prior && prior.status!=='obsolete')continue;
        const event={id:item.id,name:c.name,label:item.label,area:item.area,floor:item.floor,price:item.price,targetPrice:target.price,url:item.url,reasons:['목표 가격 이하'],source:'naver-snapshot',observedAt:item.sourceObservedAt};
        if(prior)this.db.prepare("UPDATE events SET status='pending',payload=? WHERE seq=?").run(JSON.stringify(event),prior.seq);
        else this.db.prepare('INSERT INTO events(id,at,payload) VALUES (?,?,?)').run(item.id,at,JSON.stringify(event));
      }
      this.setMeta('lastSuccess',at);this.setMeta('lastError','');
      this.db.exec('COMMIT');
      return {pending:this.pending().length};
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
}
