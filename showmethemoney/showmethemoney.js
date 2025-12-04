// 로또 번호 생성 함수 (변경 없음)
    function generateLottoNumbers() {
        const count = parseInt(document.getElementById('lotto-count').value, 10);
        const selectedNumbersInput = document.getElementById('lotto-selected-numbers').value;
        const lottoOutput = document.getElementById('lotto-numbers');
        lottoOutput.textContent = '';

        if (isNaN(count) || count < 1 || count > 10) {
            lottoOutput.textContent = '1에서 10 사이의 유효한 값을 입력해주세요.';
            return;
        }

        const selectedNumbers = selectedNumbersInput
            .split(',')
            .map(num => parseInt(num.trim(), 10))
            .filter(num => !isNaN(num) && num >= 1 && num <= 45);

        const uniqueSelectedNumbers = [...new Set(selectedNumbers)];
    
        if (uniqueSelectedNumbers.length > 5) {
            lottoOutput.textContent = '포함할 번호는 중복 없이 최대 5개까지 입력할 수 있습니다.';
            return;
        }

        let results = [];
        for (let i = 0; i < count; i++) {
            let numbers = [...uniqueSelectedNumbers];
            while (numbers.length < 6) {
                let randomNumber = Math.floor(Math.random() * 45) + 1;
                if (!numbers.includes(randomNumber)) {
                    numbers.push(randomNumber);
                }
            }
            numbers.sort((a, b) => a - b);
            results.push(`[${i + 1}] ${numbers.join(' | ')}`);
        }
        lottoOutput.textContent = results.join('\n');
    }

    function generatePensionNumbers() {
        const option = document.getElementById('pension-option').value;
        const pensionOutput = document.getElementById('pension-numbers');
        pensionOutput.textContent = '';
        let results = [];

        if (option === 'single') {
            const group = Math.floor(Math.random() * 5) + 1;
            const number = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
            results.push(`${group}조 ${number}`);
        } else if (option === 'all-random') {
            for (let i = 1; i <= 5; i++) {
                const number = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
                results.push(`${i}조 ${number}`);
            }
        } else if (option === 'all-same') {
            const number = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
            for (let i = 1; i <= 5; i++) {
                results.push(`${i}조 ${number}`);
            }
        }

        pensionOutput.textContent = results.join('\n');
    }

    // 버튼을 DOMContentLoaded에서 바인딩합니다. (defer 스크립트와 함께 안전)
    document.addEventListener('DOMContentLoaded', function () {
        const lottoBtn = document.getElementById('generate-lotto');
        const pensionBtn = document.getElementById('generate-pension');
        if (lottoBtn) lottoBtn.addEventListener('click', generateLottoNumbers);
        if (pensionBtn) pensionBtn.addEventListener('click', generatePensionNumbers);
    });