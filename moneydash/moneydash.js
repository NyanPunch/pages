const expenseForm = document.getElementById('expense-form');
const incomeForm = document.getElementById('income-form');
const list = document.getElementById('transactions-list');
const expenseCategorySelect = document.getElementById('expense-category');
const incomeCategorySelect = document.getElementById('income-category');
const monthFilter = document.getElementById('month-filter');

// Chart 인스턴스를 전역 변수로 관리
let expenseChartInstance;
let incomeChartInstance;

// ------------------------------------
// 1. 초기화 및 로드
// ------------------------------------

const DEFAULT_CATEGORIES = {
    expense: ['식비', '교통', '문화생활', '기타지출'],
    income: ['월급', '용돈', '기타수입']
};

let transactions = JSON.parse(localStorage.getItem('transactions')) || [];
let customCategories = JSON.parse(localStorage.getItem('customCategories')) || DEFAULT_CATEGORIES;

// ** (이전의 document.getElementById('date').valueAsDate = new Date(); 코드는 제거됨) **

// ------------------------------------
// 2. 카테고리 옵션 업데이트
// ------------------------------------

function updateCategoryOptions() {
    // 지출 카테고리 업데이트
    expenseCategorySelect.innerHTML = '';
    const expCats = customCategories.expense || [];
    expCats.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        expenseCategorySelect.appendChild(option);
    });
    if (expCats.length === 0) {
        expenseCategorySelect.innerHTML = '<option value="">카테고리 추가 필요</option>';
    }

    // 수입 카테고리 업데이트
    incomeCategorySelect.innerHTML = '';
    const incCats = customCategories.income || [];
    incCats.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        incomeCategorySelect.appendChild(option);
    });
    if (incCats.length === 0) {
        incomeCategorySelect.innerHTML = '<option value="">카테고리 추가 필요</option>';
    }
}

// ------------------------------------
// 3. 거래 내역을 화면에 렌더링
// ------------------------------------

function renderTransactions() {
    list.innerHTML = '';

    const selectedMonth = monthFilter.value;

    const filteredTransactions = transactions.filter(tx => {
        if (selectedMonth === 'all') return true;
        return tx.date.startsWith(selectedMonth);
    });

    filteredTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    filteredTransactions.forEach((tx) => {
        const listItem = document.createElement('li');
        listItem.classList.add(tx.type);

        const amountText = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(tx.amount);

        const originalIndex = transactions.findIndex(t => t === tx);

        listItem.innerHTML = `
                <div>${tx.date}</div>
                <div>${tx.type === 'income' ? '수입' : '지출'}</div>
                <div>${tx.category} / ${tx.description}</div>
                <div>${amountText}</div>
                <div><button class="delete-btn" data-index="${originalIndex}">삭제</button></div>
            `;

        list.appendChild(listItem);
    });
    saveData();
    updateSummary();
}

// ------------------------------------
// 4. 데이터 저장 (Local Storage)
// ------------------------------------

function saveData() {
    localStorage.setItem('transactions', JSON.stringify(transactions));
    localStorage.setItem('customCategories', JSON.stringify(customCategories));
}

// ------------------------------------
// 5. 새 내역 추가, 6. 내역 삭제
// ------------------------------------

// 지출 폼 제출 처리
expenseForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const newTransaction = {
        date: document.getElementById('expense-date').value,
        type: 'expense', // 유형을 고정
        amount: parseInt(document.getElementById('expense-amount').value, 10),
        category: expenseCategorySelect.value,
        description: document.getElementById('expense-description').value || '-'
    };

    if (!newTransaction.category) {
        alert('지출 카테고리를 먼저 설정해주세요!');
        return;
    }

    transactions.push(newTransaction);
    renderTransactions();
    expenseForm.reset();
    document.getElementById('expense-date').valueAsDate = new Date();
    populateMonthFilter();
});

// 수입 폼 제출 처리
incomeForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const newTransaction = {
        date: document.getElementById('income-date').value,
        type: 'income', // 유형을 고정
        amount: parseInt(document.getElementById('income-amount').value, 10),
        category: incomeCategorySelect.value,
        description: document.getElementById('income-description').value || '-'
    };

    if (!newTransaction.category) {
        alert('수입 카테고리를 먼저 설정해주세요!');
        return;
    }

    transactions.push(newTransaction);
    renderTransactions();
    incomeForm.reset();
    document.getElementById('income-date').valueAsDate = new Date();
    populateMonthFilter();
});

// ** (이전에 남아있던 form.addEventListener('submit', ...) 코드는 제거됨) **

list.addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-btn')) {
        const index = e.target.dataset.index;

        transactions.splice(index, 1);
        renderTransactions();
    }
});


// ------------------------------------
// 7. 카테고리 관리 기능 (2단계 로직 통합)
// ------------------------------------

const modal = document.getElementById('category-modal');
const manageBtn = document.getElementById('manage-categories-btn');
const closeBtn = document.getElementById('close-modal-btn');

const expList = document.getElementById('expense-category-list');
const incList = document.getElementById('income-category-list');

// 모달 열기/닫기 이벤트
manageBtn.addEventListener('click', () => {
    renderCategoryList();
    modal.style.display = 'block';
});

closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
    updateCategoryOptions();
});

window.onclick = function(event) {
    if (event.target == modal) {
        modal.style.display = "none";
        updateCategoryOptions();
    }
}

// 카테고리 리스트 렌더링 함수
function renderCategoryList() {
    expList.innerHTML = '';
    incList.innerHTML = '';

    // 지출 카테고리 렌더링
    customCategories.expense.forEach((cat) => {
        const li = document.createElement('li');
        li.innerHTML = `${cat} <button data-type="expense" data-cat="${cat}" class="delete-cat-btn">X</button>`;
        expList.appendChild(li);
    });

    // 수입 카테고리 렌더링
    customCategories.income.forEach((cat) => {
        const li = document.createElement('li');
        li.innerHTML = `${cat} <button data-type="income" data-cat="${cat}" class="delete-cat-btn">X</button>`;
        incList.appendChild(li);
    });
}

// 새 카테고리 추가 함수
function addCategory(type) {
    const inputId = type === 'expense' ? 'new-expense-category' : 'new-income-category';
    const newCat = document.getElementById(inputId).value.trim();

    if (newCat && !customCategories[type].includes(newCat)) {
        customCategories[type].push(newCat);
        document.getElementById(inputId).value = '';
        saveData();
        renderCategoryList(); // 리스트 새로고침
    } else if (customCategories[type].includes(newCat)) {
        alert('이미 존재하는 카테고리입니다.');
    }
}

document.getElementById('add-expense-category-btn').addEventListener('click', () => addCategory('expense'));
document.getElementById('add-income-category-btn').addEventListener('click', () => addCategory('income'));

// 카테고리 삭제 함수
modal.addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-cat-btn')) {
        const type = e.target.dataset.type;
        const catToDelete = e.target.dataset.cat;

        customCategories[type] = customCategories[type].filter(cat => cat !== catToDelete);
        saveData();
        renderCategoryList();
        updateCategoryOptions(); // 입력 폼 업데이트
    }
});


// ------------------------------------
// 8. 월 필터링 UI 및 로직
// ------------------------------------

function populateMonthFilter() {
    const months = new Set();
    transactions.forEach(tx => {
        months.add(tx.date.substring(0, 7));
    });

    const sortedMonths = Array.from(months).sort().reverse();

    monthFilter.innerHTML = '';

    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = '전체 내역';
    monthFilter.appendChild(allOption);

    sortedMonths.forEach(month => {
        const option = document.createElement('option');
        option.value = month;
        option.textContent = month;
        monthFilter.appendChild(option);
    });

    monthFilter.addEventListener('change', renderTransactions);
}

// ------------------------------------
// 9. 분석 및 그래프 업데이트 (핵심 로직)
// ------------------------------------

function updateSummary() {
    const selectedMonth = monthFilter.value;

    const summaryTransactions = transactions.filter(tx => {
        if (selectedMonth === 'all') return true;
        return tx.date.startsWith(selectedMonth);
    });

    const expenseSummary = calculateCategoryTotals(summaryTransactions, 'expense');
    const incomeSummary = calculateCategoryTotals(summaryTransactions, 'income');

    updateChart('expenseChart', expenseSummary, '지출 비중');
    updateChart('incomeChart', incomeSummary, '수입 비중');
}

function calculateCategoryTotals(txs, type) {
    const totals = {};

    txs.filter(tx => tx.type === type).forEach(tx => {
        if (totals[tx.category]) {
            totals[tx.category] += tx.amount;
        } else {
            totals[tx.category] = tx.amount;
        }
    });
    return totals;
}

function updateChart(canvasId, dataTotals, title) {
    const labels = Object.keys(dataTotals);
    const data = Object.values(dataTotals);

    const total = data.reduce((sum, current) => sum + current, 0);

    if (total === 0) {
        const canvas = document.getElementById(canvasId);
        canvas.style.display = 'none';
        return;
    }
    document.getElementById(canvasId).style.display = 'block';

    const backgroundColors = generateChartColors(labels.length);

    const chartData = {
        labels: labels,
        datasets: [{
            data: data,
            backgroundColor: backgroundColors,
            hoverOffset: 10
        }]
    };

    const config = {
        type: 'pie',
        data: chartData,
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom' },
                title: { display: true, text: title }
            }
        }
    };

    if (canvasId === 'expenseChart' && expenseChartInstance) {
        expenseChartInstance.destroy();
    } else if (canvasId === 'incomeChart' && incomeChartInstance) {
        incomeChartInstance.destroy();
    }

    const ctx = document.getElementById(canvasId).getContext('2d');
    if (canvasId === 'expenseChart') {
        expenseChartInstance = new Chart(ctx, config);
    } else {
        incomeChartInstance = new Chart(ctx, config);
    }
}

function generateChartColors(count) {
    const colors = [];
    for (let i = 0; i < count; i++) {
        const r = Math.floor(Math.random() * 155) + 100;
        const g = Math.floor(Math.random() * 155) + 100;
        const b = Math.floor(Math.random() * 155) + 100;
        colors.push(`rgb(${r}, ${g}, ${b})`);
    }
    return colors;
}

// ------------------------------------
// 초기 로드 시 실행 (날짜 초기화 포함)
// ------------------------------------

document.getElementById('expense-date').valueAsDate = new Date();
document.getElementById('income-date').valueAsDate = new Date();

populateMonthFilter();
updateCategoryOptions();
renderTransactions();