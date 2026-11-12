"""Browser regressions for the mobile allocation calculator."""
from pathlib import Path
import json
import unittest
from playwright.sync_api import expect
import browser_smoke as support
KEY='pension-dca-settings-v2'
SAMPLE={'version':2,'total':'500000','rows':[{'name':'S&P500','pct':'60','price':'45000'},{'name':'나스닥100','pct':'20','price':'25000'},{'name':'채권','pct':'20','price':'10000'}]}
class AllocationBrowser(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  support.BrowserChecks.setUpClass();cls.browser=support.BrowserChecks.browser;cls.base=support.BrowserChecks.base
 @classmethod
 def tearDownClass(cls):support.BrowserChecks.tearDownClass()
 def setUp(self):
  self.context=self.browser.new_context();self.context.route('https://**/*',lambda r:r.abort());self.page=self.context.new_page();self.errors=[]
  self.page.on('pageerror',lambda e:self.errors.append(str(e)));self.page.goto(self.base+'/howtodistribute/')
 def tearDown(self):
  try:self.assertEqual(self.errors,[])
  finally:self.context.close()
 def seed(self,data=SAMPLE):
  self.page.evaluate('([key,data])=>localStorage.setItem(key,JSON.stringify(data))',[KEY,data]);self.page.reload()
 def stored(self):return self.page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',KEY)
 def upload(self,data):self.page.locator('#settings-file').set_input_files({'name':'settings.json','mimeType':'application/json','buffer':json.dumps(data).encode()})
 def test_approved_example_auto_updates_and_total_only_changes_persist(self):
  self.seed();expect(self.page.locator('#spent')).to_have_text('470,000원');expect(self.page.locator('#remaining')).to_have_text('30,000원')
  expect(self.page.locator('.allocation').first).to_have_text('300,000원');expect(self.page.locator('.shares').first).to_have_text('6주')
  self.page.locator('#total').fill('600000');expect(self.page.locator('#spent')).to_have_text('580,000원')
  self.page.reload();expect(self.page.locator('#total')).to_have_value('600,000');expect(self.page.locator('#remaining')).to_have_text('20,000원')
 def test_incomplete_prices_and_invalid_weights_do_not_show_stale_results(self):
  self.seed();self.page.locator('.price').first.fill('');expect(self.page.locator('#spent')).to_have_text('—');expect(self.page.locator('#remaining')).to_have_text('—')
  expect(self.page.locator('#calculation-note')).to_contain_text('1주 가격')
  saved=self.stored();self.page.locator('.pct').first.fill('-10');expect(self.page.locator('.pct').first).to_have_attribute('aria-invalid','true');expect(self.page.locator('.allocation').first).to_have_text('—');self.assertEqual(self.stored(),saved)
 def test_legacy_migration_preserves_originals_and_quotes_are_literal(self):
  original=[{'name':'ETF "장기" </input><img src=x onerror="window.injected=1">','pct':100,'price':45000}]
  self.page.evaluate('(rows)=>{localStorage.setItem("pension-dca-rows-v1",JSON.stringify(rows));localStorage.setItem("pension-dca-total-v1","500000");}',original)
  self.page.reload();expect(self.page.locator('.asset-name')).to_have_value(original[0]['name']);self.assertEqual(self.page.locator('#rows img').count(),0)
  self.assertEqual(self.page.evaluate('JSON.parse(localStorage.getItem("pension-dca-rows-v1"))'),original)
  expect(self.page.locator('#spent')).to_have_text('495,000원')
 def test_delete_all_rows_stays_empty_after_reload(self):
  self.seed()
  while self.page.locator('.remove-row').count():self.page.locator('.remove-row').first.click()
  self.page.reload();expect(self.page.locator('.asset-card')).to_have_count(0);self.assertEqual(self.stored()['rows'],[])
  self.page.locator('#add-row').click();expect(self.page.locator('.asset-card')).to_have_count(1)
 def test_export_import_roundtrip_rejects_invalid_and_respects_cancel(self):
  self.seed()
  with self.page.expect_download() as info:self.page.locator('#export-settings').click()
  backup=json.loads(Path(info.value.path()).read_text());self.assertEqual(backup['format'],'pension-allocation-settings')
  self.page.locator('#total').fill('600000');current=self.stored()
  bad={**backup,'total':'-1'};self.upload(bad);expect(self.page.locator('#storage-notice')).to_contain_text('금액');self.assertEqual(self.stored(),current)
  self.page.once('dialog',lambda d:d.dismiss());self.upload(backup);self.assertEqual(self.stored(),current)
  self.page.once('dialog',lambda d:d.accept());self.upload(backup);expect(self.page.locator('#total')).to_have_value('500,000');self.assertEqual(self.stored()['rows'],SAMPLE['rows'])
 def test_corrupt_data_is_preserved_until_explicit_replacement(self):
  self.page.evaluate('(key)=>localStorage.setItem(key,"{broken")',KEY);self.page.reload();expect(self.page.locator('#storage-notice')).to_contain_text('원본은 유지')
  self.page.locator('#total').fill('10000');self.assertEqual(self.page.evaluate('(key)=>localStorage.getItem(key)',KEY),'{broken')
  self.page.once('dialog',lambda d:d.accept());self.upload({'format':'pension-allocation-settings',**SAMPLE});expect(self.page.locator('#spent')).to_have_text('470,000원');self.assertEqual(self.stored()['total'],'500000')
  recovery=self.page.evaluate('JSON.parse(localStorage.getItem("pension-dca-settings-before-replace"))');self.assertEqual(recovery['current'],'{broken')
 def test_storage_failure_is_visible_and_does_not_overwrite_saved_data(self):
  self.seed();saved=self.stored();self.page.evaluate('()=>{Storage.prototype.setItem=function(){throw new DOMException("full","QuotaExceededError")}}')
  self.page.locator('#total').fill('600000');expect(self.page.locator('#save-status')).to_have_text('자동 저장 안 됨');expect(self.page.locator('#storage-notice')).to_contain_text('저장하지 못했습니다');self.assertEqual(self.stored(),saved)
 def test_mobile_and_desktop_layout_are_single_column_without_overflow(self):
  self.seed()
  for width in [320,375,600,1440]:
   self.page.set_viewport_size({'width':width,'height':900});self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'),width)
   expect(self.page.locator('#add-row')).to_be_visible();self.assertGreater(self.page.locator('.asset-card').first.bounding_box()['width'],200)
  self.assertEqual(self.page.evaluate('getComputedStyle(document.body).backgroundColor'),'rgba(0, 0, 0, 0)')
if __name__=='__main__':unittest.main(verbosity=2)
