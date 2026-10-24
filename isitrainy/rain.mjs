import {
  MODELS,
  normalizeForecast,
  compareForecasts,
  summarize,
} from "./forecast.mjs";

const $ = (selector) => document.querySelector(selector);
const PRESETS = {
  seoul: {
    name: "서울",
    latitude: 37.5665,
    longitude: 126.978,
    detail: "대한민국",
  },
  busan: {
    name: "부산",
    latitude: 35.1796,
    longitude: 129.0756,
    detail: "대한민국",
  },
  jeju: {
    name: "제주",
    latitude: 33.4996,
    longitude: 126.5312,
    detail: "대한민국",
  },
};
let latest = null;
let selectedDay = "today";
let desiredPlace = null;
let forecastController = null;
let searchController = null;
let requestId = 0;
let lastAttempt = 0;
let locating = false;
let locationChoice = 0;

const element = (tag, className, text) => {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
};
const range = (values, unit = "", digits = 1) =>
  !values
    ? "자료 없음"
    : `${values[0].toFixed(digits)}${values[0] === values[1] ? "" : `–${values[1].toFixed(digits)}`}${unit}`;
const samePlace = (a, b) =>
  a && b && a.latitude === b.latitude && a.longitude === b.longitude;
const isStale = () => latest && Date.now() - latest.checkedAt > 15 * 60 * 1000;
function setStatus(message) {
  $("#forecast-status").textContent = message;
  $("#forecast-status").hidden = !message;
}
function validCoordinates(latitude, longitude) {
  return (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

async function getJson(url, signal) {
  const response = await fetch(url, {
    signal,
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
async function fetchModel(place, model, signal) {
  const query = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    hourly: "temperature_2m,precipitation,precipitation_probability",
    models: model.id,
    forecast_days: "3",
    timezone: "auto",
    timeformat: "unixtime",
    precipitation_unit: "mm",
    temperature_unit: "celsius",
  });
  return normalizeForecast(
    await getJson(`https://api.open-meteo.com/v1/forecast?${query}`, signal),
    model.id,
  );
}

async function loadForecast(place, newChoice = true) {
  if (newChoice) locationChoice += 1;
  if (!validCoordinates(place.latitude, place.longitude)) {
    setStatus(
      "이 지역의 좌표를 확인할 수 없습니다. 다른 지역을 선택해 주세요.",
    );
    return;
  }
  desiredPlace = place;
  forecastController?.abort();
  forecastController = new AbortController();
  const controller = forecastController;
  const id = ++requestId;
  lastAttempt = Date.now();
  $("#forecast").hidden = true;
  $("#welcome").hidden = true;
  $("#refresh").disabled = true;
  setStatus(`${place.name}의 세 가지 예보를 비교하고 있어요.`);
  const timeout = setTimeout(() => controller.abort(), 16000);
  try {
    const results = await Promise.allSettled(
      MODELS.map((model) => fetchModel(place, model, controller.signal)),
    );
    if (id !== requestId) return;
    const forecasts = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
    const useful = forecasts.filter((forecast) =>
      compareForecasts([forecast]).rows.some((row) => row.available > 0),
    );
    if (!useful.length) throw new Error("No forecast data");
    latest = { place: { ...place }, forecasts: useful, checkedAt: Date.now() };
    selectedDay = "today";
    render();
    const failed = MODELS.length - useful.length;
    setStatus(
      failed
        ? `${failed}개 모델의 자료를 가져오지 못했습니다. 조회된 자료만 비교하며, 없는 값을 맑음으로 처리하지 않아요.`
        : "",
    );
  } catch {
    if (id !== requestId) return;
    if (latest && samePlace(latest.place, place)) {
      render();
      setStatus(
        "새 예보를 가져오지 못했습니다. 이전 조회 자료를 표시합니다. 조회 시각을 확인하고 다시 시도해 주세요.",
      );
    } else {
      $("#forecast").hidden = true;
      $("#welcome").hidden = false;
      setStatus(
        "날씨 자료를 가져오지 못했습니다. 연결 상태를 확인하거나 다른 지역을 선택해 주세요.",
      );
    }
  } finally {
    clearTimeout(timeout);
    if (id === requestId) $("#refresh").disabled = false;
  }
}

function render() {
  if (!latest) return;
  const comparison = compareForecasts(latest.forecasts);
  const day = comparison[selectedDay];
  const rows = comparison.rows.filter((row) => row.day === day);
  const verdict = summarize(rows);
  $("#forecast").hidden = false;
  $("#welcome").hidden = true;
  $("#place-name").textContent = latest.place.name;
  $("#place-detail").textContent = latest.place.detail;
  $("#today-tab").setAttribute("aria-pressed", String(selectedDay === "today"));
  $("#tomorrow-tab").setAttribute(
    "aria-pressed",
    String(selectedDay === "tomorrow"),
  );
  $("#verdict").dataset.kind = isStale() ? "insufficient" : verdict.kind;
  $("#verdict-title").textContent = isStale()
    ? "이전 조회 자료입니다"
    : verdict.title;
  $("#verdict-description").textContent = isStale()
    ? "15분 이상 지난 자료예요. 새로고침해서 최근 예보를 확인해 주세요."
    : verdict.text;
  const counts = rows.map((row) => row.available);
  const minimum = counts.length ? Math.min(...counts) : 0;
  const maximum = counts.length ? Math.max(...counts) : 0;
  $("#coverage").textContent =
    `${day} · ${selectedDay === "today" ? "지금 이후" : "하루 전체"}${verdict.incomplete ? " · 일부 자료 누락" : ""}`;
  $("#checked-at").textContent =
    `조회 ${new Intl.DateTimeFormat("ko-KR", { timeZone: comparison.timezone, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(latest.checkedAt)}`;
  $("#wet-hours").textContent =
    `${rows.filter((row) => row.kind === "wet").length}시간`;
  $("#model-count").textContent =
    `${minimum === maximum ? maximum : `${minimum}–${maximum}`} / 3`;
  const temperatures = rows.flatMap((row) => row.temperature ?? []);
  $("#temperature").textContent = temperatures.length
    ? range([Math.min(...temperatures), Math.max(...temperatures)], "°", 0)
    : "자료 없음";
  $("#timezone-label").textContent = `${comparison.timezone} 시간 기준`;
  renderHours(rows);
  renderModels(rows);
}

function renderHours(rows) {
  const container = $("#hourly-cards");
  const scroll = container.scrollLeft;
  container.replaceChildren();
  for (const row of rows) {
    const card = element("article", "hour-card");
    card.dataset.kind = row.kind;
    card.append(element("p", "hour-time", row.label));
    card.append(
      element(
        "p",
        "hour-verdict",
        row.kind === "insufficient"
          ? "비교 부족"
          : row.kind === "wet"
            ? "강수 예상"
            : row.kind === "mixed"
              ? "예측 엇갈림"
              : "강수 적음",
      ),
    );
    card.append(
      element(
        "p",
        "hour-count",
        `${row.available}개 중 ${row.wet}개 강수 예측`,
      ),
    );
    const list = element("dl");
    list.append(
      element("dt", "", "모델별 강수량"),
      element("dd", "", range(row.amount, "mm")),
    );
    list.append(
      element("dt", "", "모델별 강수확률"),
      element(
        "dd",
        "",
        `${range(row.probability, "%", 0)}${row.probabilityCount ? ` (${row.probabilityCount}개)` : ""}`,
      ),
    );
    card.append(list);
    container.append(card);
  }
  if (!rows.length)
    container.append(
      element(
        "p",
        "section-copy",
        "이 날짜에 비교할 시간이 없습니다. 다른 날짜를 선택하거나 새로고침해 주세요.",
      ),
    );
  container.scrollLeft = scroll;
}
function renderModels(rows) {
  const container = $("#model-cards");
  container.replaceChildren();
  for (const model of MODELS) {
    const card = element("article", "model-card");
    const heading = element("h3");
    const dot = element("span", "model-dot");
    dot.style.backgroundColor = model.color;
    heading.append(dot, document.createTextNode(model.name));
    card.append(heading, element("p", "model-center", model.center));
    const values = rows.map((row) =>
      row.sources.find((source) => source.id === model.id),
    );
    const amounts = values
      .map((value) => value.amount)
      .filter((value) => value !== null);
    const probabilities = values
      .map((value) => value.probability)
      .filter((value) => value !== null);
    const wet = amounts.filter((amount) => amount >= 0.1).length;
    if (!amounts.length)
      card.append(
        element("p", "model-status model-missing", "비교 자료 없음"),
        element("p", "model-stats", "이 모델은 예보 비교에서 제외했어요."),
      );
    else {
      card.append(element("p", "model-status", `${wet}시간 강수 예측`));
      card.append(
        element(
          "p",
          "model-stats",
          `시간당 최대 ${Math.max(...amounts).toFixed(1)}mm · ${amounts.length}/${rows.length}시간 자료`,
        ),
      );
      card.append(
        element(
          "p",
          "model-stats",
          probabilities.length
            ? `강수확률 ${range([Math.min(...probabilities), Math.max(...probabilities)], "%", 0)}`
            : "강수확률 자료 없음",
        ),
      );
    }
    container.append(card);
  }
}

$("#locate").addEventListener("click", () => {
  if (locating) return;
  const status = $("#location-status");
  if (!window.isSecureContext) {
    status.textContent =
      "현재 위치는 HTTPS 연결에서 사용할 수 있어요. 도시 검색으로도 확인할 수 있습니다.";
    return;
  }
  if (!navigator.geolocation) {
    status.textContent =
      "이 브라우저는 위치 조회를 지원하지 않아요. 도시 검색을 이용해 주세요.";
    return;
  }
  const choice = ++locationChoice;
  locating = true;
  $("#locate").disabled = true;
  status.textContent = "위치 권한을 허용하면 현재 위치의 예보를 조회해요.";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      locating = false;
      $("#locate").disabled = false;
      if (choice !== locationChoice) return;
      const { latitude, longitude, accuracy } = position.coords;
      status.textContent = Number.isFinite(accuracy)
        ? `위치를 확인했어요. 기기가 보고한 위치 오차 범위는 약 ${Math.round(accuracy).toLocaleString("ko-KR")}m예요.`
        : "위치를 확인했어요.";
      loadForecast(
        {
          name: "현재 위치",
          latitude,
          longitude,
          detail: `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`,
        },
        false,
      );
    },
    (error) => {
      locating = false;
      $("#locate").disabled = false;
      if (choice !== locationChoice) return;
      status.textContent =
        error.code === 1
          ? "위치 사용이 허용되지 않았어요. 브라우저의 사이트 권한을 변경하거나 도시 검색을 이용해 주세요."
          : "현재 위치를 찾지 못했어요. 다시 시도하거나 도시 검색을 이용해 주세요.";
    },
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
  );
});

$("#location-search").addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = $("#city-query").value.trim();
  if (query.length < 2) {
    $("#location-status").textContent =
      "도시 이름을 두 글자 이상 입력해 주세요.";
    return;
  }
  searchController?.abort();
  searchController = new AbortController();
  const controller = searchController;
  const timeout = setTimeout(() => controller.abort(), 10000);
  $("#search-button").disabled = true;
  $("#search-results").replaceChildren();
  $("#location-status").textContent = "지역을 찾고 있어요.";
  try {
    const queryString = new URLSearchParams({
      name: query,
      count: "6",
      language: "ko",
      format: "json",
    });
    const data = await getJson(
      `https://geocoding-api.open-meteo.com/v1/search?${queryString}`,
      controller.signal,
    );
    if (controller !== searchController) return;
    const results = (Array.isArray(data.results) ? data.results : []).filter(
      (place) =>
        typeof place.name === "string" &&
        validCoordinates(place.latitude, place.longitude),
    );
    $("#location-status").textContent = results.length
      ? "확인할 지역을 선택해 주세요."
      : "검색 결과가 없어요. 다른 도시 이름으로 찾아보세요.";
    for (const result of results) {
      const place = {
        name: result.name,
        latitude: result.latitude,
        longitude: result.longitude,
        detail: [result.admin1, result.country]
          .filter((value) => typeof value === "string")
          .join(" · "),
      };
      const button = element("button", "city-result");
      button.type = "button";
      button.append(
        element("strong", "", place.name),
        element("span", "", place.detail),
      );
      button.addEventListener("click", () => {
        $("#search-results").replaceChildren();
        $("#location-status").textContent = "";
        loadForecast(place);
      });
      const item = element("li");
      item.append(button);
      $("#search-results").append(item);
    }
  } catch {
    if (controller === searchController)
      $("#location-status").textContent =
        "지역 검색에 실패했어요. 잠시 후 다시 시도하거나 빠른 지역 선택을 이용해 주세요.";
  } finally {
    clearTimeout(timeout);
    if (controller === searchController) $("#search-button").disabled = false;
  }
});

document.querySelectorAll("[data-city]").forEach((button) =>
  button.addEventListener("click", () => {
    $("#location-status").textContent = "";
    loadForecast(PRESETS[button.dataset.city]);
  }),
);
$("#refresh").addEventListener("click", () => {
  if (desiredPlace) loadForecast(desiredPlace);
});
for (const day of ["today", "tomorrow"])
  $(`#${day}-tab`).addEventListener("click", () => {
    selectedDay = day;
    render();
  });
function checkFreshness() {
  if (
    document.hidden ||
    locating ||
    !latest ||
    (forecastController && $("#refresh").disabled)
  )
    return;
  if (
    Date.now() - lastAttempt > 15 * 60 * 1000 &&
    samePlace(latest.place, desiredPlace)
  )
    loadForecast(desiredPlace, false);
  else if (samePlace(latest.place, desiredPlace)) render();
}
setInterval(checkFreshness, 60000);
document.addEventListener("visibilitychange", checkFreshness);
