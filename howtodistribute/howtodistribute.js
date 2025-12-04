const rowsEl = document.getElementById('rows');
const addRowBtn = document.getElementById('addRowBtn');
const calcBtn = document.getElementById('calcBtn');
const resetBtn = document.getElementById('resetBtn');
const totalEl = document.getElementById('total');
const sumPctEl = document.getElementById('sumPct');
const scaleInfoEl = document.getElementById('scaleInfo');
const rowCountEl = document.getElementById('rowCount');

const LS_KEY = 'pension-dca-rows-v1';
const LS_TOTAL_KEY = 'pension-dca-total-v1';

function getSavedRowsSafe() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.warn('저장된 행 데이터를 복원하지 못했습니다. 기본 행을 사용합니다.', e);
        return [];
    }
}

function createRow(data = {}) {
    const row = document.createElement('div');
    row.className = 'row item';

    row.innerHTML = `
        <input class="name" type="text" placeholder="예: S&P500, 타겟데이트, 메모 등" value="${data.name || ''}" />
        <input class="pct right" type="number" min="0" step="0.1" placeholder="예: 25" value="${data.pct ?? ''}" />
        <input class="price right" type="number" min="0" step="1" placeholder="예: 45000" value="${data.price ?? ''}" />
        <div class="alloc right">-</div>
        <div class="shares right">-</div>
        <button class="secondary remove">삭제</button>
      `;

    // 이벤트: 입력 변화 시 합계 갱신 및 저장
    row.querySelector('.pct').addEventListener('input', onAnyInputChange);
    row.querySelector('.price').addEventListener('input', onAnyInputChange);
    row.querySelector('.name').addEventListener('input', debounce(persistState, 300));
    row.querySelector('.remove').addEventListener('click', () => {
        row.remove();
        updateSummary();
        persistState();
    });

    rowsEl.appendChild(row);
    updateSummary();
    return row;
}

function getRowsData() {
    return Array.from(rowsEl.querySelectorAll('.row.item')).map(r => ({
        name: r.querySelector('.name').value.trim(),
        pct: parseFloat(r.querySelector('.pct').value),
        price: parseFloat(r.querySelector('.price').value),
        allocEl: r.querySelector('.alloc'),
        sharesEl: r.querySelector('.shares'),
    }));
}

function formatCurrency(v) {
    if (!isFinite(v)) return '-';
    return Math.round(v).toLocaleString('ko-KR');
}

function updateSummary() {
    const rows = getRowsData();
    const sumPct = rows.reduce((acc, r) => acc + (isFinite(r.pct) ? r.pct : 0), 0);
    sumPctEl.textContent = `${(Math.round(sumPct * 10) / 10).toFixed(1)}%`;
    rowCountEl.textContent = String(rows.length);
    scaleInfoEl.textContent = sumPct > 0 ? `총합 ${sumPct.toFixed(1)}% 기준 비례 배분` : '-';
}

function calculate() {
    const total = parseFloat(totalEl.value);
    if (!isFinite(total) || total <= 0) {
        alert('월 적립 총액(원)을 올바르게 입력하세요.');
        return;
    }
    const rows = getRowsData();
    const sumPctRaw = rows.reduce((acc, r) => acc + (isFinite(r.pct) ? r.pct : 0), 0);

    if (sumPctRaw <= 0) {
        alert('퍼센트를 한 개 이상 입력하세요.');
        return;
    }

    const scale = 100 / sumPctRaw; // 합이 100이 아니어도 비례 스케일
    const warnings = [];

    rows.forEach(r => {
        const pct = isFinite(r.pct) ? r.pct : 0;
        const alloc = total * (pct / sumPctRaw); // 비례 배분
        r.allocEl.textContent = formatCurrency(alloc);

        if (isFinite(r.price) && r.price > 0) {
            const shares = Math.floor(alloc / r.price);
            r.sharesEl.textContent = isFinite(shares) ? shares.toString() : '-';
            if (shares === 0 && alloc > 0) {
                warnings.push(`${r.name || '항목'}: 배분 금액으로 1주 매수가 불가`);
            }
        } else {
            r.sharesEl.textContent = '-';
        }
    });

    updateSummary();

    // 퍼센트 합 안내
    if (Math.abs(sumPctRaw - 100) > 0.001) {
        const msg = `퍼센트 합계가 ${sumPctRaw.toFixed(1)}% 입니다.\n총액 대비 비례(스케일 ${scale.toFixed(3)}x)로 배분했습니다.`;
        console.info(msg);
    }

    if (warnings.length) {
        console.warn(warnings.join('\n'));
    }

    persistState();
}

function persistState() {
    const rows = getRowsData().map(r => ({
        name: r.name,
        pct: isFinite(r.pct) ? r.pct : '',
        price: isFinite(r.price) ? r.price : '',
    }));
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(rows));
        const total = parseFloat(totalEl.value);
        if (isFinite(total)) localStorage.setItem(LS_TOTAL_KEY, String(total));
    } catch (e) {
        console.warn('로컬 저장소에 상태를 저장하지 못했습니다.', e);
    }
}

function restoreState() {
    const savedRows = getSavedRowsSafe();
    const savedTotal = localStorage.getItem(LS_TOTAL_KEY);
    if (savedTotal) totalEl.value = savedTotal;
    if (savedRows.length === 0) {
        // 기본 출력 행 (2025-12-04 기준 기본값)
        createRow({ name: 'S&P500', pct: 60, price: '' });
        createRow({ name: '나스닥100', pct: 20, price: '' });
        createRow({ name: '다우존스', pct: 10, price: '' });
        createRow({ name: '금현물', pct: 5, price: ''});
        createRow({ name: '채권',pct: 5, price: ''})
    } else {
        savedRows.forEach(r => createRow(r));
    }
    updateSummary();
}

function onAnyInputChange() {
    updateSummary();
    // 계산값은 버튼으로 확정
    persistState();
}

function debounce(fn, wait = 200) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(null, args), wait);
    };
}

// 이벤트 바인딩
addRowBtn.addEventListener('click', () => {
    createRow();
    persistState();
});
calcBtn.addEventListener('click', calculate);
resetBtn.addEventListener('click', () => {
    if (!confirm('모든 입력을 초기화할까요?')) return;
    rowsEl.innerHTML = '';
    totalEl.value = '';
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_TOTAL_KEY);
    restoreState();
});

// 초기 복원
restoreState();