export const PRESALE_CITIES=['수원','용인','성남','화성','오산','평택','안성','안양','군포','의왕','과천','광주','이천','여주'];
export function presaleCity(address){
 const m=String(address||'').match(/^(?:경기도|경기)\s+([가-힣]+?)(?:특례)?시(?:\s|$)/);
 return m&&PRESALE_CITIES.includes(m[1])?m[1]:null;
}
export function presaleStatus(item,today){
 if(!item.start||!item.end)return '일정 확인';
 return today<item.start?'접수 예정':today<=item.end?'접수 중':'접수 종료';
}
export function normalizePresale(row){
 const city=presaleCity(row.HSSPLY_ADRES);
 if(!city||!['01','09','10'].includes(row.HOUSE_SECD)||row.RENT_SECD&&row.RENT_SECD!=='0')return null;
 const date=v=>v==null||v===''?null:/^\d{4}-\d{2}-\d{2}$/.test(v)?v:(()=>{throw Error('청약 일정 형식 오류');})();
 const url=new URL(row.PBLANC_URL);
 if(url.protocol!=='https:'||url.hostname!=='www.applyhome.co.kr')throw Error('청약홈 공고 링크 형식 오류');
 if(!row.HOUSE_MANAGE_NO||!row.PBLANC_NO||typeof row.HOUSE_NM!=='string')throw Error('청약 공고 식별정보 누락');
 return {id:`${row.HOUSE_MANAGE_NO}:${row.PBLANC_NO}`,name:row.HOUSE_NM,city,address:row.HSSPLY_ADRES,type:row.HOUSE_SECD_NM||'APT',announced:date(row.RCRIT_PBLANC_DE),start:date(row.RCEPT_BGNDE),end:date(row.RCEPT_ENDDE),special:date(row.SPSPLY_RCEPT_BGNDE),first:date(row.GNRL_RNK1_CRSPAREA_RCPTDE),second:date(row.GNRL_RNK2_CRSPAREA_RCPTDE),winner:date(row.PRZWNER_PRESNATN_DE),contract:date(row.CNTRCT_CNCLS_BGNDE),households:Number(row.TOT_SUPLY_HSHLDCO)||0,url:url.href};
}
