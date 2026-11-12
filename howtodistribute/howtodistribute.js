import {
  DEFAULT_ROWS,
  amount,
  weight,
  validateSettings,
  calculate,
} from "./allocation.mjs";

const KEY = "pension-dca-settings-v2";
const LEGACY_ROWS = "pension-dca-rows-v1";
const LEGACY_TOTAL = "pension-dca-total-v1";
const COLORS = ["#85ae7d", "#80a8d6", "#d5bd7f", "#aa97cc", "#9da7b2"];
const $ = (selector) => document.querySelector(selector);
const currency = (value) =>
  value === null ? "—" : `${value.toLocaleString("ko-KR")}원`;
const fresh = () => ({
  version: 2,
  total: "",
  rows: structuredClone(DEFAULT_ROWS),
});
let settings = fresh();
let savedValue = null;
let saveBlocked = false;
let idSequence = 0;
let controls = [];
const node = (tag, className, text) => {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
};
function notice(message) {
  $("#storage-notice").textContent = message;
}
function saveLabel(saved) {
  $("#save-status").textContent = saved ? "자동 저장" : "자동 저장 안 됨";
}

function persist() {
  if (saveBlocked) return;
  let normalized;
  try {
    normalized = validateSettings(settings);
  } catch {
    return;
  }
  try {
    if (localStorage.getItem(KEY) !== savedValue) {
      saveBlocked = true;
      saveLabel(false);
      notice("다른 탭에서 설정이 변경됐습니다. 새로고침해 주세요.");
      return;
    }
    const value = JSON.stringify(normalized);
    localStorage.setItem(KEY, value);
    savedValue = value;
    saveLabel(true);
    notice("");
  } catch {
    saveLabel(false);
    notice("저장하지 못했습니다. 내보내기로 설정을 보관해 주세요.");
  }
}
function initialize() {
  try {
    savedValue = localStorage.getItem(KEY);
    if (savedValue !== null)
      settings = validateSettings(JSON.parse(savedValue));
    else {
      const rawRows = localStorage.getItem(LEGACY_ROWS);
      const rawTotal = localStorage.getItem(LEGACY_TOTAL);
      settings =
        rawRows === null && rawTotal === null
          ? fresh()
          : validateSettings({
              version: 2,
              total: rawTotal ?? "",
              rows:
                rawRows === null
                  ? structuredClone(DEFAULT_ROWS)
                  : JSON.parse(rawRows),
            });
      if (rawRows !== null || rawTotal !== null) persist();
    }
  } catch {
    settings = fresh();
    saveBlocked = true;
    saveLabel(false);
    notice(
      "저장된 설정을 읽지 못했습니다. 원본은 유지됩니다. 불러오기 또는 초기화해 주세요.",
    );
  }
  build();
  render();
}

function displayAmount(value) {
  try {
    const parsed = amount(value, true);
    return parsed === null ? "" : parsed.toLocaleString("ko-KR");
  } catch {
    return String(value);
  }
}

function build() {
  $("#total").value = displayAmount(settings.total);
  $("#rows").replaceChildren();
  controls = [];
  for (const row of settings.rows) {
    const id = `asset-${++idSequence}`;
    const card = node("article", "asset-card");
    const heading = node("div", "asset-heading");
    const dot = node("span", "asset-dot");
    dot.style.backgroundColor = COLORS[controls.length % COLORS.length];
    const name = node("input", "asset-name");
    name.type = "text";
    name.maxLength = 100;
    name.value = row.name;
    name.placeholder = "종목명";
    name.setAttribute("aria-label", "종목명");
    name.addEventListener("input", () => {
      row.name = name.value;
      render();
      persist();
    });
    const remove = node("button", "remove-row", "×");
    remove.type = "button";
    remove.setAttribute("aria-label", `${row.name || "종목"} 삭제`);
    remove.addEventListener("click", () => {
      settings.rows.splice(settings.rows.indexOf(row), 1);
      build();
      render();
      persist();
    });
    heading.append(dot, name, remove);
    const fields = node("div", "asset-inputs");
    const inputs = {};
    const error = node("p", "field-error");
    error.id = `${id}-error`;
    error.setAttribute("role", "status");
    for (const [key, title, mode] of [
      ["pct", "비중 (%)", "decimal"],
      ["price", "1주 가격 (원)", "numeric"],
    ]) {
      const field = node("div");
      const label = node("label", "", title);
      label.htmlFor = `${id}-${key}`;
      const input = node("input", key);
      input.id = label.htmlFor;
      input.type = "text";
      input.inputMode = mode;
      input.value = key === "price" ? displayAmount(row[key]) : row[key];
      input.autocomplete = "off";
      input.placeholder = "0";
      input.setAttribute("aria-describedby", error.id);
      input.addEventListener("input", () => {
        row[key] = input.value;
        render();
        persist();
      });
      if (key === "price")
        input.addEventListener("blur", () => {
          try {
            const value = amount(input.value, true);
            if (value !== null)
              input.value = row.price = value.toLocaleString("ko-KR");
            render();
            persist();
          } catch {
            /* Preserve invalid input for correction. */
          }
        });
      inputs[key] = input;
      field.append(label, input);
      fields.append(field);
    }
    const results = node("dl", "asset-results");
    const allocation = node("dd", "allocation", "—");
    const shares = node("dd", "shares", "—");
    for (const [title, result] of [
      ["배분액", allocation],
      ["매수", shares],
    ]) {
      const group = node("div");
      group.append(node("dt", "", title), result);
      results.append(group);
    }
    card.append(heading, fields, results, error);
    $("#rows").append(card);
    controls.push({ row, inputs, error, allocation, shares, remove });
  }
  if (!settings.rows.length)
    $("#rows").append(node("p", "empty-rows", "종목을 추가하세요."));
  $("#add-row").disabled = settings.rows.length >= 100;
}

function render() {
  let invalid = false;
  $("#total-error").textContent = "";
  $("#total").setAttribute("aria-invalid", "false");
  try {
    amount(settings.total, true);
  } catch (error) {
    invalid = true;
    $("#total-error").textContent = error.message;
    $("#total").setAttribute("aria-invalid", "true");
  }
  for (const control of controls) {
    control.error.textContent = "";
    control.remove.setAttribute(
      "aria-label",
      `${control.row.name || "종목"} 삭제`,
    );
    for (const key of ["pct", "price"]) {
      control.inputs[key].setAttribute("aria-invalid", "false");
      try {
        if (key === "pct") weight(control.row.pct);
        else amount(control.row.price, true);
      } catch (error) {
        invalid = true;
        control.inputs[key].setAttribute("aria-invalid", "true");
        control.error.textContent = error.message;
      }
    }
    control.allocation.textContent = "—";
    control.shares.textContent = "—";
  }
  $("#spent").textContent = "—";
  $("#remaining").textContent = "—";
  $("#allocation-bar").replaceChildren();
  $("#weight-sum").classList.remove("exact");
  $("#calculation-note").textContent = "";
  if (invalid) {
    $("#weight-sum").textContent = "—";
    return;
  }
  const result = calculate(settings.total, settings.rows);
  $("#weight-sum").textContent =
    `${result.sum.toLocaleString("ko-KR", { maximumFractionDigits: 4 })}%`;
  $("#weight-sum").classList.toggle("exact", result.sum === 100);
  $("#spent").textContent = currency(result.spent);
  $("#remaining").textContent = currency(result.remaining);
  const chartDescription = [];
  if (result.sum > 0)
    for (const [index, row] of settings.rows.entries()) {
      const percent = (Number(weight(row.pct)) / (result.sum * 10000)) * 100;
      if (!percent) continue;
      const segment = node("span");
      segment.style.width = `${percent}%`;
      segment.style.backgroundColor = COLORS[index % COLORS.length];
      segment.title = `${row.name || "종목"} ${percent.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`;
      chartDescription.push(segment.title);
      $("#allocation-bar").append(segment);
    }
  $("#allocation-bar").setAttribute(
    "aria-label",
    chartDescription.length ? chartDescription.join(", ") : "입력된 비중 없음",
  );
  for (const [index, control] of controls.entries()) {
    control.allocation.textContent = result.allocations
      ? currency(result.allocations[index])
      : "—";
    const purchase = result.purchases?.[index];
    control.shares.textContent = purchase
      ? `${purchase.shares.toLocaleString("ko-KR")}주`
      : "—";
  }
  const notes = [];
  if (result.sum > 0 && result.sum !== 100)
    notes.push(
      `비중 합계 ${result.sum.toLocaleString("ko-KR")}% 기준으로 비례 배분합니다.`,
    );
  if (result.total !== null && result.sum === 0 && settings.rows.length)
    notes.push("비중을 입력하세요.");
  if (result.purchases?.some((value) => value === null))
    notes.push("매수금액·잔액은 1주 가격 입력 후 표시됩니다.");
  $("#calculation-note").textContent = notes.join(" ");
}

function replaceSettings(next) {
  try {
    const current = localStorage.getItem(KEY);
    localStorage.setItem(
      "pension-dca-settings-before-replace",
      JSON.stringify({
        current,
        legacyRows: localStorage.getItem(LEGACY_ROWS),
        legacyTotal: localStorage.getItem(LEGACY_TOTAL),
      }),
    );
    const serialized = JSON.stringify(next);
    localStorage.setItem(KEY, serialized);
    savedValue = serialized;
    saveBlocked = false;
    saveLabel(true);
    notice("");
  } catch {
    saveBlocked = true;
    saveLabel(false);
    notice("저장하지 못했습니다. 내보내기로 설정을 보관해 주세요.");
  }
  settings = next;
  build();
  render();
}
$("#total").addEventListener("input", () => {
  settings.total = $("#total").value;
  render();
  persist();
});
$("#total").addEventListener("blur", () => {
  try {
    const value = amount(settings.total, true);
    if (value !== null)
      $("#total").value = settings.total = value.toLocaleString("ko-KR");
    render();
    persist();
  } catch {
    /* Inline validation remains visible. */
  }
});
$("#add-row").addEventListener("click", () => {
  if (settings.rows.length >= 100) return;
  settings.rows.push({ name: "", pct: "", price: "" });
  build();
  render();
  persist();
  $("#rows .asset-card:last-child .asset-name").focus();
});
$("#reset").addEventListener("click", () => {
  if (confirm("입력을 초기화할까요?")) replaceSettings(fresh());
});
$("#export-settings").addEventListener("click", () => {
  try {
    const data = {
      format: "pension-allocation-settings",
      ...validateSettings(settings),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const link = node("a");
    link.href = url;
    link.download = "allocation-settings.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    notice(error.message);
  }
});
$("#import-settings").addEventListener("click", () =>
  $("#settings-file").click(),
);
$("#settings-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  try {
    if (file.size > 1_000_000)
      throw new Error("설정 파일은 1MB 이하여야 합니다.");
    const data = JSON.parse(await file.text());
    if (data.format !== "pension-allocation-settings")
      throw new Error("계산기에서 내보낸 설정 파일을 선택하세요.");
    const next = validateSettings(data);
    if (confirm("현재 입력을 불러온 설정으로 바꿀까요?")) replaceSettings(next);
  } catch (error) {
    notice(error.message);
  }
});
initialize();
