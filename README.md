# sweetOurHome

관심 지역과 아파트 단지를 관리하는 개인용 웹앱입니다.

## 접속

https://amazing-hyunho.github.io/sweetOurHome/

관심 목록과 매물·메모는 Firebase 공동 목록에 저장됩니다. 로그인 없이 누구나 조회·수정할 수 있습니다. 관찰 설정에서 JSON 백업·복원을 제공합니다.

집 PC에서 **파이썬 연결 방식**으로 네이버 매물을 수집할 수 있습니다. 최초 `setup-python-collector.cmd` 실행 → `open-collector-browser.cmd`로 전용 브라우저 열기 → 매매 카드 확인 → `collect-python.cmd` 실행 순서입니다. Firebase의 링크 목록을 읽고 개별 매물을 파싱해 결과와 확인 시각을 저장하며, 수집 종료 후 10분마다 반복합니다. 2026-10-18 성복역현대홈타운 개별 매물 **12개 실제 저장·재조회에 성공**했습니다. 전체 매물 및 장시간 반복 안정성은 별도 검증이 필요합니다. [파이썬 실행 안내](docs/python-collector.md)

이전 Node 단독 수집기(`collect.cmd`)는 독립 브라우저에서 네이버 오류가 발생했습니다. 파이썬 수집기와 동시에 실행하지 마세요. [기존 수집기 검증 기록](docs/collector.md)

PC에서는 `npm run observe`로 공동 목록의 가격 변화를 SQLite에 기록합니다. `observe.cmd`는 5분마다 확인하고, `npm run observe -- --history`로 가격 기록을 확인합니다. Telegram은 PC 전용 설정과 `--send` 옵션이 있어야 전송합니다. [PC 관찰 안내](docs/observer.md)

사용자가 제공한 매물 JSON은 `npm run import:snapshot`으로 미리보기/병합할 수 있습니다. 메모·찜·목표 가격을 보존하며, 실제 저장에는 명시적인 `--write` 옵션이 필요합니다. 이 기능은 사이트 자동 수집을 수행하지 않습니다. [스냅샷 반영 안내](docs/snapshot-import.md)

## 개발

Node.js 24 이상. npm start로 PC 서버를 실행하고 http://127.0.0.1:4310 에 접속합니다. npm test로 테스트하고 npm run build로 GitHub Pages용 dist를 생성합니다.

main 브랜치 변경은 GitHub Actions를 통해 배포합니다. 개인 로컬 데이터와 엑셀 결과 파일은 공개 저장소와 배포에 포함하지 않습니다.

[운영 안내](docs/github-pages.md)
