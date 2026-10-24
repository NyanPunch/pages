export const MODELS = [
  {
    id: "ecmwf_ifs025",
    name: "ECMWF IFS",
    center: "유럽중기예보센터",
    color: "#67a797",
  },
  {
    id: "gfs_seamless",
    name: "NOAA GFS",
    center: "미국 해양대기청",
    color: "#7c9fc6",
  },
  {
    id: "icon_seamless",
    name: "DWD ICON",
    center: "독일 기상청",
    color: "#c4ac7b",
  },
];
export const RAIN_THRESHOLD = 0.1;

export function dateKey(timestamp, timezone) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp * 1000));
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function nextDate(key) {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
export function hourLabel(timestamp, timezone) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(timestamp * 1000));
}
const finite = (value, min, max) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;

export function normalizeForecast(data, modelId) {
  const hourly = data?.hourly;
  if (
    !MODELS.some((model) => model.id === modelId) ||
    !hourly ||
    !Array.isArray(hourly.time) ||
    hourly.time.length < 2 ||
    !Array.isArray(hourly.precipitation) ||
    hourly.time.length !== hourly.precipitation.length ||
    data.hourly_units?.precipitation !== "mm" ||
    typeof data.timezone !== "string"
  )
    throw new Error("예보 응답 형식이 올바르지 않습니다.");
  dateKey(hourly.time[0], data.timezone);
  if (
    hourly.time.some(
      (time, i) =>
        !Number.isSafeInteger(time) ||
        (i && time - hourly.time[i - 1] !== 3600),
    )
  )
    throw new Error("시간대별 예보 간격이 올바르지 않습니다.");
  const hours = new Map();
  hourly.time.forEach((time, i) => {
    const amount = hourly.precipitation[i];
    const temperature = hourly.temperature_2m?.[i];
    const probability = hourly.precipitation_probability?.[i];
    hours.set(time, {
      amount: finite(amount, 0, 2000) ? amount : null,
      temperature:
        data.hourly_units.temperature_2m === "°C" &&
        finite(temperature, -100, 70)
          ? temperature
          : null,
      probability:
        data.hourly_units.precipitation_probability === "%" &&
        finite(probability, 0, 100)
          ? probability
          : null,
    });
  });
  return {
    id: modelId,
    timezone: data.timezone,
    anchor: hourly.time[0],
    hours,
  };
}

export function compareForecasts(forecasts, now = Date.now() / 1000) {
  if (!forecasts.length) throw new Error("사용할 수 있는 예보가 없습니다.");
  const timezone = forecasts[0].timezone;
  const today = dateKey(now, timezone);
  const tomorrow = nextDate(today);
  const anchor = forecasts[0].anchor;
  const first = anchor + (Math.floor((now - anchor) / 3600) + 1) * 3600;
  const rows = [];
  // Precipitation is the sum of the preceding hour. Label that interval, not the next one.
  for (let end = first; end <= first + 72 * 3600; end += 3600) {
    const start = end - 3600;
    const day = dateKey(start, timezone);
    if (day > tomorrow) break;
    const sources = MODELS.map((model) => {
      const forecast = forecasts.find(
        (value) => value.id === model.id && value.timezone === timezone,
      );
      const value = forecast?.hours.get(end);
      return {
        id: model.id,
        amount: value?.amount ?? null,
        probability: value?.probability ?? null,
        temperature: value?.temperature ?? null,
      };
    });
    const amounts = sources
      .map((source) => source.amount)
      .filter((value) => value !== null);
    const probabilities = sources
      .map((source) => source.probability)
      .filter((value) => value !== null);
    const temperatures = sources
      .map((source) => source.temperature)
      .filter((value) => value !== null);
    const wet = amounts.filter((value) => value >= RAIN_THRESHOLD).length;
    const available = amounts.length;
    const range = (values) =>
      values.length ? [Math.min(...values), Math.max(...values)] : null;
    rows.push({
      start,
      end,
      day,
      label: `${hourLabel(start, timezone)}–${hourLabel(end, timezone)}`,
      sources,
      wet,
      available,
      kind:
        available < 2
          ? "insufficient"
          : wet > available / 2
            ? "wet"
            : wet
              ? "mixed"
              : "dry",
      amount: range(amounts),
      probability: range(probabilities),
      probabilityCount: probabilities.length,
      temperature: range(temperatures),
    });
  }
  return { timezone, today, tomorrow, rows };
}

export function summarize(rows) {
  if (!rows.length || rows.every((row) => row.available < 2))
    return {
      kind: "insufficient",
      title: "비교할 예보가 부족해요",
      text: "두 개 이상 모델의 자료가 있어야 비교할 수 있어요. 잠시 후 다시 확인해 주세요.",
    };
  const incomplete = rows.some((row) => row.available < MODELS.length);
  const missing = rows.some((row) => row.available < 2);
  const wet = rows.find((row) => row.kind === "wet");
  const highChance = rows.find(
    (row) => row.probability && row.probability[1] >= 60,
  );
  const mixed = rows.find(
    (row) =>
      row.kind === "mixed" || (row.probability && row.probability[1] >= 30),
  );
  if (wet || highChance)
    return {
      kind: "wet",
      title: "우산을 챙기는 편이 좋아요",
      text: wet
        ? `${wet.label}에 ${wet.available}개 중 ${wet.wet}개 모델이 강수를 예상해요.`
        : `${highChance.label}에 한 모델 이상에서 강수확률을 60% 이상으로 예보해요.`,
      incomplete,
    };
  if (mixed)
    return {
      kind: "mixed",
      title: "예보가 엇갈려요",
      text: "일부 모델에서 비·눈 가능성을 예상해요. 외출 직전에 다시 확인해 보세요.",
      incomplete,
    };
  if (missing)
    return {
      kind: "insufficient",
      title: "일부 시간의 예보가 부족해요",
      text: "자료가 없는 시간을 맑음으로 판단하지 않았어요. 다시 조회해 주세요.",
      incomplete,
    };
  return {
    kind: "dry",
    title: "뚜렷한 강수 예보는 없어요",
    text: "조회한 모델의 해당 시간 강수량이 모두 0.1mm 미만이에요. 비가 오지 않는다는 보장은 아니에요.",
    incomplete,
  };
}
