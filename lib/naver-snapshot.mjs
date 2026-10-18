// Pure parser for rendered listing cards. PC browser collection is implemented
// separately in collector.mjs; manual snapshot imports reuse this parser.
export function parseSalePrice(raw){
  const text=raw.replace(/[\s,]/g,'');
  const eok=text.match(/^(\d+(?:\.\d+)?)억(?:(\d+)만?)?$/);
  const man=text.match(/^(\d+)만?$/);
  const price=eok?Number(eok[1])*10000+Number(eok[2]||0):man?Number(man[1]):NaN;
  if(!Number.isFinite(price)||price<=0||price>10000000)throw Error('매매 가격 형식 확인 필요');
  return price;
}

export function parseVisibleCard({text,url}){
  if(typeof text!=='string'||!text.includes('매매'))return null;
  const title=text.match(/^(.+?)\s+(\d+동)\s*$/m);
  const price=text.match(/^매매\s+([^\n]+)$/m);
  const area=text.match(/전용\s*(\d+(?:\.\d+)?)/);
  const floor=text.match(/(\d+|저|중|고)\s*\/\s*(\d+)층/);
  if(!title||!price||!area||!floor)throw Error('매물 카드의 필수 필드가 누락됐습니다.');
  let articleUrl=null,id=null;
  if(url){
    const parsed=new URL(url,'https://fin.land.naver.com');
    const match=parsed.pathname.match(/^\/articles\/(\d+)$/);
    if(parsed.origin!=='https://fin.land.naver.com'||!match||parsed.search||parsed.hash)throw Error('매물 원문 URL 확인 필요');
    articleUrl=parsed.href;id=match[1];
  }
  const exactFloor=/^\d+$/.test(floor[1])?Number(floor[1]):null;
  const totalFloors=Number(floor[2]),exclusiveArea=Number(area[1]);
  if(exclusiveArea<=0||exclusiveArea>1000||totalFloors<1||totalFloors>200||exactFloor!==null&&(exactFloor<1||exactFloor>totalFloors))throw Error('면적 또는 층수 범위 확인 필요');
  return {source:'naver',sourceArticleId:id,complexName:title[1],building:title[2],tradeType:'sale',price:parseSalePrice(price[1]),area:exclusiveArea,floor:exactFloor,floorLabel:floor[1],totalFloors,url:articleUrl,identityResolved:!!id,needsFloorReview:exactFloor===null};
}

export function parseVisibleSnapshot(rows,{expectedCount}={}){
  if(!Array.isArray(rows)||rows.length>5000)throw Error('매물 카드 배열 확인 필요');
  const listings=rows.map(parseVisibleCard).filter(Boolean);
  const identities=listings.filter(l=>l.sourceArticleId).map(l=>l.sourceArticleId);
  if(new Set(identities).size!==identities.length)throw Error('매물 ID가 중복됩니다.');
  if(expectedCount!=null&&listings.length!==expectedCount)throw Error('화면에 표시된 개수와 읽은 카드 수가 다릅니다. 로딩/누락을 확인하세요.');
  return {listings,summary:{cards:listings.length,resolved:identities.length,unresolvedGroups:listings.length-identities.length,exactFloors:listings.filter(l=>l.floor!==null).length,unknownFloors:listings.filter(l=>l.floor===null).length},completeArticleInventory:listings.length>0&&identities.length===listings.length};
}
