"""Browser regression checks. Run: python3 tests/browser_smoke.py
Requires Python Playwright and Chromium (see tests/README.md).
All draw API responses are deterministic fixtures, not live-network assertions.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from datetime import date, timedelta
import json
import os
import shutil
import unittest
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://raw.githubusercontent.com/nostra-team/nostra-data/main/snapshot.json'
KEY = 'moneydash:v1'


def draw_fixture():
    today = date.today()
    lotto = today - timedelta(days=(today.weekday() - 5) % 7)
    pension = today - timedelta(days=(today.weekday() - 3) % 7)
    return {
        'lotto': [{'round': (lotto - date(2002, 12, 7)).days // 7 + 1,
                   'date': lotto.strftime('%Y%m%d'), 'numbers': [1, 12, 23, 34, 40, 45], 'bonus': 7}],
        'pension': [{'round': (pension - date(2020, 5, 7)).days // 7 + 1,
                     'date': pension.strftime('%Y%m%d'), 'group': 2, 'number': '012345'}],
    }


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


class BrowserChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
        cls.thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'
        cls.playwright = sync_playwright().start()
        executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('google-chrome')
        cls.browser = cls.playwright.chromium.launch(headless=True, **({'executable_path': executable} if executable else {}))

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.context = self.browser.new_context()
        self.context.route('https://**/*', lambda route: route.abort())
        self.page = self.context.new_page()
        self.errors = []
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))

    def tearDown(self):
        try:
            self.assertEqual(self.errors, [], 'Uncaught JavaScript exceptions')
        finally:
            self.context.close()

    def open_moneydash(self):
        self.page.goto(self.base + '/moneydash/')
        self.page.locator('#month-filter').fill('2026-10')
        self.page.locator('#month-filter').dispatch_event('change')

    def add(self, kind='expense', amount='12000', date_value='2026-10-22', description='점심'):
        self.page.locator('#add-transaction').click()
        self.page.locator(f'input[name="type"][value="{kind}"]').check()
        self.page.locator('#transaction-amount').fill(amount)
        self.page.locator('#transaction-date').fill(date_value)
        self.page.locator('#transaction-description').fill(description)
        self.page.locator('#save-transaction').click()
        expect(self.page.locator('#transaction-dialog')).not_to_be_visible()

    def stored(self):
        return self.page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', KEY)

    def upload(self, data):
        self.page.locator('#backup-file').set_input_files({
            'name': 'backup.json', 'mimeType': 'application/json',
            'buffer': json.dumps(data).encode(),
        })

    def test_ledger_filters_edit_delete_and_monthly_summary(self):
        self.open_moneydash()
        self.add('income', '100000', description='월급')
        self.add()
        self.add(amount='8000', date_value='2026-09-01', description='지난달')
        expect(self.page.locator('#month-filter')).to_have_value('2026-10')
        expect(self.page.locator('#transactions-list tr')).to_have_count(2)
        expect(self.page.locator('#balance-total')).to_have_text('88,000원')
        self.assertEqual(len(self.page.locator('.month-bars').all()), 6)
        self.page.locator('[data-filter="expense"]').click()
        expect(self.page.locator('#transactions-list tr')).to_have_count(1)
        self.page.locator('button[data-action="edit"]').click()
        self.page.locator('#transaction-amount').fill('15000')
        self.page.locator('#save-transaction').click()
        expect(self.page.locator('#balance-total')).to_have_text('85,000원')
        self.page.locator('#search').fill('존재하지않는검색어')
        expect(self.page.locator('#transactions-list tr')).to_have_count(0)
        self.page.locator('#search').fill('점심')
        expect(self.page.locator('#transactions-list tr')).to_have_count(1)
        self.page.once('dialog', lambda dialog: dialog.accept())
        self.page.locator('button[data-action="delete"]').click()
        expect(self.page.locator('#expense-total')).to_have_text('0원')
        self.page.reload()
        self.page.locator('#all-period').check()
        expect(self.page.locator('#transactions-list tr')).to_have_count(2)
        self.assertEqual(len(self.stored()['transactions']), 2)

    def test_user_text_is_not_html_and_categories_are_safe(self):
        self.open_moneydash()
        payload = '<img src=x onerror="window.injected=1">'
        self.add(description=payload)
        expect(self.page.locator('#transactions-list')).to_contain_text(payload)
        self.assertEqual(self.page.locator('#transactions-list img').count(), 0)
        self.assertIsNone(self.page.evaluate('window.injected'))
        self.page.locator('#categories-btn').click()
        self.page.locator('#category-name').fill('여행')
        self.page.locator('#category-form button').click()
        expect(self.page.locator('#category-lists')).to_contain_text('여행')
        self.page.locator('#category-name').fill('여행')
        self.page.locator('#category-form button').click()
        expect(self.page.locator('#category-error')).to_contain_text('같은 이름')
        self.assertEqual(self.page.locator('button[data-category="식비"]').count(), 0)
        self.page.locator('button[data-category="여행"]').click()
        self.assertNotIn('여행', self.stored()['categories']['expense'])

    def test_existing_data_migrates_without_modifying_original_keys(self):
        self.open_moneydash()
        legacy = [{'date': '2026-10-01', 'type': 'income', 'amount': 3000000, 'category': '월급', 'description': '기존 기록'},
                  {'date': '2026-10-02', 'type': 'expense', 'amount': 10000, 'category': '이전 카테고리', 'description': '식사'}]
        categories = {'income': ['월급'], 'expense': ['식비']}
        original = json.dumps(legacy, ensure_ascii=False)
        self.page.evaluate('([tx, cats]) => { localStorage.setItem("transactions", tx); localStorage.setItem("customCategories", cats); }', [original, json.dumps(categories)])
        self.page.reload()
        self.assertEqual(len(self.stored()['transactions']), 2)
        self.assertIn('이전 카테고리', self.stored()['categories']['expense'])
        self.assertEqual(self.page.evaluate('localStorage.getItem("transactions")'), original)
        expect(self.page.locator('#notice')).to_contain_text('기존 가계부 기록')

    def test_backup_restore_roundtrip_rejects_invalid_and_cancel_is_safe(self):
        self.open_moneydash()
        self.add()
        with self.page.expect_download() as download_info:
            self.page.locator('#export-data').click()
        backup = json.loads(Path(download_info.value.path()).read_text())
        self.assertEqual(backup['format'], 'moneydash-backup')
        self.add('income', '90000')
        unchanged = self.stored()
        broken = json.loads(json.dumps(backup))
        broken['transactions'][0]['amount'] = -1
        self.upload(broken)
        expect(self.page.locator('#notice')).to_contain_text('복원하지 못했습니다')
        self.assertEqual(self.stored(), unchanged)
        self.page.once('dialog', lambda dialog: dialog.dismiss())
        self.upload(backup)
        self.page.wait_for_timeout(100)
        self.assertEqual(self.stored(), unchanged)
        self.page.once('dialog', lambda dialog: dialog.accept())
        self.upload(backup)
        expect(self.page.locator('#notice')).to_contain_text('1건의 기록을 복원')
        self.assertEqual(self.stored()['transactions'], backup['transactions'])
        self.assertIsNotNone(self.page.evaluate('localStorage.getItem("moneydash:before-restore")'))

    def test_corrupt_storage_is_preserved_and_recovery_is_possible(self):
        self.open_moneydash()
        self.page.evaluate('(key) => localStorage.setItem(key, "{broken")', KEY)
        self.page.reload()
        expect(self.page.locator('#add-transaction')).to_be_disabled()
        self.assertEqual(self.page.evaluate('(key) => localStorage.getItem(key)', KEY), '{broken')
        with self.page.expect_download() as info:
            self.page.locator('#export-data').click()
        self.assertEqual(json.loads(Path(info.value.path()).read_text())['stored'], '{broken')
        backup = {'format': 'moneydash-backup', 'version': 1, 'transactions': [], 'categories': {'expense': ['식비'], 'income': ['월급']}}
        self.page.once('dialog', lambda dialog: dialog.accept())
        self.upload(backup)
        expect(self.page.locator('#add-transaction')).to_be_enabled()
        self.assertEqual(self.stored()['transactions'], [])

    def test_storage_write_failure_does_not_claim_success(self):
        self.open_moneydash()
        self.page.evaluate('() => { Storage.prototype.setItem = function() { throw new DOMException("full", "QuotaExceededError"); }; }')
        self.page.locator('#add-transaction').click()
        self.page.locator('#transaction-amount').fill('1234')
        self.page.locator('#save-transaction').click()
        expect(self.page.locator('#form-error')).to_contain_text('저장하지 못했습니다')
        expect(self.page.locator('#transaction-dialog')).to_be_visible()
        self.assertIsNone(self.stored())
        expect(self.page.locator('#balance-total')).to_have_text('0원')

    def test_lottery_published_draws_leading_zero_and_existing_generators(self):
        data = draw_fixture()
        self.page.route(SOURCE, lambda route: route.fulfill(json=data))
        self.page.goto(self.base + '/showmethemoney/')
        expect(self.page.locator('#lotto-draw-meta')).to_contain_text(str(data['lotto'][0]['round']))
        expect(self.page.locator('#pension-draw-meta')).to_contain_text(str(data['pension'][0]['round']))
        expect(self.page.locator('#lotto-winning-numbers .winning-ball')).to_have_count(7)
        self.assertEqual(self.page.locator('.pension-digit').all_text_contents(), list('012345'))
        self.page.locator('#lotto-count').fill('3')
        self.page.locator('#lotto-selected-numbers').fill('5,10,20')
        self.page.locator('[onclick="generateLottoNumbers()"]').click()
        import re
        lines = self.page.locator('#lotto-numbers').inner_text().splitlines()
        self.assertEqual(len(lines), 3)
        for line in lines:
            numbers = list(map(int, re.findall(r'\d+', line)))[1:]
            self.assertEqual(len(set(numbers)), 6)
            self.assertTrue({5, 10, 20}.issubset(numbers))
        self.page.locator('#pension-option').select_option('all-same')
        self.page.locator('[onclick="generatePensionNumbers()"]').click()
        pension = self.page.locator('#pension-numbers').inner_text().splitlines()
        self.assertEqual(len(pension), 5)
        self.assertEqual(len(set(item.split()[1] for item in pension)), 1)
        self.page.unroute(SOURCE)
        self.page.route(SOURCE, lambda route: route.abort())
        self.page.locator('#refresh-results').click()
        expect(self.page.locator('#lotto-draw-status')).to_contain_text('이전에 확인한 번호')
        expect(self.page.locator('#pension-draw-status')).to_contain_text('이전에 확인한 번호')

    def test_lottery_rejects_invalid_data_and_displays_failures_without_cache(self):
        data = draw_fixture()
        data['lotto'][0]['numbers'] = [1] * 6
        data['pension'][0]['number'] = '12345'
        self.page.route(SOURCE, lambda route: route.fulfill(json=data))
        self.page.goto(self.base + '/showmethemoney/')
        expect(self.page.locator('#lotto-draw-status')).to_contain_text('불러오지 못했습니다')
        expect(self.page.locator('#pension-draw-status')).to_contain_text('불러오지 못했습니다')
        self.assertEqual(self.page.locator('.winning-ball').count(), 0)

    def test_other_tab_refreshes_after_changes_and_storage_recovery(self):
        self.open_moneydash()
        other = self.context.new_page()
        other.on('pageerror', lambda error: self.errors.append(str(error)))
        other.goto(self.base + '/moneydash/')
        other.locator('#month-filter').fill('2026-10')
        other.locator('#month-filter').dispatch_event('change')
        self.add()
        expect(other.locator('#expense-total')).to_have_text('12,000원')
        valid = self.page.evaluate('(key) => localStorage.getItem(key)', KEY)
        self.page.evaluate('(key) => localStorage.setItem(key, "{broken")', KEY)
        expect(other.locator('#add-transaction')).to_be_disabled()
        self.page.evaluate('([key, value]) => localStorage.setItem(key, value)', [KEY, valid])
        expect(other.locator('#add-transaction')).to_be_enabled()
        expect(other.locator('#expense-total')).to_have_text('12,000원')
        other.close()

    def test_home_does_not_interpret_private_ledger_storage_as_notes(self):
        self.open_moneydash()
        payload = '</textarea><img src=x onerror="window.injected=1">'
        self.add(description=payload)
        self.page.route('https://cdn.jsdelivr.net/npm/marked/marked.min.js', lambda route: route.fulfill(body='window.marked = {parse: (text) => text};', content_type='application/javascript'))
        self.page.goto(self.base + '/')
        expect(self.page.locator('#patch-notes-content')).to_contain_text('MoneyDash')
        self.assertEqual(self.page.locator('.note-item').count(), 0)
        self.assertEqual(self.page.locator('.note-container img').count(), 0)
        self.assertIsNone(self.page.evaluate('window.injected'))

    def test_lottery_stale_results_and_independent_game_validation(self):
        old = draw_fixture()
        for game in ['lotto', 'pension']:
            date_value = date.fromisoformat(f"{old[game][0]['date'][:4]}-{old[game][0]['date'][4:6]}-{old[game][0]['date'][6:]}") - timedelta(days=21)
            old[game][0]['date'] = date_value.strftime('%Y%m%d')
            old[game][0]['round'] -= 3
        self.page.route(SOURCE, lambda route: route.fulfill(json=old))
        self.page.goto(self.base + '/showmethemoney/')
        expect(self.page.locator('#lotto-draw-status')).to_contain_text('새 회차 데이터가 아직')
        expect(self.page.locator('#pension-draw-status')).to_contain_text('새 회차 데이터가 아직')
        # One malformed game must not prevent the other game from updating.
        newer = draw_fixture()
        newer['pension'][0]['group'] = 9
        self.page.unroute(SOURCE)
        self.page.route(SOURCE, lambda route: route.fulfill(json=newer))
        self.page.locator('#refresh-results').click()
        expect(self.page.locator('#lotto-draw-meta')).to_contain_text(str(newer['lotto'][0]['round']))
        expect(self.page.locator('#pension-draw-meta')).to_contain_text(str(old['pension'][0]['round']))
        expect(self.page.locator('#pension-draw-status')).to_contain_text('이전에 확인한 번호')

    def test_mobile_layout_has_no_page_overflow(self):
        self.page.set_viewport_size({'width': 375, 'height': 812})
        self.page.route(SOURCE, lambda route: route.fulfill(json=draw_fixture()))
        for path in ['moneydash', 'showmethemoney']:
            self.page.goto(self.base + f'/{path}/')
            self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), 375, path)
        self.page.goto(self.base + '/moneydash/')
        self.page.locator('#mobile-categories-btn').click()
        expect(self.page.locator('#category-dialog')).to_be_visible()
        self.page.locator('[data-close="category-dialog"]').click()
        self.page.locator('#add-transaction').click()
        expect(self.page.locator('#transaction-dialog')).to_be_visible()
        self.assertLessEqual(self.page.locator('#transaction-dialog').bounding_box()['width'], 375)


if __name__ == '__main__':
    unittest.main(verbosity=2)
