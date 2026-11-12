export const MAX_AMOUNT = 1_000_000_000_000;
export const DEFAULT_ROWS = [
  { name: "S&P500", pct: "60", price: "" },
  { name: "나스닥100", pct: "20", price: "" },
  { name: "다우존스", pct: "10", price: "" },
  { name: "금현물", pct: "5", price: "" },
  { name: "채권", pct: "5", price: "" },
];

export function amount(value, allowBlank = false) {
  const text = String(value).trim();
  if (!text && allowBlank) return null;
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text))
    throw new Error("금액은 0 이상의 정수로 입력하세요.");
  const result = Number(text.replaceAll(",", ""));
  if (!Number.isSafeInteger(result) || result > MAX_AMOUNT)
    throw new Error("금액은 1조 원 이하로 입력하세요.");
  return result;
}
export function weight(value) {
  const text = String(value).trim();
  if (!text) return 0n;
  if (!/^\d+(?:\.\d{1,4})?$/.test(text) || Number(text) > 1_000_000)
    throw new Error("비중은 0 이상, 소수점 4자리까지 입력하세요.");
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"));
}
export function validateSettings(value) {
  if (
    !value ||
    value.version !== 2 ||
    !Array.isArray(value.rows) ||
    value.rows.length > 100 ||
    !["string", "number"].includes(typeof value.total)
  )
    throw new Error("설정 파일 형식이 올바르지 않습니다.");
  amount(value.total, true);
  const rows = value.rows.map((row) => {
    if (
      !row ||
      typeof row.name !== "string" ||
      row.name.length > 100 ||
      !["string", "number"].includes(typeof row.pct) ||
      !["string", "number"].includes(typeof row.price)
    )
      throw new Error("종목 설정이 올바르지 않습니다.");
    weight(row.pct);
    amount(row.price, true);
    return { name: row.name, pct: String(row.pct), price: String(row.price) };
  });
  return { version: 2, total: String(value.total), rows };
}

export function calculate(totalInput, rows) {
  const total = amount(totalInput, true);
  const weights = rows.map((row) => weight(row.pct));
  const prices = rows.map((row) => amount(row.price, true));
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (total === null || sum === 0n)
    return {
      total,
      sum: Number(sum) / 10000,
      allocations: null,
      purchases: null,
      spent: null,
      remaining: null,
    };
  const numerators = weights.map((value) => BigInt(total) * value);
  const allocations = numerators.map((value) => Number(value / sum));
  const order = numerators
    .map((value, i) => ({ i, remainder: value % sum }))
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.i - b.i
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
  const undistributed = total - allocations.reduce((a, b) => a + b, 0);
  for (let i = 0; i < undistributed; i++) allocations[order[i].i] += 1;
  const purchases = allocations.map((budget, i) => {
    if (!budget) return { shares: 0, cost: 0, remainder: 0 };
    if (!prices[i]) return null;
    const shares = Math.floor(budget / prices[i]);
    return {
      shares,
      cost: shares * prices[i],
      remainder: budget - shares * prices[i],
    };
  });
  const complete = purchases.every((value) => value !== null);
  const spent = complete
    ? purchases.reduce((sum, value) => sum + value.cost, 0)
    : null;
  return {
    total,
    sum: Number(sum) / 10000,
    allocations,
    purchases,
    spent,
    remaining: complete ? total - spent : null,
  };
}
