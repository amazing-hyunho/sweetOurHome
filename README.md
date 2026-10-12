# sweetOurHome

관심 지역과 아파트 단지를 관리하는 개인용 웹앱입니다.

## 접속

https://amazing-hyunho.github.io/sweetOurHome/

관심 목록과 매물 기록은 브라우저에 저장됩니다. 다른 기기와 자동 동기화되지 않으며 관찰 설정에서 JSON 백업·복원을 제공합니다. 자동 매물 수집과 텔레그램 전송은 미연결입니다.

## 개발

Node.js 22 이상. npm start로 PC 서버를 실행하고 http://127.0.0.1:4310 에 접속합니다. npm test로 테스트하고 npm run build로 GitHub Pages용 dist를 생성합니다.

main 브랜치 변경은 GitHub Actions를 통해 배포합니다. 개인 로컬 데이터와 엑셀 결과 파일은 공개 저장소와 배포에 포함하지 않습니다.

[운영 안내](docs/github-pages.md)
