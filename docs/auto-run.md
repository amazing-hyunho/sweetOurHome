# 로그인 후 자동 실행

`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-auto-run.ps1`은 현재 사용자 시작프로그램에 `sweetOurHome.lnk`를 등록합니다. Windows 로그인 후 전용 수집 브라우저, 10분 주기 수집기, 목표액 알림을 실행하며 중단된 프로세스를 다시 시작합니다. 기존 실행 중인 프로세스는 중복 실행하지 않습니다. Codex 실행은 필요하지 않습니다.

한국시간 12:00~12:29에 일별 변동 알림 스크립트를 확인합니다. SQLite의 날짜별 중복 방지로 정상 처리된 날짜는 다시 보내지 않습니다. PC 절전·종료 중에는 동작하지 않으며 12:30 이후 로그인하면 그날 정오 알림은 건너뜁니다.

자동 실행은 일반 Chrome/Edge 수집 전용 창을 최소화해 시작합니다. 새 수집 탭은 비활성 상태로 열고, 데이터 처리용 자식 프로세스는 콘솔 창을 만들지 않습니다. 브라우저 자체는 실행 중이므로 작업 표시줄에는 남을 수 있습니다. 수동 `--open-browser`는 점검을 위해 일반 창을 열며, `--open-browser --background`는 최소화해 엽니다. 네이버 조회 제한이 감지되면 반복 조회를 중단하고 기존 대기 시간을 지킵니다.

작동 기록: `%LOCALAPPDATA%\sweetOurHome\autorun\status.json` 및 같은 폴더의 작업별 로그. 자동 실행 전체 중지는 `scripts/stop-auto-run.ps1`을 PowerShell에서 실행합니다. 개별 중지 파일만 실행하면 감독 프로세스가 다시 켭니다. 재로그인 후에는 다시 자동 실행됩니다. 영구 해제는 Windows 시작프로그램 폴더의 `sweetOurHome.lnk`를 삭제하세요. 저장소를 이동하면 설치 스크립트를 다시 실행해야 합니다.
