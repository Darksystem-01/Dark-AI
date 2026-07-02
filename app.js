const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const chatContainer = document.getElementById('chatContainer');
const welcomeScreen = document.getElementById('welcomeScreen');

let chatHistory = [];

// Initialize Markdown parser
marked.setOptions({
    highlight: function(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
    },
    breaks: true
});

// Load history from localStorage
function loadHistory() {
    const saved = localStorage.getItem('nexia_chat_history');
    if (saved) {
        chatHistory = JSON.parse(saved);
        if (chatHistory.length > 0) {
            welcomeScreen.style.display = 'none';
            chatHistory.forEach(msg => {
                if (msg.role !== 'system') {
                    renderMessage(msg.role, msg.content, false);
                }
            });
        }
    }
}

// Save history
function saveHistory() {
    // Only save the last 20 messages to avoid localStorage quota issues
    const toSave = chatHistory.slice(-20);
    localStorage.setItem('nexia_chat_history', JSON.stringify(toSave));
}

// Auto-resize textarea
messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    sendButton.disabled = this.value.trim().length === 0;
});

messageInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!sendButton.disabled) {
            chatForm.dispatchEvent(new Event('submit'));
        }
    }
});

// Create Message Element
function createMessageElement(role) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = role === 'user' ? 'U' : '✨';
    
    const content = document.createElement('div');
    content.className = 'message-content';
    
    div.appendChild(avatar);
    div.appendChild(content);
    return { element: div, contentDiv: content };
}

// Format Content (Markdown + Custom Image Tags)
function formatContent(text) {
    // Check for image tag [IMAGE: prompt]
    let html = text;
    const imgRegex = /\[IMAGE:\s*(.*?)\]/g;
    
    html = html.replace(imgRegex, (match, prompt) => {
        // Fallback for image generation if the prompt is empty
        const safePrompt = encodeURIComponent(prompt.trim() || 'beautiful abstract art');
        return `<img src="/api/image?prompt=${safePrompt}" alt="${prompt}" loading="lazy" />`;
    });
    
    return marked.parse(html);
}

// Render existing message
function renderMessage(role, content, animate = true) {
    welcomeScreen.style.display = 'none';
    const { element, contentDiv } = createMessageElement(role);
    
    if (role === 'user') {
        contentDiv.textContent = content;
    } else {
        contentDiv.innerHTML = formatContent(content);
    }
    
    if (!animate) {
        element.style.animation = 'none';
    }
    
    chatContainer.appendChild(element);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Helper for quick actions
window.setInput = function(text) {
    messageInput.value = text;
    messageInput.dispatchEvent(new Event('input'));
    messageInput.focus();
}

// Chat Form Submission
chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userText = messageInput.value.trim();
    if (!userText) return;

    // Reset input
    messageInput.value = '';
    messageInput.style.height = 'auto';
    sendButton.disabled = true;

    // Render User Message
    renderMessage('user', userText);
    
    // Add to history
    chatHistory.push({ role: 'user', content: userText });
    saveHistory();

    // Create AI typing indicator
    const { element: aiElement, contentDiv: aiContent } = createMessageElement('ai');
    aiContent.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    chatContainer.appendChild(aiElement);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: chatHistory })
        });

        if (!response.ok) throw new Error('API Error');

        aiContent.innerHTML = ''; // Clear typing indicator
        
        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullResponse = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            fullResponse += chunk;
            
            // Re-render markdown as it streams
            aiContent.innerHTML = formatContent(fullResponse);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        // Finalize response
        chatHistory.push({ role: 'assistant', content: fullResponse });
        saveHistory();

        // Apply syntax highlighting after complete
        aiContent.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });

    } catch (error) {
        aiContent.innerHTML = `<p style="color: #ef4444">Connection error. Please try again later.</p>`;
        console.error(error);
    }
});

// Load on start
loadHistory();
