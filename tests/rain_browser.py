"""Rain page browser checks using simulated forecasts and browser location permissions."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timedelta, timezone
import os
import shutil
import unittest
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
MODELS = ['ecmwf_ifs025', 'gfs_seamless', 'icon_seamless']


def fixture(amount=0, chance=10):
    now = datetime.now(timezone.utc)
    kst = now.astimezone(timezone(timedelta(hours=9)))
    start = kst.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    times = [int((start + timedelta(hours=i)).timestamp()) for i in range(72)]
    return {'timezone': 'Asia/Seoul', 'hourly_units': {'precipitation': 'mm', 'temperature_2m': '°C', 'precipitation_probability': '%'}, 'hourly': {'time': times, 'precipitation': [amount] * 72, 'temperature_2m': [18] * 72, 'precipitation_probability': [chance] * 72}}


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_): pass


class RainBrowser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
        Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'
        cls.playwright = sync_playwright().start()
        executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('google-chrome')
        cls.browser = cls.playwright.chromium.launch(headless=True, **({'executable_path': executable} if executable else {}))

    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.playwright.stop(); cls.server.shutdown(); cls.server.server_close()

    def setUp(self):
        self.context = self.browser.new_context(geolocation={'latitude': 37.57, 'longitude': 126.98}, permissions=['geolocation'])
        self.context.route('https://**/*', lambda route: route.abort())
        self.requests = []
        self.errors = []
        self.handler = self.default_handler
        def handle(route):
            query = parse_qs(urlparse(route.request.url).query)
            self.requests.append(query)
            self.handler(route, query['models'][0])
        self.context.route('https://api.open-meteo.com/v1/forecast?**', handle)
        self.page = self.context.new_page()
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.goto(self.base + '/isitrainy/')

    def tearDown(self):
        try: self.assertEqual(self.errors, [])
        finally: self.context.close()

    def default_handler(self, route, model):
        route.fulfill(json=fixture(.8 if model != MODELS[2] else 0, 70 if model == MODELS[0] else 20))

    def test_no_location_request_on_load_and_gps_only_after_click(self):
        self.assertEqual(len(self.requests), 0)
        expect(self.page.locator('#welcome')).to_be_visible()
        self.page.locator('#locate').click()
        expect(self.page.locator('#place-name')).to_have_text('현재 위치')
        expect(self.page.locator('#verdict-title')).to_have_text('우산을 챙기는 편이 좋아요')
        expect(self.page.locator('#model-count')).to_have_text('3 / 3')
        self.assertEqual(len(self.requests), 3)
        self.assertTrue(all(float(q['latitude'][0]) == 37.57 and float(q['longitude'][0]) == 126.98 for q in self.requests))
        self.assertEqual(self.page.evaluate('localStorage.length'), 0)
        self.assertEqual(self.page.evaluate('sessionStorage.length'), 0)
        self.page.locator('#tomorrow-tab').click()
        expect(self.page.locator('.hour-card')).to_have_count(24)
        self.assertEqual(len(self.requests), 3)

    def test_denied_location_offers_city_search_without_fetching_weather(self):
        self.page.evaluate('''() => { navigator.geolocation.getCurrentPosition = (success, error) => error({code: 1}); }''')
        self.page.locator('#locate').click()
        expect(self.page.locator('#location-status')).to_contain_text('위치 사용이 허용되지')
        expect(self.page.locator('#location-status')).to_contain_text('도시 검색')
        self.assertEqual(len(self.requests), 0)
        expect(self.page.locator('#locate')).to_be_enabled()

    def test_search_selects_result_and_never_treats_api_names_as_html(self):
        payload = '<img src=x onerror="window.injected=1">'
        self.page.route('https://geocoding-api.open-meteo.com/v1/search?**', lambda route: route.fulfill(json={'results': [{'name': payload, 'country_code': 'KR', 'latitude': 35.18, 'longitude': 129.08, 'admin1': '부산', 'country': '대한민국'}]}))
        self.page.locator('#city-query').fill('부산')
        self.page.locator('#search-button').click()
        expect(self.page.locator('.city-result')).to_have_count(1)
        expect(self.page.locator('.city-result')).to_contain_text(payload)
        self.page.locator('.city-result').click()
        expect(self.page.locator('#place-name')).to_have_text(payload)
        self.assertEqual(self.page.locator('img').count(), 0)
        self.assertTrue(all(float(q['latitude'][0]) == 35.18 for q in self.requests))

    def test_partial_failure_is_not_a_three_model_consensus(self):
        def partial(route, model):
            if model == MODELS[2]: route.abort()
            else: route.fulfill(json=fixture(0))
        self.handler = partial
        self.page.locator('[data-city=seoul]').click()
        expect(self.page.locator('#model-count')).to_have_text('2 / 3')
        expect(self.page.locator('#forecast-status')).to_contain_text('1개 모델')
        expect(self.page.locator('#model-cards')).to_contain_text('비교 자료 없음')
        self.assertTrue(all('2개 중 0개' in text for text in self.page.locator('.hour-count').all_text_contents()))

    def test_single_model_is_insufficient_and_total_failure_does_not_show_sunshine(self):
        def partial(route, model):
            if model != MODELS[0]: route.abort()
            else: route.fulfill(json=fixture(0))
        self.handler = partial
        self.page.locator('[data-city=seoul]').click()
        expect(self.page.locator('#verdict-title')).to_have_text('비교할 예보가 부족해요')
        self.handler = lambda route, model: route.abort()
        self.page.locator('[data-city=busan]').click()
        expect(self.page.locator('#forecast-status')).to_contain_text('날씨 자료를 가져오지 못했습니다')
        expect(self.page.locator('#forecast')).not_to_be_visible()
        expect(self.page.locator('#welcome')).to_be_visible()

    def test_failed_refresh_keeps_clearly_labeled_previous_results(self):
        self.page.locator('[data-city=seoul]').click()
        expect(self.page.locator('#forecast')).to_be_visible()
        self.handler = lambda route, model: route.abort()
        self.page.locator('#refresh').click()
        expect(self.page.locator('#forecast-status')).to_contain_text('이전 조회 자료')
        expect(self.page.locator('#place-name')).to_have_text('서울')
        expect(self.page.locator('#checked-at')).to_contain_text('조회')

    def test_delayed_gps_does_not_override_a_newer_city_selection(self):
        self.page.evaluate('''() => { navigator.geolocation.getCurrentPosition = (success) => { window.completeLocation = success; }; }''')
        self.page.locator('#locate').click()
        self.page.locator('[data-city=busan]').click()
        expect(self.page.locator('#place-name')).to_have_text('부산')
        self.page.evaluate('window.completeLocation({coords:{latitude:37.57, longitude:126.98, accuracy:50}})')
        expect(self.page.locator('#locate')).to_be_enabled()
        expect(self.page.locator('#place-name')).to_have_text('부산')
        self.assertEqual(len(self.requests), 3)

    def test_cheonan_search_uses_korean_city_name_and_correct_weather_coordinates(self):
        queries = []
        def geocode(route):
            params = parse_qs(urlparse(route.request.url).query)
            queries.append(params)
            result = {'id':1845759, 'name':'천안시', 'country_code':'KR', 'country':'대한민국', 'admin1':'충청남도', 'admin2':'천안시', 'feature_code':'PPLA2', 'population':658831, 'latitude':36.8065, 'longitude':127.1522} if params['name'][0] == '천안시' else {'id':13550479, 'name':'천안', 'country_code':'KP', 'country':'북한', 'admin1':'강원도', 'admin2':'이천군', 'latitude':38.49907, 'longitude':126.90094}
            route.fulfill(json={'results':[result]})
        self.page.route('https://geocoding-api.open-meteo.com/v1/search?**', geocode)
        expect(self.page.locator('#search-scope')).to_have_value('KR')
        self.page.locator('#city-query').fill('천안')
        self.page.locator('#search-button').click()
        expect(self.page.locator('.city-result')).to_have_count(1)
        expect(self.page.locator('.city-result')).to_contain_text('대한민국 · 충청남도 · 천안시')
        self.assertEqual({q['name'][0] for q in queries}, {'천안', '천안시'})
        self.assertTrue(all(q.get('countryCode') == ['KR'] for q in queries))
        self.page.locator('.city-result').click()
        expect(self.page.locator('#place-name')).to_have_text('천안시')
        expect(self.page.locator('#place-detail')).to_contain_text('충청남도')
        self.assertTrue(all(float(q['latitude'][0]) == 36.8065 and float(q['longitude'][0]) == 127.1522 for q in self.requests))

    def test_global_scope_preserves_overseas_city_search(self):
        queries = []
        def geocode(route):
            queries.append(parse_qs(urlparse(route.request.url).query))
            route.fulfill(json={'results':[{'id':1850147, 'name':'도쿄', 'country':'일본', 'country_code':'JP', 'admin1':'도쿄도', 'latitude':35.6895, 'longitude':139.6917}]})
        self.page.route('https://geocoding-api.open-meteo.com/v1/search?**', geocode)
        self.page.locator('#search-scope').select_option('all')
        self.page.locator('#city-query').fill('Tokyo')
        self.page.locator('#search-button').click()
        expect(self.page.locator('.city-result')).to_contain_text('일본 · 도쿄도')
        self.assertNotIn('countryCode',queries[0])
        self.page.locator('.city-result').click()
        expect(self.page.locator('#place-name')).to_have_text('도쿄')
        self.assertTrue(all(float(q['longitude'][0]) == 139.6917 for q in self.requests))

    def test_no_domestic_matches_does_not_silently_search_other_countries(self):
        queries = []
        def geocode(route):
            queries.append(parse_qs(urlparse(route.request.url).query))
            route.fulfill(json={'results':[]})
        self.page.route('https://geocoding-api.open-meteo.com/v1/search?**',geocode)
        self.page.locator('#city-query').fill('없는지역')
        self.page.locator('#search-button').click()
        expect(self.page.locator('#location-status')).to_contain_text('대한민국에서 검색 결과가 없어요')
        expect(self.page.locator('.city-result')).to_have_count(0)
        self.assertTrue(all(q.get('countryCode') == ['KR'] for q in queries))
        self.assertEqual(self.requests,[])

    def test_mobile_layout_and_keyboard_search(self):
        for width in [320, 375, 768, 1280]:
            self.page.set_viewport_size({'width': width, 'height': 900})
            self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), width)
        self.page.locator('[data-city=jeju]').click()
        expect(self.page.locator('#forecast')).to_be_visible()
        for width in [320, 375, 768, 1280]:
            self.page.set_viewport_size({'width': width, 'height': 900})
            self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), width)
            expect(self.page.locator('#refresh')).to_be_visible()


if __name__ == '__main__': unittest.main(verbosity=2)
