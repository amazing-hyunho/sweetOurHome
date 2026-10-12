# 무료 공동 목록 연결

현재 프로젝트 설정은 비어 있으며 기기별 저장을 유지한다. Firebase 연결이 완료됐다고 표시하지 않는다.

1. Firebase Console에서 프로젝트 생성. Spark 무료 요금제를 유지하고 결제 계정을 연결하지 않는다. Analytics는 이 앱에 필요 없다.
2. 웹 앱을 등록하고 공개 firebaseConfig 객체를 public/firebase-config.js의 null 대신 입력한다. 서비스 계정 JSON, 비밀번호, Telegram 토큰은 이 파일이나 Git에 넣지 않는다.
3. Authentication > Sign-in method에서 Google 활성화. Authorized domains에 amazing-hyunho.github.io 추가. 로컬 테스트 시 127.0.0.1도 추가한다.
4. Cloud Firestore 기본 데이터베이스를 Standard edition, production mode로 생성한다. firestore.rules 내용을 Rules 탭에 게시한다. 테스트 모드의 전체 허용 규칙은 쓰지 않는다.
5. 두 사람이 각각 웹앱에서 Google 로그인을 한 번 한다. 아직 목록 접근은 거부되는 것이 정상이다. Authentication > Users에서 각 UID를 확인한다.
6. Console에서 members 컬렉션에 각 UID를 문서 ID로 하는 문서 두 개만 만든다. 예: enabled: true. 현재 규칙은 문서 존재 여부로 멤버를 판단하므로 접근 회수는 문서 삭제로 한다. 멤버 문서는 브라우저에서 읽거나 쓸 수 없다.
7. 새로고침 후 공동 목록 CRUD, 다른 계정 실시간 반영, 동시 수정 충돌, 비멤버 접근 거부, 로그아웃을 실제 두 기기에서 확인한다.

기존 기기 기록은 자동 업로드하지 않는다. 설정 전 JSON 백업을 받고, 로그인 후 설정의 백업 복원으로 명시적으로 옮긴다. 복원은 공동 목록 전체를 교체하므로 배우자 기록을 확인한다.

## 현재 구현 범위

Google 로그인, 허용 UID만 접근하는 규칙, 공동 목록 읽기/쓰기/구독, 트랜잭션 기반 버전 충돌 감지 코드를 준비했다. 프로젝트 미생성 상태이므로 실제 Firebase 연결·규칙 배포·두 계정 통합 검증은 아직 하지 않았다.

첫 버전은 단일 공동 목록 문서이며 저장 전 JSON 700KB 제한을 적용한다. 자동 수집 매물과 가격 이력은 별도 컬렉션/PC DB로 분리한 뒤 연결해야 한다. 현재 코드에는 수집기가 없다. 메모의 작성자 표시는 협업 표시용이며 감사 기록이 아니다. 두 멤버 모두 메모를 수정/삭제할 수 있다.

공식 문서: https://firebase.google.com/docs/auth/web/google-signin
https://firebase.google.com/docs/firestore/manage-data/transactions
https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
