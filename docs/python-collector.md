# 파이썬으로 열린 브라우저에 연결하기

수집 전용 Chrome(없으면 Edge)을 일반 실행한 다음, 파이썬 Playwright가 로컬 연결로 붙어 화면을 읽습니다. 평소 사용하는 개인 프로필의 쿠키를 복사하지 않습니다. **2026-10-18 실제 실행에서 성복역현대홈타운 개별 매물 12개를 Firebase에 저장하고 다시 조회해 확인했습니다.** 전체 매물 완전성이나 장기간 반복 수집 안정성이 확인됐다는 의미는 아닙니다.

## 더블클릭 실행 순서

1. 처음 한 번 `setup-python-collector.cmd`를 실행합니다. Python 3.10 이상과 Node.js 24 이상이 필요합니다. 이 PC에는 설치와 테스트를 완료했습니다.
2. `open-collector-browser.cmd`를 실행합니다. Firebase에 등록된 단지 링크가 전용 브라우저에서 열립니다. **매물 탭에서 매매 카드가 정상 표시되는지 확인합니다.**
3. `collect-python.cmd`를 실행합니다. 최초에는 열린 화면을 그대로 읽고, 이후 수집 종료 후 10분마다 새로고침해 수집합니다. 웹에서 추가된 링크는 다음 회차에 열립니다.
4. 중단하려면 수집 명령창에서 Ctrl+C를 누릅니다. 브라우저는 그대로 남습니다. PC 종료·절전 시 수집은 멈추고 웹은 마지막 결과를 표시합니다.

백그라운드 실행을 중단할 때는 `stop-python-collector.cmd`를 실행하세요. 진행 중인 작업이 끝난 뒤 종료하며 브라우저를 강제 종료하지 않습니다. `--refresh` 옵션을 추가하면 첫 수집에서도 화면을 새로고침합니다. 재부팅 후에는 브라우저와 수집기를 다시 실행해야 합니다.

기존 Node 수집기(`collect.cmd`)와 동시에 실행하지 마세요. 단지 이름은 네이버 화면의 단지명과 같아야 합니다. 같은 단지 탭이 여러 개면 하나만 남겨주세요. 초기 연결에서 읽은 값은 이미 열린 화면의 값이므로 오래 열린 탭이라면 실행 전에 직접 새로고침해 주세요.

## 터미널 실행

```powershell
# 최초 설치
py -3 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements-collector.txt

# 브라우저 열기 → 화면 확인 → 한 번 수집
.venv\Scripts\python.exe -X utf8 scripts/collect_python.py --open-browser
.venv\Scripts\python.exe -X utf8 scripts/collect_python.py

# 10분 반복
.venv\Scripts\python.exe -X utf8 scripts/collect_python.py --watch
```

브라우저 연결 주소는 `127.0.0.1:9223`입니다. 전용 프로필은 `%LOCALAPPDATA%\sweetOurHome\collector\python-browser-profile`에 유지합니다. 실행 중인 평소 Chrome에 나중에 붙는 방식이 아니라, 연결을 허용한 별도 브라우저를 먼저 열어야 합니다. 전용 브라우저는 수집용으로 사용하세요. 파이썬 중복 실행은 로컬 포트 9224 잠금으로 막습니다.

## 저장과 오류 처리

- Firebase 링크 목록 → 파이썬에서 브라우저 DOM 읽기 → 기존 Node 저장 모듈 → Firebase 순서입니다. JSON 파일을 수동으로 준비하거나 가져올 필요가 없습니다.
- Node 모듈은 기존 필드 검증·가격 파싱·메모와 찜 보존·동시 수정 감지 기능을 재사용합니다. 수집 중 삭제되거나 링크가 바뀐 단지에는 결과를 쓰지 않습니다.
- 개별 매매 광고만 부분 수집합니다. 묶음 광고를 임의의 ID로 만들지 않으며 화면에 없는 매물을 자동 삭제하지 않습니다. 각 매물의 관찰 시각을 확인하세요.
- HTTP 429가 나오면 추가 단지 조회를 멈춥니다. 서버의 `Retry-After`와 30분 중 더 긴 시간만큼 대기합니다. 대기 시각은 Node 수집기와 같은 `cooldown.json`을 사용하며 재시작해도 보존합니다.
- 브라우저 연결 실패나 네이버 오류를 매물 0건으로 처리하지 않습니다. 단지별 실패 상태를 남기고 기존 매물은 유지합니다.
- 수집기가 종료되어도 직접 연 브라우저와 기존 탭은 닫지 않습니다. 수집기가 추가로 연 탭이 실패하면 그 탭만 정리합니다.

## 검증

```powershell
python -m unittest discover -s tests -p test_collect_python.py
npm test
```

파이썬 테스트 4개와 Node 테스트 44개 통과. 실제 원격 디버깅 연결과 Firebase 매물 12개 저장·재조회 확인. 10분 반복은 구현했지만 장시간 운영 검증은 아직 하지 않았으며, 이번 확인 후 상시 수집기는 실행하지 않았습니다.

2026-10-18 운영 시작: 사용자 요청으로 `--watch --refresh`를 백그라운드에서 실행하고 첫 회차 매물 12개 갱신과 다음 10분 대기를 확인했습니다. 실행 로그는 `%LOCALAPPDATA%\sweetOurHome\collector\watch.stdout.log`, 오류 로그는 `watch.stderr.log`에 있습니다. 이는 시작 당시 확인이며 현재 실행 여부를 보장하는 상태 표시는 아닙니다.
