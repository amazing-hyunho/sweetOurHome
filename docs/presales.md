# 경기 남부 분양정보

한국부동산원 청약홈 분양정보 조회 API의 APT 상세조회로 최근 180일 모집공고를 확인합니다. 대상은 수원·용인·성남·화성·오산·평택·안성·안양·군포·의왕·과천·광주·이천·여주입니다. 주소의 경기도 및 시 이름으로 필터링하며 광주광역시는 포함하지 않습니다. 특례시 주소도 인식합니다.

일반 APT·민간사전청약·신혼희망타운 중 분양주택을 대상으로 합니다. 임대주택, 오피스텔, 잔여세대 별도 API, LH/GH 자체 모집공고, 공고 전 분양예정 정보는 포함하지 않습니다. 일정·자격 판단은 연결된 공식 공고를 확인하세요.

인증키는 PC `%LOCALAPPDATA%\sweetOurHome\presales\api.json`의 `serviceKey`에만 저장합니다. 브라우저나 Firebase, GitHub에 키를 전달하지 않습니다. `node scripts/collect-presales.mjs`는 전체 페이지 수집이 성공한 뒤 Firebase의 별도 문서 `households/home/feeds/presales`를 갱신하고 텔레그램을 전송합니다. 오류 시 기존 웹 데이터를 유지합니다. `--no-send`는 전송하지 않으며 `--telegram-only`는 Firebase 게시를 생략합니다.

웹의 경기 남부 분양 메뉴는 접수 예정·진행 중 공고를 기본 표시하며 종료 공고도 선택해서 볼 수 있습니다. 알림은 접수 예정·진행 중 공고만 대상으로 하며 첫 연결 시 현재 공고를 안내하고 이후 새 공고나 내용 변경을 알립니다. 같은 내용은 SQLite 발송 기록으로 중복 방지합니다. 결과가 불확실한 전송은 자동 재시도하지 않습니다.

공식 문서: https://www.data.go.kr/data/15098547/openapi.do
Swagger: https://infuser.odcloud.kr/api/stages/37000/api-docs?1643022751478

Firebase 규칙은 기존 공동 목록의 공개 협업 정책과 동일하게 분양정보 문서 한 곳에만 읽기·제한된 쓰기를 허용합니다. 기존 household 문서·버전과 분리되어 매물 편집과 충돌하지 않습니다.

Windows 자동 실행 관리자는 매시간 `--auto`로 확인합니다. PC 설정의 `webEnabled`가 true일 때만 Firebase에 게시합니다. Firebase 규칙 배포 전에는 텔레그램과 PC 캐시만 갱신합니다. 규칙을 배포하고 수동 게시 성공을 확인한 뒤 webEnabled를 true로 변경하세요.
