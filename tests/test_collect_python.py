import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from tempfile import TemporaryDirectory
import json

spec=importlib.util.spec_from_file_location('collector',Path(__file__).resolve().parents[1]/'scripts/collect_python.py')
c=importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


class FakePage:
    url='https://fin.land.naver.com/complexes/8692'
    def __init__(self,rate=False):
        self.gotos=0; self.reloads=0; self.closed=False; self.rate=rate; self.sale_clicks=0
    def on(self,event,handler): self.handler=handler
    def remove_listener(self,event,handler): self.handler=None
    def reload(self,**kwargs):
        self.reloads+=1
        if self.rate:
            self.handler(type('Response',(),{'status':429,'url':'https://fin.land.naver.com/front-api/v1/complex','headers':{'retry-after':'3600'}})())
    def goto(self,*args,**kwargs): self.gotos+=1
    def evaluate(self,*args): return [{'text':'card','url':'https://fin.land.naver.com/articles/1'}]
    def wait_for_timeout(self,*args): pass
    def locator(self,*args): return self
    def get_by_role(self,role,**kwargs):
        assert role=='button'
        assert kwargs['name'].match('매매8')
        return self
    def wait_for(self,**kwargs): pass
    def click(self,**kwargs): self.sale_clicks+=1
    @property
    def last(self): return self
    def scroll_into_view_if_needed(self,**kwargs): pass
    def close(self): self.closed=True


class CollectorTests(unittest.TestCase):
    def test_link_validation(self):
        c.valid_url('https://naver.me/abc')
        for url in ['https://evil.com','http://naver.me/abc','https://naver.me.evil.com','https://user:pass@naver.me']:
            with self.assertRaises(ValueError): c.valid_url(url)

    def test_retry_after(self):
        self.assertEqual(c.retry_seconds('3600',0),3600)
        self.assertEqual(c.retry_seconds('Thu, 01 Jan 1970 02:00:00 GMT',0),7200)
        self.assertEqual(c.retry_seconds('bad',0),1800)

    def test_existing_tab_not_reloaded_first_run_and_never_closed(self):
        page=FakePage()
        with patch.object(c,'choose_page',return_value=(page,False)):
            result=c.collect(None,{'url':'https://naver.me/abc'})
            self.assertEqual(len(result['rows']),1)
            self.assertEqual(page.reloads,0)
            self.assertEqual(page.gotos,0)
            self.assertEqual(page.sale_clicks,1)
            c.collect(None,{'url':'https://naver.me/abc'},refresh=True)
            self.assertEqual(page.reloads,1)
        self.assertFalse(page.closed)

    def test_market_price_link_opens_sale_list_before_reading_cards(self):
        page=FakePage()
        original=page.evaluate
        def read_cards(*args):
            self.assertEqual(page.sale_clicks,1)
            return original(*args)
        page.evaluate=read_cards
        with patch.object(c,'choose_page',return_value=(page,True)):
            result=c.collect(None,{'url':'https://naver.me/abc'})
        self.assertEqual(page.gotos,1)
        self.assertEqual(len(result['rows']),1)

    def test_429_saved_before_return_and_user_tab_preserved(self):
        page=FakePage(rate=True)
        with TemporaryDirectory() as directory, patch.object(c,'COOLDOWN',Path(directory)/'cooldown.json'),patch.object(c,'choose_page',return_value=(page,False)):
            with self.assertRaises(c.RateLimited): c.collect(None,{'url':'https://naver.me/abc'},refresh=True)
            self.assertGreater(json.loads(c.COOLDOWN.read_text())['retryAt'],0)
            self.assertGreater(c.cooldown_remaining(),3500)
        self.assertFalse(page.closed)


if __name__=='__main__': unittest.main()
