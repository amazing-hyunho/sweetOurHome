# GitHub Pages 운영

배포 주소: https://amazing-hyunho.github.io/sweetOurHome/

Firebase의 공동 목록에 관심 지역·단지·매물·메모를 저장합니다. 사용자 요청에 따라 로그인 없이 누구나 조회·수정할 수 있습니다. 관찰 설정의 JSON 복원은 공동 목록 전체를 교체합니다.

기존 기기별 기록은 자동 업로드하지 않습니다. 이전 JSON 백업을 공동 목록에서 복원하면 Firebase에 업로드됩니다.

배포에는 웹앱 파일과 초기 보라매삼성 단지 정보만 포함합니다. `local`, `outputs`, 개인 데이터 파일은 배포하지 않습니다. GitHub Actions는 main 변경 시 테스트·빌드 후 Pages를 배포합니다.

네이버 자동 매물 수집은 미연결입니다. PC 관찰 엔진은 공동 목록의 수동 입력값 변화를 SQLite에 기록하며, Telegram은 별도의 PC 전용 봇/그룹 설정 후 명시적으로 실행합니다. [관찰 엔진 안내](observer.md)
