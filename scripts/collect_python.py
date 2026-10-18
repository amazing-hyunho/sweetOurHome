"""Attach to a user-opened dedicated browser; never import personal profiles."""
import argparse
import json
import os
import re
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlsplit
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(os.environ.get('LOCALAPPDATA', Path.home())) / 'sweetOurHome' / 'collector'
PROFILE = DATA / 'python-browser-profile'
COOLDOWN = DATA / 'cooldown.json'  # shared with the Node collector, milliseconds
STOP = DATA / 'python-stop'
ENDPOINT = 'http://127.0.0.1:9223'
CARD_SELECTOR = 'li[class*="ArticleCard-"]'
CARDS = """() => Array.from(document.querySelectorAll('a[href*="/articles/"]')).flatMap(a=>{
 const c=a.closest('li[class*="ArticleCard-"]');
 if(!c || !c.innerText.includes('매매') || !c.innerText.includes('전용') || c.querySelectorAll('a[href*="/articles/"]').length!==1)return [];
 return [{text:c.innerText,url:a.href}];
})"""


def valid_url(value):
    u = urlsplit(value)
    if u.scheme != 'https' or u.username or u.password or u.port not in (None,443) or u.hostname not in {'naver.me','fin.land.naver.com','new.land.naver.com','m.land.naver.com','land.naver.com'}:
        raise ValueError('HTTPS 네이버 부동산 링크가 필요합니다.')
    return value


def bridge(action, **data):
    node = shutil.which('node')
    if not node:
        raise RuntimeError('기존 Firebase 저장 모듈 실행에 Node.js 24 이상이 필요합니다.')
    result = subprocess.run([node,str(ROOT/'scripts/python-collector-bridge.mjs')],input=json.dumps({'action':action,**data},ensure_ascii=False),text=True,encoding='utf-8',capture_output=True,timeout=90,cwd=ROOT)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or 'Firebase 처리 실패')
    return json.loads(result.stdout)


def retry_seconds(value, now=None):
    now = time.time() if now is None else now
    try:
        seconds = float(value) if value and value.isdecimal() else parsedate_to_datetime(value).timestamp()-now
        return max(1800,seconds)
    except (ValueError,TypeError,AttributeError,OverflowError):
        return 1800


def cooldown_remaining():
    if not COOLDOWN.exists():
        return 0
    value = json.loads(COOLDOWN.read_text(encoding='utf-8'))['retryAt']
    if not isinstance(value,(int,float)):
        raise ValueError('수집 대기 파일 형식을 확인하세요.')
    return max(0,value/1000-time.time())


class RateLimited(RuntimeError):
    pass


def check_endpoint():
    try:
        with urlopen(ENDPOINT+'/json/version',timeout=3) as response:
            return json.load(response)
    except Exception as exc:
        raise RuntimeError('전용 브라우저가 연결되지 않았습니다. 먼저 open-collector-browser.cmd를 실행하세요.') from exc


def open_browser():
    if cooldown_remaining()>0:
        raise RuntimeError('조회 제한 대기 중입니다. 대기가 끝난 뒤 브라우저를 여세요.')
    try:
        check_endpoint()
        print('전용 브라우저가 이미 열려 있습니다. 매물이 보이는지 확인하세요.')
        return
    except RuntimeError:
        pass
    candidates=[Path(os.environ.get('PROGRAMFILES','C:/Program Files'))/'Google/Chrome/Application/chrome.exe',Path(os.environ.get('PROGRAMFILES(X86)','C:/Program Files (x86)'))/'Microsoft/Edge/Application/msedge.exe']
    executable=next((p for p in candidates if p.is_file()),None)
    if not executable:
        raise RuntimeError('Chrome 또는 Edge 설치가 필요합니다.')
    complexes=bridge('list')
    urls=list(dict.fromkeys(valid_url(c['url']) for c in complexes)) or ['about:blank']
    PROFILE.mkdir(parents=True,exist_ok=True)
    subprocess.Popen([str(executable),'--remote-debugging-address=127.0.0.1','--remote-debugging-port=9223',f'--user-data-dir={PROFILE}','--no-first-run',*urls],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    print('수집 전용 브라우저를 열었습니다. 단지의 매매 카드가 보이면 collect-python.cmd를 실행하세요.')


def choose_page(context, complex_info):
    # Display names are user aliases. Only the saved URL selects a source.
    candidates=[page for page in context.pages if page.url==complex_info['url']]
    if len(candidates)>1:
        return candidates[0],False
    if candidates:
        return candidates[0],False
    page=context.new_page()
    return page,True


def select_sale_list(page,check):
    # The complex header's sale-count button opens the article tab with all
    # sale areas, even when a shared link initially points at market prices.
    sale=page.get_by_role('button',name=re.compile(r'^매매\s*[\d,]+$'))
    try:
        sale.wait_for(state='visible',timeout=20000)
    except Exception as exc:
        check()
        raise RuntimeError('단지의 매매 목록 버튼을 찾지 못했습니다. 단지 링크인지 확인해주세요.') from exc
    check()
    # Server-rendered placeholders say 매매0 before the click handlers/data load.
    # Wait for a real count before choosing the list; a genuine zero stays bounded.
    for _ in range(20):
        if re.search(r'[1-9]',sale.inner_text()):
            break
        page.wait_for_timeout(500)
        check()
    sale.click(timeout=10000)
    check()


def collect(context, complex_info, refresh=False):
    valid_url(complex_info['url'])
    page,created=choose_page(context,complex_info)
    limited=[]

    def response_received(response):
        if response.status==429 and urlsplit(response.url).hostname=='fin.land.naver.com':
            delay=retry_seconds(response.headers.get('retry-after'))
            until=time.time()+delay
            limited.append(until)
            # Persist before Firebase writes, so failures do not discard cooldown.
            COOLDOWN.write_text(json.dumps({'retryAt':max(limited)*1000}),encoding='utf-8')

    def check():
        if limited:
            raise RateLimited('네이버 HTTP 429: 추가 조회를 중단하고 대기합니다.')
        if 'financial.pstatic.net/404' in page.url:
            raise RuntimeError('네이버 오류 화면입니다. 전용 브라우저에서 정상 표시되는지 확인하세요.')

    page.on('response',response_received)
    try:
        if created:
            page.goto(complex_info['url'],wait_until='domcontentloaded',timeout=45000)
        elif refresh:
            page.reload(wait_until='domcontentloaded',timeout=45000)
        check()
        select_sale_list(page,check)
        # First run deliberately reads the already open page without reloading.
        for _ in range(60):
            check()
            rows=page.evaluate(CARDS)
            if rows:
                break
            page.wait_for_timeout(500)
        else:
            raise RuntimeError('매매 목록을 열었지만 개별 매물 링크를 확인하지 못했습니다. 묶음 매물만 있거나 로딩에 실패했을 수 있습니다.')
        found={}
        stable=0
        for _ in range(30):
            check()
            before=len(found)
            for row in page.evaluate(CARDS):
                found[row['url']]=row
            stable=stable+1 if len(found)==before else 0
            if stable>=3:
                break
            page.locator(CARD_SELECTOR).last.scroll_into_view_if_needed(timeout=5000)
            page.wait_for_timeout(1500)
        check()
        detail_names={s.strip() for s in page.locator('h3').all_text_contents() if s.strip()}
        source_names=list(dict.fromkeys(s.strip() for s in page.locator('h2').all_text_contents() if s.strip() in detail_names))
        if len(source_names)!=1:
            raise RuntimeError('링크 화면의 실제 단지명을 확인하지 못했습니다.')
        return {'observedAt':datetime.now(timezone.utc).isoformat(),'rows':list(found.values()),'requestedUrl':complex_info['url'],'complexName':source_names[0]}
    except Exception:
        check()
        raise
    finally:
        page.remove_listener('response',response_received)
        if created:
            page.close()
        # User-owned tabs and browser are never closed.


def wait_until_next(seconds):
    deadline=time.monotonic()+seconds
    while time.monotonic()<deadline:
        if STOP.exists():
            return False
        time.sleep(min(1,max(0,deadline-time.monotonic())))
    return not STOP.exists()


def run(watch=False,refresh_first=False):
    from playwright.sync_api import sync_playwright
    # OS releases this lock on exit; no stale PID files, no killing processes.
    with socket.socket() as lock:
        try:
            lock.bind(('127.0.0.1',9224))
        except OSError as exc:
            raise RuntimeError('파이썬 수집기가 이미 실행 중이거나 잠금 포트 9224를 사용 중입니다.') from exc
        STOP.unlink(missing_ok=True)
        check_endpoint()
        with sync_playwright() as playwright:
            browser=playwright.chromium.connect_over_cdp(ENDPOINT)
            context=browser.contexts[0]
            first=not refresh_first
            while not STOP.exists():
                remaining=cooldown_remaining()
                if remaining:
                    print(f'조회 제한 대기: {remaining/60:.0f}분 남음',flush=True)
                    if not watch:
                        return 1
                    if not wait_until_next(min(remaining,60)):
                        break
                    continue
                failed=False
                try:
                    complexes=bridge('list')
                    if not complexes:
                        print('Firebase에 수집을 켠 단지 링크가 없습니다.',flush=True)
                    for info in complexes:
                        if STOP.exists():
                            break
                        limited=False
                        try:
                            snapshot=collect(context,info,refresh=not first)
                            result=bridge('save',id=info['id'],url=info['url'],snapshot=snapshot)
                        except Exception as exc:
                            failed=True
                            limited=isinstance(exc,RateLimited)
                            result=bridge('save',id=info['id'],url=info['url'],error=str(exc)[:500])
                        if result.get('status')=='error':
                            failed=True
                        print(info['name']+': '+json.dumps(result,ensure_ascii=False),flush=True)
                        if limited:
                            break
                except Exception as exc:
                    failed=True
                    print(str(exc),file=sys.stderr,flush=True)
                first=False
                if not watch:
                    return int(failed)
                print('다음 수집까지 10분 대기합니다. 종료: Ctrl+C',flush=True)
                if not wait_until_next(600):
                    break
            # Do not browser.close(): this is a manually opened browser.
            print('반복 수집을 종료했습니다. 브라우저는 그대로 둡니다.',flush=True)
            return 0


def main():
    parser=argparse.ArgumentParser(description='직접 연 전용 Chrome/Edge에 연결하는 Firebase 매물 수집기')
    group=parser.add_mutually_exclusive_group()
    group.add_argument('--open-browser',action='store_true')
    group.add_argument('--watch',action='store_true')
    group.add_argument('--stop',action='store_true')
    parser.add_argument('--refresh',action='store_true',help='첫 수집에서도 열린 단지 탭 새로고침')
    args=parser.parse_args()
    DATA.mkdir(parents=True,exist_ok=True)
    if args.stop:
        STOP.touch()
        print('반복 수집 중단을 요청했습니다. 진행 중인 수집이 끝나면 종료합니다.')
        return 0
    if args.open_browser:
        open_browser()
        return 0
    return run(args.watch,args.refresh)


if __name__=='__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print('\n수집을 종료했습니다. 브라우저는 그대로 둡니다.')
    except Exception as exc:
        print(str(exc),file=sys.stderr)
        sys.exit(1)
