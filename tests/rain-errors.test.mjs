import test from 'node:test';
import assert from 'node:assert/strict';
import { ForecastError, failureMessage, summarizeFailures } from '../isitrainy/weather-errors.mjs';

test('distinguishes rate limits, provider errors, and rejected requests', () => {
  assert.match(failureMessage(new ForecastError('http', 429)), /조회 한도.*429/);
  assert.match(failureMessage(new ForecastError('http', 503)), /제공 서버.*503/);
  assert.match(failureMessage(new ForecastError('http', 400)), /요청을 거부.*400/);
});
test('distinguishes abort timeouts, browser connection failure and malformed data', () => {
  assert.match(failureMessage(new DOMException('aborted', 'AbortError')), /시간이 초과/);
  assert.match(failureMessage(new TypeError('private request URL')), /API에 연결/);
  assert.match(failureMessage(new ForecastError('format')), /응답 형식/);
  assert.match(failureMessage(new SyntaxError('provider body')), /응답 형식/);
});
test('missing current data is distinct from a network failure', () => {
  assert.match(failureMessage(new ForecastError('no_data')), /현재 시각.*날짜/);
});
test('deduplicates model failures without exposing raw errors or location URLs', () => {
  const result = summarizeFailures([new TypeError('latitude=37.123456'), new TypeError('sensitive provider URL')]);
  assert.equal(result, failureMessage(new TypeError()));
  assert.doesNotMatch(result, /37\.123456|sensitive/);
});
