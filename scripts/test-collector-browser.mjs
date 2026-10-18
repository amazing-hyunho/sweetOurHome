import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {collectPage} from '../lib/collector.mjs';
import {parseVisibleSnapshot} from '../lib/naver-snapshot.mjs';

// Regression fixture mirrors the live DOM: the article link has no price,
// a recent-history link is unrelated, and grouped cards have no article ID.
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const page=await browser.newPage();
  await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`
    <meta charset="utf-8"><nav><a href="/articles/999">다른단지 101동 매매 3억</a></nav>
    <ul><li class="ArticleCard-module-scss-module__fixture__item"><div>
    성복역현대홈타운 201동<br>매매 12억<br>아파트108㎡ (전용84.85)17/20층동향<br>
    <a href="/articles/123">매물 보러가기</a></div></li>
    <li class="ArticleCard-module-scss-module__fixture__item">성복역현대홈타운 205동<br>매매 12억<br>아파트108㎡ (전용84.85)20/20층동향<br><button>매물목록 펼치기</button></li></ul>`}));
  const result=await collectPage(page,'https://fin.land.naver.com/complexes/8692');
  assert.equal(result.rows.length,1);
  const parsed=parseVisibleSnapshot(result.rows);
  assert.equal(parsed.listings[0].sourceArticleId,'123');
  assert.equal(parsed.listings[0].price,120000);
  console.log('실제 브라우저 DOM 회귀 검증 통과: 카드 링크/최근 조회/묶음 구분');
}finally{await browser.close();}
