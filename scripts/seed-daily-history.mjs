// Seed only actual saved successful batches, preserving their observed dates.
import {readSharedDocument,commitSharedState} from '../lib/shared-state.mjs';
import {firebaseConfig} from '../public/firebase-config.js';
import {recordDailyHistory} from '../public/daily-history.js';
for(let attempt=0;attempt<3;attempt++){
 const before=await readSharedDocument(firebaseConfig.projectId);
 const complexes=before.state.complexes.map(c=>{
   const at=c.collection?.lastSuccessAt;
   if(!at)return c;
   const batch=before.state.listings.filter(l=>l.complexId===c.id&&l.source==='naver-snapshot'&&l.sourceObservedAt===at);
   return {...c,dailyHistory:recordDailyHistory(c.dailyHistory,c.complexUrl,batch,at)};
 });
 try{
   await commitSharedState(firebaseConfig.projectId,before,{...before.state,complexes});
   console.log(JSON.stringify(complexes.map(c=>({name:c.name,days:c.dailyHistory.days.length}))));break;
 }catch(e){if(e.code!=='CONFLICT'||attempt===2)throw e;}
}
