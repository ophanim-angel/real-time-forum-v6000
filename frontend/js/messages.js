// ==================== MESSAGES & CHAT LOGIC ====================

let ws = null;
let currentChatUserId = null;
let currentChatUserNickname = '';
let chatOffset = 0;
let isLoadingMessages = false;
let hasMoreMessages = true;
let usersCache = [];
let typingUsers = new Map();
let reconnectTimeoutId = null;
let shouldReconnect = false;

// Initialize WebSocket
function initWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
    }

    if (!window.currentUser) return;

    const token = localStorage.getItem('jwt_token');
    if (!token) return;

    shouldReconnect = true;
    clearTimeout(reconnectTimeoutId);

    // Connect to WebSocket using current host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket connected');
        clearTimeout(reconnectTimeoutId);
        updateChatStatus('Connected');
    };

    ws.onmessage = (event) => {
        try {
            // Backend can send multiple messages separated by \n in one frame
            const messages = event.data.split('\n');
            messages.forEach(msgStr => {
                if (msgStr.trim()) {
                    const data = JSON.parse(msgStr);
                    handleWebSocketEvent(data);
                }
            });
        } catch (e) {
            console.error('Error parsing WS message:', e, 'Raw data:', event.data);
        }
    };

    ws.onclose = (event) => {
        ws = null;
        hideTypingIndicator();

        if (currentChatUserId) {
            updateChatStatus('Disconnected');
        }

        if (!shouldReconnect) {
            return;
        }

        console.log(`WebSocket disconnected (${event.code}). Reconnecting in 3s...`);
        if (localStorage.getItem('jwt_token') && window.currentUser) {
            reconnectTimeoutId = setTimeout(() => {
                if (!ws) {
                    initWebSocket();
                }
            }, 3000);
        }
    };

    ws.onerror = (err) => {
        console.error('WebSocket Error:', err);
    };
}

// Handle incoming WS events
function handleWebSocketEvent(event) {
    if (event.type === 'new_message') {
        const msg = event.payload;
        const myId = window.currentUser ? window.currentUser.user_id : null;
        const activeChatId = currentChatUserId;

        // If message belongs to current active chat, append it
        const isRelevant = (msg.sender_id === myId && msg.receiver_id === activeChatId) ||
            (msg.sender_id === activeChatId && msg.receiver_id === myId);

        if (isRelevant) {
            appendMessageToChat(msg, false);
            scrollToBottom();
            updateChatStatus('Connected');
        } else {
            if (msg.sender_id !== myId) {
                incrementUnreadBadge(msg.sender_id);
                showNotification('New message received', 'success');
                showIncomingMessageToast(msg);
            }
        }

        loadMessagesList();
    } else if (event.type === 'typing') {
        const senderId = event.payload.sender_id;
        typingUsers.set(senderId, true);
        if (isMessagesPopupOpen()) {
            loadMessagesList();
        }
        if (senderId === currentChatUserId) {
            showTypingIndicator();
            updateChatStatus('Typing...');
        }
    } else if (event.type === 'stop_typing') {
        const senderId = event.payload.sender_id;
        typingUsers.delete(senderId);
        if (isMessagesPopupOpen()) {
            loadMessagesList();
        }
        if (senderId === currentChatUserId) {
            hideTypingIndicator();
            updateChatStatus('Connected');
        }
    }
}

function isMessagesPopupOpen() {
    const popup = document.getElementById('chat-popup');
    return popup && !popup.classList.contains('hidden');
}

function toggleMessagesPopup(forceState) {
    const popup = document.getElementById('chat-popup');
    if (!popup) return;

    const shouldOpen = typeof forceState === 'boolean'
        ? forceState
        : popup.classList.contains('hidden');

    popup.classList.toggle('hidden', !shouldOpen);

    if (shouldOpen) {
        loadMessagesList();
        clearGlobalMessageBadge();
    } else {
        stopTyping();
    }
}

function updateChatStatus(text) {
    const status = document.getElementById('chat-status');
    if (status) status.textContent = text;
}

function incrementUnreadBadge(userId) {
    const navIcon = document.getElementById('nav-msg-icon');
    if (navIcon) {
        let globalBadge = document.getElementById('nav-global-badge');
        if (!globalBadge) {
            globalBadge = document.createElement('span');
            globalBadge.id = 'nav-global-badge';
            globalBadge.className = 'nav-global-badge';
            navIcon.appendChild(globalBadge);
        }
    }

    const userEl = document.querySelector(`.message-user[data-userid="${userId}"]`);
    if (!userEl) return;

    let badge = userEl.querySelector('.unread-badge');
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'unread-badge';
        badge.textContent = '1';
        userEl.appendChild(badge);
    } else {
        badge.textContent = String((parseInt(badge.textContent, 10) || 0) + 1);
    }
}

function clearGlobalMessageBadge() {
    document.getElementById('nav-global-badge')?.remove();
}

function showIncomingMessageToast(message) {
    const stack = document.getElementById('chat-toast-stack');
    if (!stack) return;

    const sender = usersCache.find(user => user.id === message.sender_id);
    const toast = document.createElement('button');
    toast.type = 'button';
    toast.className = 'chat-toast';
    toast.innerHTML = `
        <div class="chat-toast-title">${escapeHTML(sender?.nickname || 'New message')}</div>
        <div class="chat-toast-text">${escapeHTML(message.content)}</div>
    `;
    toast.onclick = () => {
        toggleMessagesPopup(true);
        if (sender) {
            openChat(sender.id, sender.nickname);
        }
        toast.remove();
    };

    stack.prepend(toast);
    setTimeout(() => toast.remove(), 5000);
}

// Load users for the sidebar
async function loadMessagesList() {
    const listContainer = document.getElementById('messages-list');

    try {
        const users = await apiRequest('/api/chat/users', 'GET');
        usersCache = users || [];

        if (!users || users.length === 0) {
            listContainer.innerHTML = '<p class="text-center" style="font-size: 0.75rem; color: var(--text-muted); padding: 1rem;">No users found</p>';
            return;
        }

        listContainer.innerHTML = '';
        users.forEach(user => {
            const userEl = document.createElement('div');
            userEl.className = `message-user ${currentChatUserId === user.id ? 'active' : ''}`;
            userEl.onclick = () => openChat(user.id, user.nickname);

            userEl.dataset.userid = user.id;

            const initial = user.nickname.charAt(0).toUpperCase();
            const isTypingNow = typingUsers.has(user.id);

            let lastMsgText = user.last_msg || 'Start a conversation';
            if (lastMsgText.length > 25) lastMsgText = lastMsgText.substring(0, 25) + '...';

            // Keep existing unread badge if we reload
            const existingBadge = document.querySelector(`.message-user[data-userid="${user.id}"] .unread-badge`);
            const badgeHtml = existingBadge ? existingBadge.outerHTML : '';

            if (isTypingNow) {
                userEl.classList.add('typing');
            }

            userEl.innerHTML = `
                <div class="post-avatar" style="width: 32px; height: 32px; font-size: 0.75rem;">${initial}</div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 800; font-size: 0.75rem;">${escapeHTML(user.nickname)}</div>
                    <div class="msg-snippet" style="font-size: 0.625rem; color: ${currentChatUserId === user.id ? 'var(--bg)' : 'var(--text-muted)'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${isTypingNow ? 'Typing...' : escapeHTML(lastMsgText)}
                    </div>
                </div>
                ${badgeHtml}
            `;

            listContainer.appendChild(userEl);
        });

    } catch (error) {
        console.error('Error loading users:', error);
    }
}

// Open chat with a user
async function openChat(userId, nickname) {
    toggleMessagesPopup(true);
    stopTyping();
    currentChatUserId = userId;
    currentChatUserNickname = nickname;
    chatOffset = 0;
    hasMoreMessages = true;
    typingUsers.delete(userId);

    // Show input area now that a user is selected
    const inputArea = document.querySelector('.message-input-area');
    if (inputArea) inputArea.style.display = 'flex';

    // Update UI headers
    document.getElementById('chat-username').textContent = nickname;
    document.getElementById('chat-avatar').textContent = nickname.charAt(0).toUpperCase();
    document.getElementById('chat-status').textContent = 'Loading messages...';

    // Highlight active user in sidebar and clear unread badge
    const users = document.querySelectorAll('.message-user');
    users.forEach(u => {
        if (u.dataset.userid === userId) {
            u.classList.add('active');
            const badge = u.querySelector('.unread-badge');
            if (badge) badge.remove();
        } else {
            u.classList.remove('active');
        }
    });

    // Clear chat body
    const body = document.getElementById('message-body');
    body.innerHTML = '';

    // Enable input
    document.getElementById('message-input').disabled = false;
    document.getElementById('message-input').focus();

    // Setup infinite scroll
    body.onscroll = debounce(handleScroll, 150);

    // Load initial messages
    await loadMessages();
    scrollToBottom();

    updateChatStatus('Connected');
}

// Handle scroll up for infinite load (throttle/debounce)
function handleScroll() {
    const body = document.getElementById('message-body');
    if (body.scrollTop === 0 && !isLoadingMessages && hasMoreMessages) {
        // Save current scroll height to restore position after prepend
        const oldHeight = body.scrollHeight;

        loadMessages().then(() => {
            const newHeight = body.scrollHeight;
            body.scrollTop = newHeight - oldHeight; // Keep scroll position
        });
    }
}

// Load messages with offset (pagination of 10)
async function loadMessages() {
    if (!currentChatUserId || isLoadingMessages || !hasMoreMessages) return;

    isLoadingMessages = true;
    const body = document.getElementById('message-body');

    try {
        const messages = await apiRequest(`/api/chat/history?target_id=${currentChatUserId}&offset=${chatOffset}`, 'GET');

        if (!messages || messages.length === 0) {
            hasMoreMessages = false;
            if (chatOffset === 0) {
                // Empty chat
                body.innerHTML = `
                    <div class="text-center" style="padding: 3rem; color: var(--text-muted);">
                        <span class="material-symbols-outlined" style="font-size: 3rem; opacity: 0.3;">waving_hand</span>
                        <p style="margin-top: 1rem; font-weight: 700; text-transform: uppercase;">Say hi to ${currentChatUserNickname}!</p>
                    </div>
                `;
            } else {
                // No more history
                const endEl = document.createElement('div');
                endEl.className = 'text-center';
                endEl.style = "padding: 1rem; color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; font-weight: 700;";
                endEl.textContent = "Start of conversation";
                body.prepend(endEl);
            }
            updateChatStatus('Connected');
            isLoadingMessages = false;
            return;
        }

        // Remove empty placeholder if any
        if (chatOffset === 0) body.innerHTML = '';

        // Messages come sorted newest first from API, so we need to reverse them to display top-to-bottom properly
        // BUT wait, when prepending history, older messages go at the TOP.
        // Let's iterate messages. API returns [msg_1 (newest), msg_2, msg_3 (oldest)]
        // We want to prepend msg_1 at the top of current list. Then prepend msg_2 ABOVE msg_1, etc.
        // So we just iterate normally and prepend each.
        messages.forEach(msg => {
            appendMessageToChat(msg, true); // true = prepend
        });

        chatOffset += messages.length;
        if (messages.length < 10) {
            hasMoreMessages = false; // API returned less than requested limit (10)
        }

    } catch (error) {
        console.error('Error loading messages:', error);
    } finally {
        isLoadingMessages = false;
    }
}

// Add message to DOM
function appendMessageToChat(msg, prepend = false) {
    const body = document.getElementById('message-body');
    const myId = window.currentUser ? window.currentUser.user_id : null;
    const isMine = msg.sender_id === myId;

    // Remove typing indicator if we are appending a new message at the bottom
    const indicator = document.getElementById('typing-indicator');
    if (indicator && !prepend) {
        indicator.remove();
    }

    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.maxWidth = '80%';
    wrapper.style.alignItems = isMine ? 'flex-end' : 'flex-start';
    wrapper.style.alignSelf = isMine ? 'flex-end' : 'flex-start';

    const timeInfo = document.createElement('span');
    timeInfo.style.fontSize = '10px';
    timeInfo.style.fontWeight = '900';
    timeInfo.style.color = '#999';
    timeInfo.style.textTransform = 'uppercase';
    timeInfo.style.marginBottom = '0.25rem';

    const date = new Date(msg.created_at);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    timeInfo.textContent = `${isMine ? 'YOU' : escapeHTML(currentChatUserNickname)} • ${timeStr}`;

    const bubble = document.createElement('div');
    bubble.style.padding = '0.75rem 1rem';
    bubble.style.border = '2px solid var(--primary)';
    bubble.style.fontSize = '14px';
    bubble.style.fontWeight = '500';
    bubble.style.boxShadow = '2px 2px 0px 0px rgba(0,0,0,1)';
    bubble.style.wordBreak = 'break-word';
    bubble.style.background = isMine ? 'var(--chat-sent)' : 'var(--chat-received)';

    bubble.textContent = msg.content;

    wrapper.appendChild(timeInfo);
    wrapper.appendChild(bubble);

    if (prepend) {
        body.prepend(wrapper);
    } else {
        body.appendChild(wrapper);
    }
}

// Send Message
async function sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();

    if (!content || !currentChatUserId) return;

    const payload = {
        receiver_id: currentChatUserId,
        content: content
    };

    // Clear input immediately for better UX
    input.value = '';
    stopTyping();

    try {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'send_message',
                payload
            }));
            updateChatStatus('Connected');
            return;
        }

        const msg = await apiRequest('/api/chat/send', 'POST', payload);
        if (msg && msg.payload) {
            appendMessageToChat(msg.payload, false);
            scrollToBottom();
            loadMessagesList();
        }
    } catch (error) {
        showNotification(error.message, 'error');
        input.value = content;
        updateChatStatus('Disconnected');
    }
}

// Allow Enter key and track typing
let isTyping = false;
let typingTimeoutLocal = null;

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('message-input');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        });

        input.addEventListener('input', () => {
            if (!currentChatUserId || !ws || ws.readyState !== WebSocket.OPEN) return;

            if (!input.value.trim()) {
                stopTyping();
                return;
            }

            if (!isTyping) {
                isTyping = true;
                ws.send(JSON.stringify({ type: 'typing', payload: { receiver_id: currentChatUserId } }));
            }

            clearTimeout(typingTimeoutLocal);
            typingTimeoutLocal = setTimeout(() => {
                stopTyping();
            }, 2000);
        });

        input.disabled = true; // Disable until a chat is opened
    }
});

let removeTypingTimeout = null;
function showTypingIndicator() {
    const body = document.getElementById('message-body');
    let indicator = document.getElementById('typing-indicator');

    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'typing-indicator';
        indicator.className = 'typing-indicator';
        indicator.innerHTML = `
            <div class="typing-dot" style="animation-delay: 0s"></div>
            <div class="typing-dot" style="animation-delay: 0.1s"></div>
            <div class="typing-dot" style="animation-delay: 0.2s"></div>
        `;
        body.appendChild(indicator);
        scrollToBottom();
    }

    clearTimeout(removeTypingTimeout);
    removeTypingTimeout = setTimeout(() => {
        hideTypingIndicator();
        if (currentChatUserId) updateChatStatus('Connected');
    }, 2500);
}

function hideTypingIndicator() {
    document.getElementById('typing-indicator')?.remove();
}

function stopTyping() {
    clearTimeout(typingTimeoutLocal);
    if (!isTyping) return;

    isTyping = false;
    if (currentChatUserId && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'stop_typing',
            payload: { receiver_id: currentChatUserId }
        }));
    }
}

// Scroll to bottom of chat
function scrollToBottom() {
    const body = document.getElementById('message-body');
    body.scrollTop = body.scrollHeight;
}

// Helper: Debounce function for smooth scrolling API calls
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Export for other scripts
window.initWebSocket = initWebSocket;
window.closeWebSocket = () => {
    shouldReconnect = false;
    clearTimeout(reconnectTimeoutId);
    if (ws) {
        ws.close(1000, 'client closing');
        ws = null;
    }
};
window.sendMessage = sendMessage;
window.loadMessagesList = loadMessagesList;
window.openChat = openChat;
window.toggleMessagesPopup = toggleMessagesPopup;
