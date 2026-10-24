import test from "node:test";
import assert from "node:assert/strict";
import {
  MODELS,
  normalizeForecast,
  compareForecasts,
  summarize,
  nextDate,
} from "../isitraining/forecast.mjs";

const anchor = Date.parse("2026-10-23T15:00:00Z") / 1000; // Korea, October 24 at 00:00.
const now = anchor + 12 * 3600 + 1200;
const data = (amount = 0, chance = 10) => ({
  timezone: "Asia/Seoul",
  hourly_units: {
    precipitation: "mm",
    temperature_2m: "°C",
    precipitation_probability: "%",
  },
  hourly: {
    time: Array.from({ length: 72 }, (_, i) => anchor + i * 3600),
    precipitation: Array(72).fill(amount),
    temperature_2m: Array(72).fill(18),
    precipitation_probability: Array(72).fill(chance),
  },
});
const model = (index, amount = 0, chance = 10) =>
  normalizeForecast(data(amount, chance), MODELS[index].id);

test("keeps null, invalid amounts and missing probabilities distinct from zero", () => {
  const raw = data();
  raw.hourly.precipitation[13] = null;
  raw.hourly.precipitation[14] = "0";
  raw.hourly.precipitation_probability[13] = null;
  const forecast = normalizeForecast(raw, MODELS[0].id);
  assert.equal(forecast.hours.get(anchor + 13 * 3600).amount, null);
  assert.equal(forecast.hours.get(anchor + 14 * 3600).amount, null);
  assert.equal(forecast.hours.get(anchor + 13 * 3600).probability, null);
  assert.throws(() =>
    normalizeForecast(
      { ...raw, hourly_units: { precipitation: "inch" } },
      MODELS[0].id,
    ),
  );
});

test("aligns precipitation to the preceding hour and excludes completed intervals", () => {
  const result = compareForecasts([model(0), model(1), model(2)], now);
  assert.equal(result.rows[0].label, "12:00–13:00");
  assert.equal(result.rows[0].day, "2026-10-24");
  assert.equal(result.rows[0].end, anchor + 13 * 3600);
  assert.equal(
    result.rows.filter((row) => row.day === result.today).length,
    12,
  );
  assert.equal(
    result.rows.filter((row) => row.day === result.tomorrow).length,
    24,
  );
  assert.equal(
    result.rows.find((row) => row.label === "23:00–00:00").day,
    result.today,
  );
});

test("compares votes and keeps a probability range without inventing a combined probability", () => {
  const result = compareForecasts(
    [model(0, 0.2, 20), model(1, 1, 80), model(2, 0, 40)],
    now,
  );
  const row = result.rows[0];
  assert.equal(row.wet, 2);
  assert.equal(row.available, 3);
  assert.equal(row.kind, "wet");
  assert.deepEqual(row.probability, [20, 80]);
  assert.deepEqual(row.amount, [0, 1]);
  assert.equal(row.probabilityCount, 3);
  assert.match(summarize(result.rows).text, /3개 중 2개/);
});

test("a tied model split is uncertain, not a dry consensus", () => {
  const result = compareForecasts([model(0, 0.3), model(1, 0)], now);
  assert.equal(result.rows[0].kind, "mixed");
  assert.equal(summarize(result.rows).kind, "mixed");
  assert.equal(summarize(result.rows).incomplete, true);
});

test("one available model or a gap in all models cannot establish a dry forecast", () => {
  assert.equal(
    summarize(compareForecasts([model(0)], now).rows).kind,
    "insufficient",
  );
  const raw = data();
  raw.hourly.precipitation[13] = null;
  const forecasts = MODELS.map((m) => normalizeForecast(raw, m.id));
  const result = compareForecasts(forecasts, now);
  assert.equal(result.rows[0].available, 0);
  assert.equal(result.rows[0].amount, null);
  assert.equal(summarize(result.rows).kind, "insufficient");
});

test("a high model probability still prompts an umbrella even with zero point rainfall", () => {
  const result = compareForecasts(
    [model(0, 0, 70), model(1, 0, 20), model(2, 0, 10)],
    now,
  );
  assert.equal(result.rows[0].kind, "dry");
  assert.equal(summarize(result.rows).kind, "wet");
  assert.match(summarize(result.rows).text, /강수확률/);
});

test("all models below amount and chance thresholds produce a qualified dry message", () => {
  const verdict = summarize(
    compareForecasts([model(0), model(1), model(2)], now).rows,
  );
  assert.equal(verdict.kind, "dry");
  assert.match(verdict.text, /보장은 아니에요/);
});

test("rejects corrupt time axes and preserves calendar-day boundaries", () => {
  const raw = data();
  raw.hourly.time[2] += 60;
  assert.throws(() => normalizeForecast(raw, MODELS[0].id));
  assert.equal(nextDate("2026-12-31"), "2027-01-01");
  assert.equal(nextDate("2028-02-28"), "2028-02-29");
});

test("expired forecasts cannot be presented as a new clear forecast", () => {
  const result = compareForecasts(
    [model(0), model(1), model(2)],
    anchor + 5 * 86400,
  );
  assert.ok(result.rows.every((row) => row.available === 0));
  assert.equal(summarize(result.rows).kind, "insufficient");
});
