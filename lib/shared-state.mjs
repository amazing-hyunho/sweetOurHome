import { cleanState } from '../public/storage.js';

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

export function encodeValue(value) {
  if(value===null)return {nullValue:null};
  if(typeof value==='string')return {stringValue:value};
  if(typeof value==='boolean')return {booleanValue:value};
  if(typeof value==='number'&&Number.isFinite(value))return Number.isSafeInteger(value)?{integerValue:String(value)}:{doubleValue:value};
  if(Array.isArray(value))return {arrayValue:{values:value.map(encodeValue)}};
  if(value&&typeof value==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encodeValue(v)]))}};
  throw Error('저장할 수 없는 Firebase 데이터 형식');
}

function database(projectId){
  if(!/^[a-z0-9-]+$/.test(projectId))throw Error('Firebase 프로젝트 ID 확인 필요');
  return `projects/${projectId}/databases/(default)`;
}

export async function readSharedDocument(projectId,fetcher=fetch){
  const name=`${database(projectId)}/documents/households/home`;
  const response=await fetcher(`https://firestore.googleapis.com/v1/${name}`,{signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error(response.status===403?'Firebase 접근 거부: 공개 규칙 게시 여부를 확인하세요.':response.status===404?'공동 목록이 없습니다. 웹앱에서 단지를 먼저 저장하세요.':`Firebase 조회 실패 (HTTP ${response.status})`);
  const data=await response.json();
  if(!data.fields?.state)throw Error('공동 목록 응답에 state가 없습니다.');
  const revision=Number(data.fields.revision?.integerValue);
  if(!Number.isSafeInteger(revision)||revision<1||typeof data.updateTime!=='string')throw Error('공동 목록 버전 정보 확인 필요');
  return {state:cleanState(decodeValue(data.fields.state)),revision,updateTime:data.updateTime};
}

export async function commitSharedState(projectId,before,next,fetcher=fetch){
  const state=cleanState(next);
  if(new TextEncoder().encode(JSON.stringify(state)).length>700000)throw Error('공동 목록 저장 용량을 초과합니다.');
  if(!Number.isSafeInteger(before.revision)||before.revision<1||!before.updateTime)throw Error('저장 전 공동 목록을 다시 읽어주세요.');
  const revision=before.revision+1;
  const response=await fetcher(`https://firestore.googleapis.com/v1/${database(projectId)}/documents:commit`,{
    method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),
    body:JSON.stringify({writes:[{
      update:{name:`${database(projectId)}/documents/households/home`,fields:{state:encodeValue(state),revision:encodeValue(revision),updatedBy:encodeValue('public')}},
      currentDocument:{updateTime:before.updateTime},
      updateTransforms:[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}]
    }]})
  });
  if(!response.ok){
    if([409,412].includes(response.status)){const error=Error('다른 기기에서 수정했어요. 최신 목록으로 다시 미리보기해주세요.');error.code='CONFLICT';throw error;}
    throw Error(`Firebase 저장 실패 (HTTP ${response.status})`);
  }
  const result=await response.json();
  if(!result.commitTime||!result.writeResults?.[0]?.updateTime)throw Error('Firebase 저장 결과를 확인하지 못했습니다. 다시 읽어 확인해주세요.');
  return {revision,updateTime:result.writeResults[0].updateTime};
}
