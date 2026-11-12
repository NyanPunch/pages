import test from "node:test";
import assert from "node:assert/strict";
import { calculate, validateSettings } from "../howtodistribute/allocation.mjs";
const rows = [
  { name: "S&P500", pct: "60", price: "45,000" },
  { name: "나스닥100", pct: "20", price: "25,000" },
  { name: "채권", pct: "20", price: "10,000" },
];
test("approved example shows actual purchases and unspent cash", () => {
  const value = calculate("500,000", rows);
  assert.deepEqual(value.allocations, [300000, 100000, 100000]);
  assert.deepEqual(
    value.purchases.map((x) => x.shares),
    [6, 4, 10],
  );
  assert.equal(value.spent, 470000);
  assert.equal(value.remaining, 30000);
});
test("whole-won allocation conserves the total with deterministic largest remainders", () => {
  const r = [
    { pct: "1", price: "1" },
    { pct: "1", price: "1" },
    { pct: "1", price: "1" },
    { pct: "0", price: "" },
  ];
  const value = calculate("500000", r);
  assert.deepEqual(value.allocations, [166667, 166667, 166666, 0]);
  assert.equal(value.spent, 500000);
  assert.equal(value.remaining, 0);
  for (const total of [0, 1, 2, 7, 999999999999]) {
    const result = calculate(String(total), r);
    assert.equal(
      result.allocations.reduce((a, b) => a + b, 0),
      total,
    );
    assert.ok(result.spent <= total);
  }
});
test("normalizes arbitrary nonnegative weights including decimal weights", () => {
  const r = rows.map((row) => ({ ...row, pct: String(Number(row.pct) / 2) }));
  assert.deepEqual(
    calculate("500000", r).allocations,
    calculate("500000", rows).allocations,
  );
  assert.deepEqual(
    calculate("3", [
      { pct: "0.5", price: "1" },
      { pct: "0.5", price: "1" },
    ]).allocations,
    [2, 1],
  );
});
test("rejects negative, invalid or excessive amounts and weights", () => {
  for (const value of ["-1", "NaN", "1e12", "1.5", "1,00", "1000000000001"])
    assert.throws(() => calculate(value, rows));
  for (const pct of ["-10", "Infinity", "1e3", "0.00001"])
    assert.throws(() => calculate("100", [{ pct, price: "1" }]));
});
test("missing prices do not masquerade as zero-cost purchases or a known cash balance", () => {
  const value = calculate("100", [
    { pct: "1", price: "" },
    { pct: "1", price: "100" },
  ]);
  assert.equal(value.purchases[0], null);
  assert.equal(value.spent, null);
  assert.equal(value.remaining, null);
  assert.equal(calculate("", rows).allocations, null);
  assert.equal(calculate("100", [{ pct: "", price: "" }]).allocations, null);
});
test("settings validate safely while preserving empty portfolios and literal names", () => {
  const settings = validateSettings({ version: 2, total: "", rows: [] });
  assert.equal(settings.rows.length, 0);
  const named = validateSettings({
    version: 2,
    total: "100",
    rows: [{ name: 'ETF "장기" <img>', pct: 10, price: "" }],
  });
  assert.equal(named.rows[0].name, 'ETF "장기" <img>');
  assert.equal(named.rows[0].pct, "10");
  assert.throws(() =>
    validateSettings({ version: 2, total: "100", rows: [null] }),
  );
});
