// JSON stdin/stdout bridge: Python owns browser/scheduling; reuse validated
// state normalization, parsing, CAS, and preservation of household edits.
import {firebaseConfig} from '../public/firebase-config.js';
import {readSharedDocument,commitSharedState} from '../lib/shared-state.mjs';
import {mergeSnapshot} from '../lib/merge-snapshot.mjs';
import {validateNaverUrl} from '../lib/collector.mjs';

export async function saveResult(request,{read=readSharedDocument,commit=commitSharedState,projectId=firebaseConfig.projectId}={}){
  for(let attempt=0;attempt<3;attempt++){
    const before=await read(projectId);
    const complex=before.state.complexes.find(c=>c.id===request.id);
    if(!complex||!complex.collectionEnabled||complex.complexUrl!==request.url)return {skipped:true};
    let next=before.state;
    let error=request.error||'',count=complex.collection?.count||0;
    if(!error){
      try{const result=mergeSnapshot(next,complex.id,request.snapshot);count=result.summary.resolved;if(!count)throw Error('개별 매물을 확인하지 못했습니다.');next=result.state;}
      catch(e){error=e.message;}
    }
    const collection={attemptedAt:new Date().toISOString(),lastSuccessAt:error?complex.collection?.lastSuccessAt||null:request.snapshot.observedAt,status:error?'error':'partial',count,error:error.slice(0,500)};
    next={...next,complexes:next.complexes.map(c=>c.id===complex.id?{...c,collection}:c)};
    try{await commit(projectId,before,next);return collection;}
    catch(e){if(e.code!=='CONFLICT'||attempt===2)throw e;}
  }
}

async function main(){
  let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>2000000)throw Error('수집 결과 용량 초과');}
  const request=JSON.parse(input);
  if(request.action==='list'){
    const {state}=await readSharedDocument(firebaseConfig.projectId);
    return state.complexes.filter(c=>c.collectionEnabled&&c.complexUrl).map(c=>({id:c.id,name:c.name,url:c.complexUrl}));
  }
  if(request.action==='save'){validateNaverUrl(request.url);return saveResult(request);}
  throw Error('알 수 없는 작업');
}
if(process.argv[1]&&import.meta.url===(await import('node:url')).pathToFileURL(process.argv[1]).href){
  try{console.log(JSON.stringify(await main()));}catch(e){console.error(e.message);process.exitCode=1;}
}
