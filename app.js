const chatHistory = document.getElementById('chat-history');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const stopBtn = document.getElementById('stop-btn');
const appContainer = document.getElementById('app-container');
const clearChatBtn = document.getElementById('clear-chat-btn');
const toggleDeepthink = document.getElementById('toggle-deepthink');
const toggleSearch = document.getElementById('toggle-search');

let currentAbortController = null;
let messagesHistory = [];
let useDeepthink = false;
let useSearch = false;

// ─── Toggles & Clear Chat ──────────────────────────────────────────────
toggleDeepthink.addEventListener('click', () => {
    useDeepthink = !useDeepthink;
    toggleDeepthink.classList.toggle('active', useDeepthink);
});

toggleSearch.addEventListener('click', () => {
    useSearch = !useSearch;
    toggleSearch.classList.toggle('active', useSearch);
});

clearChatBtn.addEventListener('click', () => {
    if(confirm("Are you sure you want to clear the entire chat history?")) {
        messagesHistory = [];
        localStorage.removeItem('dark_ai_history');
        chatHistory.innerHTML = '';
        appContainer.classList.remove('chat-active');
    }
});

// ─── Animated HUD Script ───────────────────────────────────────────────
const hudFullText = `animate('.shape', {\n  x: random(-100, 100),\n  y: random(-100, 100),\n  rotate: random(-180, 180),\n  duration: random(500, 1000),\n  composition: 'blend',\n});`;
const hudEl = document.getElementById('hud-text');
let hudIndex = 0;
function typeHUD() {
    if (!hudEl) return;
    if (hudIndex < hudFullText.length) {
        hudEl.textContent += hudFullText[hudIndex];
        hudIndex++;
        setTimeout(typeHUD, 60);
    } else {
        setTimeout(() => {
            hudEl.textContent = '';
            hudIndex = 0;
            setTimeout(typeHUD, 1000);
        }, 4000);
    }
}
typeHUD();

// ─── Anime.js Hero Title Animation ────────────────────────────────────
function initHeroAnimation() {
    const titleEl = document.getElementById('hero-title');
    if (!titleEl) return;

    const text = titleEl.textContent;
    titleEl.textContent = '';
    text.split('').forEach(char => {
        const span = document.createElement('span');
        span.className = 'char';
        span.textContent = char === ' ' ? '\u00a0' : char;
        titleEl.appendChild(span);
    });

    if (typeof anime !== 'undefined') {
        anime({
            targets: '.hero-title .char',
            y: [
                { value: '-1.5rem', easing: 'easeOutExpo', duration: 500 },
                { value: 0, easing: 'easeOutBounce', duration: 700, delay: 80 }
            ],
            rotate: { value: [ '-0.5turn', 0 ], easing: 'easeOutExpo', duration: 500 },
            opacity: { value: [0, 1], duration: 300 },
            delay: anime.stagger(45),
            easing: 'easeInOutCirc',
            loop: true,
            endDelay: 3000
        });
    }
}
initHeroAnimation();

// ─── Marked Configuration & Custom Renderer ───────────────────────────
const renderer = new marked.Renderer();

// Custom code block renderer to add Copy buttons
renderer.code = function(code_or_token, lang_opt, escaped_opt) {
    let code, lang;
    if (typeof code_or_token === 'object' && code_or_token !== null) {
        code = code_or_token.text;
        lang = code_or_token.lang;
    } else {
        code = code_or_token;
        lang = lang_opt;
    }
    
    const validLang = !!(lang && hljs.getLanguage(lang));
    const languageClass = validLang ? `language-${lang}` : 'language-plaintext';
    const highlightedCode = validLang ? hljs.highlight(code, { language: lang }).value : escapeHTML(code);
    
    // Safely encode code for the copy button attribute
    const safeCode = encodeURIComponent(code);

    return `
    <pre>
        <div class="code-actions">
            <span style="color: rgba(255,255,255,0.3); font-size: 0.75rem; margin-right: auto; padding-left: 5px; align-self: center;">${lang || 'code'}</span>
            <button class="code-btn" onclick="copyCode(this, '${safeCode}')">Copy</button>
        </div>
        <code class="${languageClass}">${highlightedCode}</code>
    </pre>`;
};

marked.setOptions({
    renderer: renderer,
    breaks: true
});

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// Global copy function for code blocks
window.copyCode = function(btn, encodedCode) {
    const code = decodeURIComponent(encodedCode);
    navigator.clipboard.writeText(code).then(() => {
        const originalText = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(() => btn.textContent = originalText, 2000);
    });
};

function formatContent(text) {
    if (typeof text !== 'string') {
        return "";
    }
    let html = text;
    const imgRegex = /\[IMAGE:\s*(.*?)\]/g;
    html = html.replace(imgRegex, (match, prompt) => {
        const safePrompt = encodeURIComponent(prompt.trim() || 'beautiful abstract art');
        return `<img src="/api/image?prompt=${safePrompt}" alt="${prompt}" loading="lazy" class="generated-image" />`;
    });
    return marked.parse(html);
}

// ─── History Management ─────────────────────────────────────────────
function loadHistory() {
    const saved = localStorage.getItem('dark_ai_history');
    if (saved) {
        messagesHistory = JSON.parse(saved);
        if (messagesHistory.length > 0) {
            appContainer.classList.add('chat-active');
            messagesHistory.forEach(msg => {
                if (msg.role !== 'system') {
                    renderMessage(msg.role, msg.content, false);
                }
            });
        }
    }
}

function saveHistory() {
    const toSave = messagesHistory.slice(-30);
    localStorage.setItem('dark_ai_history', JSON.stringify(toSave));
}

// ─── UI Actions ───────────────────────────────────────────────────────
function setGenerating(isGenerating) {
    if (isGenerating) {
        sendBtn.classList.add('hidden');
        stopBtn.classList.add('visible');
        sendBtn.disabled = true;
    } else {
        stopBtn.classList.remove('visible');
        sendBtn.classList.remove('hidden');
        sendBtn.disabled = userInput.value.trim().length === 0;
    }
}

stopBtn.addEventListener('click', () => {
    if (currentAbortController) {
        currentAbortController.abort();
    }
});

function copyMessageText(btn, text) {
    navigator.clipboard.writeText(text).then(() => {
        const span = btn.querySelector('span');
        if(span) span.textContent = 'Copied!';
        setTimeout(() => { if(span) span.textContent = 'Copy'; }, 2000);
    });
}

function editMessageText(text) {
    userInput.value = text;
    userInput.focus();
    userInput.style.height = 'auto';
    userInput.style.height = (userInput.scrollHeight) + 'px';
    sendBtn.disabled = false;
}

function renderMessage(role, content, animate = true) {
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${role}`;

    const msgDiv = document.createElement('div');
    msgDiv.className = `message`;
    
    if (role === 'user') {
        msgDiv.innerText = content;
    } else {
        msgDiv.innerHTML = formatContent(content);
    }

    wrapper.appendChild(msgDiv);

    // Add action bar under message
    if (role === 'user' || role === 'assistant') {
        const actionBar = document.createElement('div');
        actionBar.className = 'message-actions';
        
        // Add timestamp
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        const now = new Date();
        timeSpan.textContent = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
        actionBar.appendChild(timeSpan);

        // Copy Button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'action-icon-btn';
        copyBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg> <span>Copy</span>`;
        copyBtn.onclick = () => copyMessageText(copyBtn, content);
        actionBar.appendChild(copyBtn);

        // Edit Button (Only for user)
        if (role === 'user') {
            const editBtn = document.createElement('button');
            editBtn.className = 'action-icon-btn';
            editBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg> <span>Edit</span>`;
            editBtn.onclick = () => editMessageText(content);
            actionBar.appendChild(editBtn);
        }

        wrapper.appendChild(actionBar);
    }

    if (!animate) {
        wrapper.style.animation = 'none';
    }

    chatHistory.appendChild(wrapper);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    
    // Code blocks are already highlighted by marked renderer
    return msgDiv;
}

// ─── Chat Submission ──────────────────────────────────────────────────
async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    appContainer.classList.add('chat-active');
    renderMessage('user', text);
    
    messagesHistory.push({ role: 'user', content: text });
    saveHistory();

    userInput.value = '';
    userInput.style.height = 'auto';
    setGenerating(true);

    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper ai';
    
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message ai';
    msgDiv.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    
    wrapper.appendChild(msgDiv);
    chatHistory.appendChild(wrapper);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    currentAbortController = new AbortController();

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                messages: messagesHistory,
                use_deepthink: useDeepthink,
                use_search: useSearch
            }),
            signal: currentAbortController.signal
        });

        if (!response.ok) throw new Error('API Error');

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let fullResponse = "";
        
        msgDiv.innerHTML = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            fullResponse += chunk;

            msgDiv.innerHTML = formatContent(fullResponse);
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }

        messagesHistory.push({ role: 'assistant', content: fullResponse });
        saveHistory();

        // Add action bar dynamically to this finished message
        const actionBar = document.createElement('div');
        actionBar.className = 'message-actions';
        
        // Add timestamp
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        const now = new Date();
        timeSpan.textContent = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
        actionBar.appendChild(timeSpan);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'action-icon-btn';
        copyBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg> <span>Copy</span>`;
        copyBtn.onclick = () => copyMessageText(copyBtn, fullResponse);
        actionBar.appendChild(copyBtn);
        wrapper.appendChild(actionBar);

    } catch (err) {
        if (err.name === 'AbortError') {
            if (msgDiv.innerHTML === '' || msgDiv.querySelector('.typing-indicator')) {
                msgDiv.innerHTML = `<span style="color:#888">⏹ Stopped.</span>`;
            }
        } else {
            msgDiv.innerHTML = `<span style="color:#ff6b6b">Connection error: ${err.message}</span>`;
        }
    } finally {
        setGenerating(false);
        currentAbortController = null;
        userInput.focus();
    }
}

sendBtn.addEventListener('click', sendMessage);

userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) {
            sendMessage();
        }
    }
});

userInput.addEventListener('input', function() {
    this.style.height = 'auto';
    if (this.scrollHeight > 40 && this.scrollHeight < 150) {
        this.style.height = (this.scrollHeight) + 'px';
    } else if (this.scrollHeight >= 150) {
        this.style.height = '150px';
    }
    
    sendBtn.disabled = this.value.trim().length === 0;
});

loadHistory();
