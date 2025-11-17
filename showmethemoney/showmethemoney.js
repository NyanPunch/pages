    // 로또 번호 생성 함수 (변경 없음)
    function generateLottoNumbers() {
        const count = parseInt(document.getElementById('lotto-count').value, 10);
        const lottoOutput = document.getElementById('lotto-numbers');
        lottoOutput.textContent = '';

        if (isNaN(count) || count < 1 || count > 10) {
            lottoOutput.textContent = '1에서 10 사이의 유효한 값을 입력해주세요.';
            return;
        }

        let results = [];
        for (let i = 0; i < count; i++) {
            let numbers = [];
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