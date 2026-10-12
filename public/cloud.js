import { firebaseConfig } from './firebase-config.js';
import { cleanState } from './storage.js';

// Loaded only after a project is configured; existing local records are never
// silently uploaded or merged into a household's shared data.
export async function setupCloud() {
  if (!firebaseConfig) return null;
  const [appSDK, dbSDK] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js')
  ]);
  const app = appSDK.initializeApp(firebaseConfig);
  document.querySelector('.local-pill').textContent = '공개 공동 목록';
  document.querySelector('.side-bottom').textContent = '로그인 없이 누구나 조회·수정하는 공동 목록';
  const db = dbSDK.getFirestore(app);
  const ref = dbSDK.doc(db, 'households', 'home');
  let revision = -1;
  const runtime = () => ({cloud:true, revision, author:'방문자', collectionEnabled:false, telegramEnabled:false});
  const fromSnapshot = snapshot => {
    revision = snapshot.exists() ? snapshot.data().revision : 0;
    return snapshot.exists() ? {...cleanState(snapshot.data().state), runtime:runtime()} : null;
  };
  return {
    async load() {
      const snapshot = await dbSDK.getDocFromServer(ref);
      const existing = fromSnapshot(snapshot);
      if (existing) return existing;
      // Start empty; the local browser's personal records require explicit import.
      return {...cleanState({complexes:[],regions:[],listings:[],filters:{minExclusiveAreaM2:59,minHouseholds:400,minFloor:3,discountThreshold:.05}}),runtime:runtime()};
    },
    async save(state, expectedRevision) {
      // This first shared version is a bounded watchlist document. Automated
      // listings/history must use separate collections before collection ships.
      if(new TextEncoder().encode(JSON.stringify(state)).length>700000)throw Error('공동 목록 저장 용량에 가까워졌어요. JSON 백업 후 불필요한 기록을 정리해주세요.');
      const nextRevision = await dbSDK.runTransaction(db, async transaction => {
        const snapshot = await transaction.get(ref);
        const actual = snapshot.exists() ? snapshot.data().revision : 0;
        if(actual !== expectedRevision)throw Error('다른 기기에서 수정했어요. 입력 내용을 복사한 뒤 편집창을 닫고 최신 목록에서 다시 수정해주세요.');
        transaction.set(ref,{state, revision:actual+1, updatedBy:'public', updatedAt:dbSDK.serverTimestamp()});
        return actual+1;
      });
      revision = nextRevision;
      return {...state,runtime:runtime()};
    },
    subscribe(onChange,onError) {
      return dbSDK.onSnapshot(ref,snapshot=>{
        if(snapshot.metadata.hasPendingWrites || !snapshot.exists())return;
        if(snapshot.data().revision<=revision)return;
        onChange(fromSnapshot(snapshot));
      },onError);
    }
  };
}
