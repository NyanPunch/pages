"use strict";

(() => {
  const STORAGE_KEY = "moneydash:v1";
  const RECOVERY_KEY = "moneydash:before-restore";
  const DEFAULT_CATEGORIES = {
    expense: [
      "식비",
      "교통",
      "쇼핑",
      "주거·통신",
      "문화생활",
      "건강",
      "기타지출",
    ],
    income: ["월급", "용돈", "부수입", "기타수입"],
  };
  const COLORS = [
    "#f19a87",
    "#7c9eae",
    "#e7c68e",
    "#8eb8a4",
    "#aaa0c2",
    "#9bb4d5",
    "#cbb59d",
  ];
  const $ = (selector) => document.querySelector(selector);
  const money = (value) => value.toLocaleString("ko-KR");
  const localDate = (date = new Date()) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const uid = () => crypto.randomUUID();
  let state;
  let storageIssue = false;
  let editingId = null;
  let typeFilter = "all";
  let ownStoredValue = null;
  const freshState = () => ({
    version: 1,
    transactions: [],
    categories: structuredClone(DEFAULT_CATEGORIES),
  });

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
      return false;
    const date = new Date(`${value}T12:00:00Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value &&
      Number(value.slice(0, 4)) >= 1900 &&
      Number(value.slice(0, 4)) <= 9999
    );
  }

  function validateState(candidate) {
    if (
      !candidate ||
      candidate.version !== 1 ||
      !Array.isArray(candidate.transactions) ||
      candidate.transactions.length > 10000 ||
      !candidate.categories
    ) {
      throw new Error(
        "지원하지 않는 백업 형식입니다. MoneyDash JSON 백업을 선택해 주세요.",
      );
    }
    const categories = {};
    for (const kind of ["income", "expense"]) {
      const values = candidate.categories[kind];
      if (
        !Array.isArray(values) ||
        !values.length ||
        values.length > 100 ||
        values.some(
          (value) =>
            typeof value !== "string" || !value.trim() || value.length > 40,
        ) ||
        new Set(values).size !== values.length
      ) {
        throw new Error(
          "카테고리 데이터가 올바르지 않습니다. 유형별로 1~100개가 필요합니다.",
        );
      }
      categories[kind] = [...values];
    }
    const ids = new Set();
    let sum = 0;
    const transactions = candidate.transactions.map((tx) => {
      if (
        !tx ||
        typeof tx.id !== "string" ||
        !tx.id ||
        tx.id.length > 100 ||
        ids.has(tx.id) ||
        !["income", "expense"].includes(tx.type) ||
        !validDate(tx.date) ||
        !Number.isSafeInteger(tx.amount) ||
        tx.amount < 1 ||
        tx.amount > 1000000000000 ||
        typeof tx.category !== "string" ||
        !categories[tx.type].includes(tx.category) ||
        typeof tx.description !== "string" ||
        tx.description.length > 500
      ) {
        throw new Error(
          "거래 데이터의 날짜, 금액, 카테고리 또는 식별자가 올바르지 않습니다.",
        );
      }
      ids.add(tx.id);
      sum += tx.amount;
      if (!Number.isSafeInteger(sum))
        throw new Error("거래 금액의 합계가 처리 가능한 범위를 초과했습니다.");
      return {
        id: tx.id,
        type: tx.type,
        date: tx.date,
        amount: tx.amount,
        category: tx.category,
        description: tx.description,
      };
    });
    return { version: 1, transactions, categories };
  }

  function notify(message) {
    $("#notice").textContent = message;
    $("#notice").hidden = !message;
  }

  function migrateLegacy() {
    const rawTransactions = localStorage.getItem("transactions");
    const rawCategories = localStorage.getItem("customCategories");
    if (rawTransactions === null && rawCategories === null) return freshState();
    const transactions =
      rawTransactions === null ? [] : JSON.parse(rawTransactions);
    const categories =
      rawCategories === null
        ? structuredClone(DEFAULT_CATEGORIES)
        : JSON.parse(rawCategories);
    if (
      !Array.isArray(transactions) ||
      !categories ||
      !Array.isArray(categories.income) ||
      !Array.isArray(categories.expense)
    )
      throw new Error("기존 데이터 형식 오류");
    const migrated = {
      version: 1,
      categories: structuredClone(categories),
      transactions: transactions.map((tx) => {
        if (
          !tx ||
          !["income", "expense"].includes(tx.type) ||
          typeof tx.category !== "string"
        )
          throw new Error("기존 거래 형식 오류");
        return { ...tx, id: uid(), description: tx.description ?? "" };
      }),
    };
    // Earlier versions allowed removing categories still referenced by transactions.
    for (const tx of migrated.transactions) {
      if (!migrated.categories[tx.type].includes(tx.category))
        migrated.categories[tx.type].push(tx.category);
    }
    for (const kind of ["income", "expense"]) {
      if (!migrated.categories[kind].length)
        migrated.categories[kind] = [...DEFAULT_CATEGORIES[kind]];
    }
    return validateState(migrated);
  }

  function initialize() {
    storageIssue = false;
    try {
      ownStoredValue = localStorage.getItem(STORAGE_KEY);
      if (ownStoredValue !== null)
        state = validateState(JSON.parse(ownStoredValue));
      else {
        const hasLegacy =
          localStorage.getItem("transactions") !== null ||
          localStorage.getItem("customCategories") !== null;
        state = migrateLegacy();
        if (hasLegacy) {
          const serialized = JSON.stringify(state);
          localStorage.setItem(STORAGE_KEY, serialized);
          ownStoredValue = serialized;
          notify(
            "기존 가계부 기록을 가져왔습니다. 원본 데이터는 그대로 보관됩니다.",
          );
        }
      }
    } catch {
      state = freshState();
      storageIssue = true;
      notify(
        "저장 데이터를 읽거나 저장할 수 없습니다. 기록을 덮어쓰지 않도록 편집을 중단했습니다. 먼저 ‘백업’으로 원본을 보관한 뒤 올바른 백업 파일로 복원해 주세요.",
      );
    }
    $("#add-transaction").disabled = storageIssue;
    $("#empty-add").disabled = storageIssue;
    $("#categories-btn").disabled = storageIssue;
    $("#mobile-categories-btn").disabled = storageIssue;
  }

  function commit(candidate, restoring = false) {
    if (storageIssue && !restoring)
      throw new Error("먼저 저장 데이터를 복원해 주세요.");
    const next = validateState(candidate);
    const serialized = JSON.stringify(next);
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      if (current !== ownStoredValue)
        throw new Error(
          "다른 탭에서 기록이 변경됐습니다. 새로고침한 후 다시 시도해 주세요.",
        );
      if (restoring) {
        localStorage.setItem(
          RECOVERY_KEY,
          JSON.stringify({
            current,
            legacyTransactions: localStorage.getItem("transactions"),
            legacyCategories: localStorage.getItem("customCategories"),
          }),
        );
      }
      localStorage.setItem(STORAGE_KEY, serialized);
    } catch (error) {
      if (error.message.startsWith("다른 탭")) throw error;
      throw new Error(
        "브라우저에 저장하지 못했습니다. 저장 공간과 브라우저 설정을 확인해 주세요. 기존 기록은 유지됩니다.",
      );
    }
    ownStoredValue = serialized;
    state = next;
    storageIssue = false;
    $("#add-transaction").disabled = false;
    $("#empty-add").disabled = false;
    $("#categories-btn").disabled = false;
    $("#mobile-categories-btn").disabled = false;
  }

  function selectedMonth() {
    return $("#all-period").checked ? "all" : $("#month-filter").value;
  }
  function periodTransactions() {
    const month = selectedMonth();
    return state.transactions.filter(
      (tx) => month === "all" || tx.date.startsWith(month),
    );
  }
  function totals(transactions) {
    return transactions.reduce(
      (result, tx) => {
        result[tx.type] += tx.amount;
        return result;
      },
      { income: 0, expense: 0 },
    );
  }
  function writeAmount(selector, amount) {
    $(selector).replaceChildren(
      document.createTextNode(money(amount)),
      node("span", "", "원"),
    );
  }

  function render() {
    const month = selectedMonth();
    const transactions = periodTransactions();
    const summary = totals(transactions);
    $("#period-title").textContent =
      month === "all"
        ? "전체 기간"
        : `${Number(month.slice(0, 4))}년 ${Number(month.slice(5))}월`;
    $("#month-filter").disabled = month === "all";
    $("#previous-month").disabled = month === "all" || month === "1900-01";
    $("#next-month").disabled = month === "all" || month === "9999-12";
    writeAmount("#balance-total", summary.income - summary.expense);
    writeAmount("#income-total", summary.income);
    writeAmount("#expense-total", summary.expense);
    $("#income-count").textContent =
      `수입 내역 ${transactions.filter((tx) => tx.type === "income").length}건`;
    $("#expense-count").textContent =
      `지출 내역 ${transactions.filter((tx) => tx.type === "expense").length}건`;
    $("#balance-caption").textContent =
      summary.income > 0
        ? `수입의 ${Math.round((summary.expense / summary.income) * 100)}%를 지출했어요.`
        : "수입에서 지출을 뺀 금액이에요.";
    renderCategoryAnalysis(transactions, summary.expense);
    renderMonthlyFlow();
    renderLedger(transactions);
  }

  function renderCategoryAnalysis(transactions, total) {
    const container = $("#category-analysis");
    container.replaceChildren();
    if (!total) {
      const empty = node("div", "analysis-empty");
      empty.append(
        node("span", "", "◌"),
        node("p", "", "지출을 기록하면 소비 비중을 보여드려요."),
      );
      container.append(empty);
      return;
    }
    const grouped = new Map();
    for (const tx of transactions.filter((tx) => tx.type === "expense"))
      grouped.set(tx.category, (grouped.get(tx.category) || 0) + tx.amount);
    let groups = [...grouped].sort((a, b) => b[1] - a[1]);
    if (groups.length > 6)
      groups = [
        ...groups.slice(0, 5),
        [
          "나머지 카테고리",
          groups.slice(5).reduce((sum, item) => sum + item[1], 0),
        ],
      ];
    const donut = node("div", "donut");
    donut.setAttribute("aria-hidden", "true");
    let position = 0;
    donut.style.background = `conic-gradient(${groups
      .map(([, amount], index) => {
        const start = position;
        position += (amount / total) * 100;
        return `${COLORS[index]} ${start}% ${position}%`;
      })
      .join(",")})`;
    const hole = node("div", "donut-hole");
    hole.append(
      node("span", "", "총 지출"),
      node("strong", "", `${money(total)}원`),
    );
    donut.append(hole);
    const legend = node("ul", "category-legend");
    for (const [index, [name, amount]] of groups.entries()) {
      const item = node("li");
      const dot = node("span", "color-dot");
      dot.style.backgroundColor = COLORS[index];
      const title = node("span", "category-name", name);
      title.title = name;
      item.append(
        dot,
        title,
        node("span", "legend-amount", `${money(amount)}원`),
        node(
          "span",
          "legend-percent",
          `${Math.round((amount / total) * 100)}%`,
        ),
      );
      legend.append(item);
    }
    container.append(donut, legend);
  }

  function shiftedMonth(month, offset) {
    const [year, number] = month.split("-").map(Number);
    const absolute = year * 12 + number - 1 + offset;
    return `${String(Math.floor(absolute / 12)).padStart(4, "0")}-${String((absolute % 12) + 1).padStart(2, "0")}`;
  }
  function renderMonthlyFlow() {
    const end =
      selectedMonth() === "all" ? localDate().slice(0, 7) : selectedMonth();
    const months = Array.from({ length: 6 }, (_, index) =>
      shiftedMonth(end, index - 5),
    );
    const values = months.map((month) =>
      totals(state.transactions.filter((tx) => tx.date.startsWith(month))),
    );
    const max = Math.max(
      1,
      ...values.flatMap((value) => [value.income, value.expense]),
    );
    const chart = $("#monthly-chart");
    chart.replaceChildren();
    values.forEach((value, index) => {
      const column = node("div", "month-bars");
      const pair = node("div", "bar-pair");
      column.setAttribute("role", "img");
      column.setAttribute(
        "aria-label",
        `${months[index]} 수입 ${money(value.income)}원, 지출 ${money(value.expense)}원`,
      );
      column.title = column.getAttribute("aria-label");
      for (const kind of ["income", "expense"]) {
        const bar = node("div", `bar ${kind}-bar`);
        bar.style.height = value[kind]
          ? `${Math.max(2, (value[kind] / max) * 100)}%`
          : "0%";
        pair.append(bar);
      }
      column.append(
        pair,
        node("span", "bar-label", `${Number(months[index].slice(5))}월`),
      );
      chart.append(column);
    });
    $("#flow-caption").textContent =
      `${months[0].replace("-", ".")} – ${end.replace("-", ".")} · 가장 큰 금액 ${money(max === 1 && values.every((v) => !v.income && !v.expense) ? 0 : max)}원 기준`;
  }

  function renderLedger(period) {
    const query = $("#search").value.trim().toLocaleLowerCase("ko-KR");
    const transactions = period
      .filter(
        (tx) =>
          (typeFilter === "all" || tx.type === typeFilter) &&
          `${tx.description} ${tx.category}`
            .toLocaleLowerCase("ko-KR")
            .includes(query),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
    $("#transaction-count").textContent = transactions.length;
    const list = $("#transactions-list");
    list.replaceChildren();
    for (const tx of transactions) {
      const row = node("tr");
      const description = node("div", "transaction-name");
      description.append(
        node(
          "span",
          `transaction-symbol ${tx.type}`,
          tx.type === "income" ? "↓" : "↑",
        ),
        node(
          "span",
          "",
          tx.description || (tx.type === "income" ? "수입 기록" : "지출 기록"),
        ),
      );
      const details = node("td");
      details.append(description);
      const category = node("td");
      category.append(node("span", "category-tag", tx.category));
      const amount = node(
        "td",
        `amount-column transaction-amount ${tx.type}`,
        `${tx.type === "income" ? "+" : "−"}${money(tx.amount)}원`,
      );
      const actions = node("td");
      const controls = node("div", "row-actions");
      for (const [action, label] of [
        ["edit", "수정"],
        ["delete", "삭제"],
      ]) {
        const button = node("button", `row-action ${action}`, label);
        button.dataset.action = action;
        button.dataset.id = tx.id;
        button.setAttribute(
          "aria-label",
          `${tx.date} ${tx.description || tx.category} ${money(tx.amount)}원 ${label}`,
        );
        controls.append(button);
      }
      actions.append(controls);
      row.append(
        node("td", "", tx.date.replaceAll("-", ".")),
        details,
        category,
        amount,
        actions,
      );
      list.append(row);
    }
    $("#empty-state").hidden = transactions.length > 0;
    $("#empty-state h3").textContent = period.length
      ? "조건에 맞는 내역이 없어요"
      : "아직 기록이 없어요";
    $("#empty-state p").textContent = period.length
      ? "검색어나 거래 유형을 바꿔 보세요."
      : "첫 번째 수입이나 지출을 기록해 보세요.";
    $("#empty-add").hidden = period.length > 0;
  }

  function updateFormCategories(value) {
    const kind = $("#transaction-form").elements.type.value;
    const select = $("#transaction-category");
    select.replaceChildren();
    for (const category of state.categories[kind])
      select.add(new Option(category, category));
    if (value && state.categories[kind].includes(value)) select.value = value;
  }
  function openTransaction(transaction) {
    if (storageIssue) return;
    editingId = transaction?.id ?? null;
    $("#transaction-form").reset();
    $("#transaction-title").textContent = editingId ? "내역 수정" : "내역 기록";
    $("#save-transaction").textContent = editingId ? "수정 저장" : "기록 저장";
    $("#transaction-form").elements.type.value = transaction?.type ?? "expense";
    const current = localDate();
    const month = selectedMonth();
    $("#transaction-date").value =
      transaction?.date ??
      (month === "all" || month === current.slice(0, 7)
        ? current
        : `${month}-01`);
    $("#transaction-amount").value = transaction?.amount ?? "";
    $("#transaction-description").value = transaction?.description ?? "";
    $("#form-error").textContent = "";
    updateFormCategories(transaction?.category);
    $("#transaction-dialog").showModal();
    $("#transaction-amount").focus();
  }

  function renderCategories() {
    const container = $("#category-lists");
    container.replaceChildren();
    for (const [kind, title] of [
      ["expense", "지출"],
      ["income", "수입"],
    ]) {
      const section = node("section", "category-section");
      section.append(node("h3", "", title));
      const list = node("ul");
      for (const name of state.categories[kind]) {
        const item = node("li");
        item.append(node("span", "", name));
        const inUse = state.transactions.some(
          (tx) => tx.type === kind && tx.category === name,
        );
        if (inUse) item.append(node("small", "", "사용 중"));
        else if (state.categories[kind].length === 1)
          item.append(node("small", "", "최소 1개 유지"));
        else {
          const button = node("button", "", "삭제");
          button.dataset.kind = kind;
          button.dataset.category = name;
          button.setAttribute("aria-label", `${title} ${name} 카테고리 삭제`);
          item.append(button);
        }
        list.append(item);
      }
      section.append(list);
      container.append(section);
    }
  }

  function download(data, filename) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const link = node("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  $("#month-filter").value = localDate().slice(0, 7);
  $("#month-filter").min = "1900-01";
  $("#month-filter").max = "9999-12";
  initialize();
  render();

  $("#month-filter").addEventListener("change", () => {
    if (
      !/^\d{4}-\d{2}$/.test($("#month-filter").value) ||
      !$("#month-filter").validity.valid
    )
      $("#month-filter").value = localDate().slice(0, 7);
    render();
  });
  $("#all-period").addEventListener("change", render);
  for (const [selector, offset] of [
    ["#previous-month", -1],
    ["#next-month", 1],
  ])
    $(selector).addEventListener("click", () => {
      $("#month-filter").value = shiftedMonth($("#month-filter").value, offset);
      render();
    });
  $("#current-month").addEventListener("click", () => {
    $("#all-period").checked = false;
    $("#month-filter").value = localDate().slice(0, 7);
    render();
  });
  $("#add-transaction").addEventListener("click", () => openTransaction());
  $("#empty-add").addEventListener("click", () => openTransaction());
  $("#search").addEventListener("input", () =>
    renderLedger(periodTransactions()),
  );
  document.querySelectorAll("[data-filter]").forEach((button) =>
    button.addEventListener("click", () => {
      typeFilter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((item) => {
        item.classList.toggle("active", item === button);
        item.setAttribute("aria-pressed", String(item === button));
      });
      renderLedger(periodTransactions());
    }),
  );
  document
    .querySelectorAll("[data-close]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        document.getElementById(button.dataset.close).close(),
      ),
    );
  document
    .querySelectorAll("input[name=type]")
    .forEach((input) =>
      input.addEventListener("change", () => updateFormCategories()),
    );
  $("#transaction-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const tx = {
      id: editingId ?? uid(),
      type: form.elements.type.value,
      amount: Number(form.elements.amount.value),
      date: form.elements.date.value,
      category: form.elements.category.value,
      description: form.elements.description.value.trim(),
    };
    try {
      const next = structuredClone(state);
      if (editingId) {
        const index = next.transactions.findIndex(
          (item) => item.id === editingId,
        );
        if (index === -1)
          throw new Error("수정할 기록이 없습니다. 다시 선택해 주세요.");
        next.transactions[index] = tx;
      } else next.transactions.push(tx);
      commit(next);
      $("#transaction-dialog").close();
      render();
      notify(
        `${editingId ? "내역을 수정" : "내역을 저장"}했습니다.${selectedMonth() !== "all" && !tx.date.startsWith(selectedMonth()) ? " 기록한 날짜의 월을 선택하면 확인할 수 있어요." : ""}`,
      );
    } catch (error) {
      $("#form-error").textContent = error.message;
    }
  });
  $("#transactions-list").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const tx = state.transactions.find((item) => item.id === button.dataset.id);
    if (!tx) return;
    if (button.dataset.action === "edit") return openTransaction(tx);
    if (!confirm(`${tx.date} ${money(tx.amount)}원 내역을 삭제할까요?`)) return;
    try {
      commit({
        ...state,
        transactions: state.transactions.filter((item) => item.id !== tx.id),
      });
      render();
      notify("내역을 삭제했습니다.");
    } catch (error) {
      notify(error.message);
    }
  });
  function openCategories() {
    $("#category-error").textContent = "";
    renderCategories();
    $("#category-dialog").showModal();
  }
  $("#categories-btn").addEventListener("click", openCategories);
  $("#mobile-categories-btn").addEventListener("click", openCategories);
  $("#category-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("#category-name").value.trim();
    const kind = $("#category-type").value;
    try {
      if (!name) throw new Error("카테고리 이름을 입력해 주세요.");
      if (state.categories[kind].includes(name))
        throw new Error("같은 이름의 카테고리가 있습니다.");
      const next = structuredClone(state);
      next.categories[kind].push(name);
      commit(next);
      $("#category-name").value = "";
      $("#category-error").textContent = "";
      renderCategories();
    } catch (error) {
      $("#category-error").textContent = error.message;
    }
  });
  $("#category-lists").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-category]");
    if (!button) return;
    const { kind, category } = button.dataset;
    try {
      if (
        state.transactions.some(
          (tx) => tx.type === kind && tx.category === category,
        )
      )
        throw new Error("기록에 사용 중인 카테고리입니다.");
      const next = structuredClone(state);
      next.categories[kind] = next.categories[kind].filter(
        (name) => name !== category,
      );
      commit(next);
      renderCategories();
    } catch (error) {
      $("#category-error").textContent = error.message;
    }
  });
  $("#export-data").addEventListener("click", () => {
    try {
      if (storageIssue) {
        download(
          {
            format: "moneydash-recovery",
            stored: localStorage.getItem(STORAGE_KEY),
            legacyTransactions: localStorage.getItem("transactions"),
            legacyCategories: localStorage.getItem("customCategories"),
          },
          `moneydash-recovery-${localDate()}.json`,
        );
        notify(
          "손상된 데이터를 원본 그대로 백업했습니다. 이 파일은 보관용이며 정상 백업 복원에는 사용할 수 없습니다.",
        );
      } else
        download(
          {
            format: "moneydash-backup",
            exportedAt: new Date().toISOString(),
            ...state,
          },
          `moneydash-${localDate()}.json`,
        );
    } catch {
      notify(
        "백업 파일을 만들지 못했습니다. 브라우저의 저장소 접근 설정을 확인해 주세요.",
      );
    }
  });
  $("#import-data").addEventListener("click", () => $("#backup-file").click());
  $("#backup-file").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 10000000)
        throw new Error("백업 파일은 10MB 이하여야 합니다.");
      const content = JSON.parse(await file.text());
      if (content.format !== "moneydash-backup")
        throw new Error(
          "MoneyDash에서 내보낸 정상 JSON 백업 파일을 선택해 주세요.",
        );
      const candidate = validateState(content);
      if (
        !confirm(
          `${candidate.transactions.length}건의 기록으로 현재 가계부 전체를 교체할까요? 현재 기록을 먼저 백업해 두는 것을 권장합니다.`,
        )
      )
        return;
      commit(candidate, true);
      render();
      notify(
        `${candidate.transactions.length}건의 기록을 복원했습니다. 선택한 기간에 맞춰 표시됩니다.`,
      );
    } catch (error) {
      notify(`복원하지 못했습니다. ${error.message}`);
    }
  });
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      if ($("#transaction-dialog").open) $("#transaction-dialog").close();
      if ($("#category-dialog").open) $("#category-dialog").close();
      initialize();
      render();
      if (!storageIssue) notify("다른 탭에서 변경한 기록을 반영했습니다.");
    }
  });
})();
