document.addEventListener('DOMContentLoaded', () => {
    // 마크다운 파일을 불러와서 표시하는 함수
    async function loadPatchNotesFromMarkdown() {
        try {
            const response = await fetch('patch_notes.md');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const markdownText = await response.text();
            const htmlContent = marked.parse(markdownText);
            
            // 기존 .note-container를 초기화하고 마크다운 내용을 HTML로 삽입
            const patchNotesContainer = document.querySelector('.note-container');
            patchNotesContainer.innerHTML = `<div id="patch-notes-content"></div>`;
            document.getElementById('patch-notes-content').innerHTML = htmlContent;

        } catch (error) {
            console.error('Error fetching patch notes:', error);
            const patchNotesContainer = document.querySelector('.note-container');
            patchNotesContainer.innerHTML = '<p>패치 노트를 불러오는 데 실패했습니다.</p>';
        }
    }

    // 패치 노트 아이템을 동적으로 생성하고 이벤트 리스너를 추가하는 함수
    function createNoteItem(title, content = '') {
        const noteItem = document.createElement('div');
        noteItem.classList.add('note-item');
        noteItem.innerHTML = `
            <h4>${title}</h4>
            <div class="note-content" style="display: none;">
                <textarea class="note-editor" placeholder="여기에 내용을 입력하세요.">${content}</textarea>
                <div class="button-group">
                    <button class="save-button">저장</button>
                    <button class="cancel-button">취소</button>
                </div>
            </div>
        `;

        noteItem.addEventListener('click', () => {
            // 다른 노트 닫기
            document.querySelectorAll('.note-content').forEach(note => {
                if (note !== noteItem.querySelector('.note-content')) {
                    note.style.display = 'none';
                }
            });

            // 현재 노트 열기/닫기
            const contentDiv = noteItem.querySelector('.note-content');
            const editor = noteItem.querySelector('.note-editor');
            const isVisible = contentDiv.style.display === 'block';
            contentDiv.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) {
                editor.focus();
            }
        });

        // 저장 버튼 이벤트
        noteItem.querySelector('.save-button').addEventListener('click', (e) => {
            e.stopPropagation();
            const contentDiv = noteItem.querySelector('.note-content');
            const editor = noteItem.querySelector('.note-editor');
            const noteTitle = noteItem.querySelector('h4');
            const newTitle = editor.value.split('\n')[0] || '제목 없음';

            if (noteTitle.textContent !== newTitle) {
                localStorage.removeItem(noteTitle.textContent);
            }
            noteTitle.textContent = newTitle;
            localStorage.setItem(newTitle, editor.value);
            contentDiv.style.display = 'none';
        });

        // 취소 버튼 이벤트
        noteItem.querySelector('.cancel-button').addEventListener('click', (e) => {
            e.stopPropagation();
            const contentDiv = noteItem.querySelector('.note-content');
            const editor = noteItem.querySelector('.note-editor');
            contentDiv.style.display = 'none';
            editor.value = localStorage.getItem(noteItem.querySelector('h4').textContent) || '';
        });

        return noteItem;
    }

    // 초기 로딩
    const patchNotesContainer = document.querySelector('.note-container');
    const newNoteButton = document.querySelector('.note-header button');

    // 패치 노트 불러오기 옵션 선택
    // loadPatchNotesFromMarkdown(); // .md 파일로 패치 노트를 관리하고 싶을 때 이 줄의 주석을 해제하세요.

    // 로컬 스토리지에서 저장된 노트 불러오기
    function loadSavedNotes() {
        if (localStorage.length === 0) {
            patchNotesContainer.innerHTML = '<p>저장된 패치 노트가 없습니다. "새로 만들기"를 클릭하여 작성하세요.</p>';
            return;
        }
        
        patchNotesContainer.innerHTML = ''; // 기존 HTML 내용 삭제
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const content = localStorage.getItem(key);
            if (content) {
                const noteItem = createNoteItem(key, content);
                patchNotesContainer.appendChild(noteItem);
            }
        }
    }

    // '새로 만들기' 버튼 클릭 이벤트
    if (newNoteButton) {
        newNoteButton.addEventListener('click', () => {
            const newNoteTitle = prompt('새로운 패치 노트의 제목을 입력하세요:', `새로운 패치 노트 ${Date.now()}`);
            if (newNoteTitle) {
                const newNoteItem = createNoteItem(newNoteTitle, '');
                patchNotesContainer.appendChild(newNoteItem);
                localStorage.setItem(newNoteTitle, '');
                
                // 새로 생성된 노트 자동으로 열기
                newNoteItem.querySelector('h4').click();
            }
        });
    }
    loadPatchNotesFromMarkdown();
});