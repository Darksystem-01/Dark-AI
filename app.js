const chatHistory = document.getElementById('chat-history');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const stopBtn = document.getElementById('stop-btn');
const appContainer = document.getElementById('app-container');
const heroSection = document.getElementById('hero');

let currentAbortController = null;
let messagesHistory = [];

// ─── Animated HUD Script ───────────────────────────────────────────────
const hudFullText = `animate('.shape', {\n  x: random(-100, 100),\n  y: random(-100, 100),\n  rotate: random(-180, 180),\n  duration: random(500, 1000),\n  composition: 'blend',\n});`;
const hudEl = document.getElementById('hud-text');
let hudIndex = 0;
function typeHUD() {
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
            rotate: {
                value: [ '-0.5turn', 0 ],
                easing: 'easeOutExpo',
                duration: 500
            },
            opacity: {
                value: [0, 1],
                duration: 300
            },
            delay: anime.stagger(45),
            easing: 'easeInOutCirc',
            loop: true,
            endDelay: 3000
        });
    }
}
initHeroAnimation();

// ─── Marked Configuration ─────────────────────────────────────────────
marked.setOptions({
    highlight: function(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
    },
    breaks: true
});

function formatContent(text) {
    let html = text;
    const imgRegex = /\[IMAGE:\s*(.*?)\]/g;
    html = html.replace(imgRegex, (match, prompt) => {
        const safePrompt = encodeURIComponent(prompt.trim() || 'beautiful abstract art');
        return `<img src="https://image.pollinations.ai/prompt/${safePrompt}?width=800&height=800&nologo=true" alt="${prompt}" loading="lazy" />`;
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
    const toSave = messagesHistory.slice(-30); // Save last 30 messages
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

function renderMessage(role, content, animate = true) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    
    if (role === 'user') {
        msgDiv.innerText = content;
    } else {
        msgDiv.innerHTML = formatContent(content);
        // Apply syntax highlighting
        msgDiv.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
    }

    if (!animate) {
        msgDiv.style.animation = 'none';
    }

    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
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

    const msgDiv = document.createElement('div');
    msgDiv.className = 'message ai';
    msgDiv.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    currentAbortController = new AbortController();

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: messagesHistory }),
            signal: currentAbortController.signal
        });

        if (!response.ok) throw new Error('API Error');

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let fullResponse = "";
        
        msgDiv.innerHTML = ""; // clear typing indicator

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            
            // SSE Parsing Fix
            const lines = chunk.split('\\n');
            for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                        const jsonData = JSON.parse(line.slice(6));
                        if (jsonData.choices && jsonData.choices[0].delta && jsonData.choices[0].delta.content) {
                            fullResponse += jsonData.choices[0].delta.content;
                        }
                    } catch (e) {
                        // Sometimes the free API sends raw strings or weird formats, fallback to appending raw text if parsing fails
                        // If it's a raw string, we can just append it, but we have to be careful
                    }
                } else if (!line.startsWith('data: ') && line.trim() !== '') {
                    // It might just be raw text stream directly from proxy
                    fullResponse += line;
                }
            }

            msgDiv.innerHTML = formatContent(fullResponse);
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }

        // Apply highlighting at the end
        msgDiv.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });

        messagesHistory.push({ role: 'assistant', content: fullResponse });
        saveHistory();

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
