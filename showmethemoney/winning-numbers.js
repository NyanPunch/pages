"use strict";

(() => {
  // Public mirror of published draw results; no API credentials or server required.
  const SOURCE =
    "https://raw.githubusercontent.com/nostra-team/nostra-data/main/snapshot.json";
  const CACHE_KEY = "showmethemoney:draw-results:v1";
  const games = ["lotto", "pension"];
  const saved = {};
  const $ = (id) => document.getElementById(id);
  const button = $("refresh-results");

  function kstNow() {
    return new Date(Date.now() + 9 * 60 * 60 * 1000);
  }
  function dateFromCompact(value) {
    if (typeof value !== "string" || !/^\d{8}$/.test(value))
      throw new Error("Invalid draw date");
    const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`;
    const date = new Date(`${iso}T00:00:00Z`);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== iso ||
      iso > kstNow().toISOString().slice(0, 10)
    )
      throw new Error("Invalid draw date");
    return date;
  }
  function validate(game, value) {
    if (!value || !Number.isSafeInteger(value.round) || value.round < 1)
      throw new Error("Invalid draw round");
    const date = dateFromCompact(value.date);
    const base =
      game === "lotto" ? Date.UTC(2002, 11, 7) : Date.UTC(2020, 4, 7);
    if ((date.getTime() - base) / (7 * 86400000) + 1 !== value.round)
      throw new Error("Round and date disagree");
    if (game === "lotto") {
      const numbers = value.numbers;
      if (
        !Array.isArray(numbers) ||
        numbers.length !== 6 ||
        new Set(numbers).size !== 6 ||
        numbers.some((n) => !Number.isInteger(n) || n < 1 || n > 45) ||
        !Number.isInteger(value.bonus) ||
        value.bonus < 1 ||
        value.bonus > 45 ||
        numbers.includes(value.bonus)
      )
        throw new Error("Invalid Lotto numbers");
      return {
        round: value.round,
        date: value.date,
        numbers: [...numbers].sort((a, b) => a - b),
        bonus: value.bonus,
      };
    }
    if (
      !Number.isInteger(value.group) ||
      value.group < 1 ||
      value.group > 5 ||
      typeof value.number !== "string" ||
      !/^\d{6}$/.test(value.number)
    )
      throw new Error("Invalid pension numbers");
    return {
      round: value.round,
      date: value.date,
      group: value.group,
      number: value.number,
    };
  }
  function latest(game, values) {
    if (!Array.isArray(values) || !values.length)
      throw new Error("No draw results");
    const result = values.reduce(
      (best, value) => (!best || value.round > best.round ? value : best),
      null,
    );
    return validate(game, result);
  }
  function isStale(game, value) {
    const now = kstNow();
    const last = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        game === "lotto" ? 22 : 21,
      ),
    );
    const weekday = game === "lotto" ? 6 : 4;
    last.setUTCDate(last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7));
    if (last > now) last.setUTCDate(last.getUTCDate() - 7);
    return (
      dateFromCompact(value.date).getTime() <
      Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate())
    );
  }
  function ball(number, pension = false) {
    const span = document.createElement("span");
    const color =
      number <= 10
        ? "yellow"
        : number <= 20
          ? "blue"
          : number <= 30
            ? "red"
            : number <= 40
              ? "gray"
              : "green";
    span.className = pension
      ? "winning-ball pension-digit"
      : `winning-ball ball-${color}`;
    span.textContent = String(number);
    return span;
  }
  function render(game, value, offline = false) {
    const target = $(
      game === "lotto" ? "lotto-winning-numbers" : "pension-winning-numbers",
    );
    target.replaceChildren();
    const date = value.date;
    $(`${game}-draw-meta`).textContent =
      `${value.round}회 · ${date.slice(0, 4)}.${date.slice(4, 6)}.${date.slice(6)}`;
    if (game === "lotto") {
      for (const number of value.numbers) target.append(ball(number));
      const bonus = document.createElement("span");
      bonus.className = "bonus-label";
      bonus.textContent = "+ 보너스";
      target.append(bonus, ball(value.bonus));
    } else {
      const group = document.createElement("span");
      group.className = "pension-group";
      group.textContent = `${value.group}조`;
      target.append(
        group,
        ...[...value.number].map((digit) => ball(digit, true)),
      );
    }
    const stale = isStale(game, value);
    const status = $(`${game}-draw-status`);
    status.classList.toggle("warning", offline || stale);
    status.textContent = offline
      ? "갱신에 실패해 이전에 확인한 번호를 표시합니다. 회차와 추첨일을 확인해 주세요."
      : stale
        ? "새 회차 데이터가 아직 반영되지 않았습니다. 표시된 회차를 확인하거나 동행복권에서 조회해 주세요."
        : "공개 데이터 기준 · 당첨 여부는 동행복권에서 최종 확인해 주세요.";
  }
  function error(game) {
    const status = $(`${game}-draw-status`);
    status.classList.add("warning");
    status.textContent =
      "당첨번호를 불러오지 못했습니다. 새로고침하거나 동행복권에서 확인해 주세요.";
  }
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY));
    for (const game of games) {
      try {
        saved[game] = validate(game, cache?.[game]);
        render(game, saved[game], true);
      } catch {
        /* Invalid or missing cached results are never displayed. */
      }
    }
  } catch {
    /* Drawing numbers does not depend on storage access. */
  }

  async function refresh() {
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = "확인 중…";
    try {
      const response = await fetch(SOURCE, {
        signal: AbortSignal.timeout(12000),
        cache: "no-cache",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      for (const game of games) {
        try {
          const result = latest(game, data[game]);
          // An old mirror response must not replace a newer valid cached result.
          if (saved[game] && saved[game].round > result.round)
            render(game, saved[game], true);
          else {
            saved[game] = result;
            render(game, result);
          }
        } catch {
          if (saved[game]) render(game, saved[game], true);
          else error(game);
        }
      }
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(saved));
      } catch {
        /* Storage is optional. */
      }
    } catch {
      for (const game of games) {
        if (saved[game]) render(game, saved[game], true);
        else error(game);
      }
    } finally {
      button.disabled = false;
      button.textContent = "새로고침";
    }
  }
  button.addEventListener("click", refresh);
  // Recheck after returning to a long-open tab. A 5-minute interval avoids excessive requests.
  let lastRefresh = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - lastRefresh > 300000) {
      lastRefresh = Date.now();
      refresh();
    }
  });
  refresh();
})();
