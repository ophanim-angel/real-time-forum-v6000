// ==================== MESSAGES & CHAT LOGIC ====================

let ws = null;
let currentChatUserId = null;
let currentChatUserNickname = '';
let oldestLoadedRequestId = null;
let isLoadingMessages = false;
let hasMoreMessages = true;
let usersCache = [];
let typingUsers = new Map();
let reconnectTimeoutId = null;
let shouldReconnect = false;
let isTyping = false;
let typingTimeoutLocal = null;
let lastTypingSentAt = 0;
let currentChatMessages = new Map();

const TYPING_PING_INTERVAL_MS = 1500;
const TYPING_IDLE_TIMEOUT_MS = 3000;
const REMOTE_TYPING_TIMEOUT_MS = 4500;

// Initialize WebSocket
function initWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
    }

    if (!window.currentUser) return;

    shouldReconnect = true;
    clearTimeout(reconnectTimeoutId);

    // Connect to WebSocket using current host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        clearTimeout(reconnectTimeoutId);
        updateChatStatus('Connected');
        loadMessagesList();
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
        clearAllTypingUsers();
        resetLocalTypingState();
        markAllUsersOffline();

        if (currentChatUserId) {
            updateChatStatus('Disconnected');
        }

        if (!shouldReconnect) {
            return;
        }

        if (window.currentUser) {
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
        clearTypingForUser(msg.sender_id);
        const myId = window.currentUser ? window.currentUser.user_id : null;
        const activeChatId = currentChatUserId;
        const isChatVisible = isMessagesPopupOpen() && activeChatId !== null;

        // Only suppress notifications when the matching conversation is actually visible.
        const isRelevant = isChatVisible && (
            (msg.sender_id === myId && msg.receiver_id === activeChatId) ||
            (msg.sender_id === activeChatId && msg.receiver_id === myId)
        );

        if (isRelevant) {
            appendMessageToChat(msg, true);
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
        typingUsers.set(senderId, Date.now());
        if (isMessagesPopupOpen()) {
            loadMessagesList();
        }
        if (senderId === currentChatUserId) {
            showTypingIndicator();
            updateChatStatus('Typing...');
        }
    } else if (event.type === 'stop_typing') {
        const senderId = event.payload.sender_id;
        clearTypingForUser(senderId);
        if (isMessagesPopupOpen()) {
            loadMessagesList();
        }
        if (senderId === currentChatUserId) {
            hideTypingIndicator();
            updateChatStatus('Connected');
        }
    } else if (event.type === 'presence_update') {
        setUserOnlineStatus(event.payload.user_id, event.payload.is_online);
        if (!event.payload.is_online) {
            clearTypingForUser(event.payload.user_id);
            if (isMessagesPopupOpen()) {
                loadMessagesList();
            }
            if (event.payload.user_id === currentChatUserId) {
                hideTypingIndicator();
                updateChatStatus('Connected');
            }
        }
    } else if (event.type === 'session_revoked') {
        shouldReconnect = false;
        if (window.clearSession) {
            window.clearSession({
                updateStorage: true,
                notify: true,
                notificationMessage: event.payload?.message || 'Your session was replaced by a new login.'
            });
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

function setUserOnlineStatus(userId, isOnline) {
    if (!userId) return;

    const cachedUser = usersCache.find(user => user.id === userId);
    if (cachedUser) {
        cachedUser.is_online = Boolean(isOnline);
    }

    const statusDot = document.querySelector(`.message-user[data-userid="${userId}"] .user-status-dot`);
    if (statusDot) {
        statusDot.classList.toggle('online', Boolean(isOnline));
        statusDot.classList.toggle('offline', !isOnline);
    }
}

function clearTypingForUser(userId) {
    if (!userId) return;
    typingUsers.delete(userId);
}

function clearAllTypingUsers() {
    typingUsers.clear();
}

function markAllUsersOffline() {
    usersCache = usersCache.map(user => ({
        ...user,
        is_online: false
    }));

    document.querySelectorAll('.user-status-dot').forEach(dot => {
        dot.classList.remove('online');
        dot.classList.add('offline');
    });
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
            const typingUpdatedAt = typingUsers.get(user.id);
            const isTypingNow = Boolean(typingUpdatedAt) && (Date.now() - typingUpdatedAt) < REMOTE_TYPING_TIMEOUT_MS;

            if (!isTypingNow) {
                typingUsers.delete(user.id);
            }

            let lastMsgText = user.last_msg || 'Start a conversation';
            if (lastMsgText.length > 25) lastMsgText = lastMsgText.substring(0, 25) + '...';

            // Keep existing unread badge if we reload
            const existingBadge = document.querySelector(`.message-user[data-userid="${user.id}"] .unread-badge`);
            const badgeHtml = existingBadge ? existingBadge.outerHTML : '';

            if (isTypingNow) {
                userEl.classList.add('typing');
            }

            userEl.innerHTML = `
                <div class="message-user-avatar">
                    <div class="post-avatar" style="width: 32px; height: 32px; font-size: 0.75rem;">${initial}</div>
                    <span class="user-status-dot ${user.is_online ? 'online' : 'offline'}" title="${user.is_online ? 'Online' : 'Offline'}"></span>
                </div>
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
    oldestLoadedRequestId = null;
    hasMoreMessages = true;
    currentChatMessages = new Map();
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

function getMessageRequestId(msg) {
    const parsed = Number(msg?.request_id);
    return Number.isFinite(parsed) ? parsed : 0;
}

function getSortedCurrentChatMessages() {
    return Array.from(currentChatMessages.values()).sort((a, b) => {
        const requestDiff = getMessageRequestId(a) - getMessageRequestId(b);
        if (requestDiff !== 0) return requestDiff;

        const timeDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        if (timeDiff !== 0) return timeDiff;

        return String(a.id).localeCompare(String(b.id));
    });
}

function storeChatMessage(msg) {
    if (!msg || !msg.id) return;
    currentChatMessages.set(msg.id, msg);
}

function updateOldestLoadedRequestId() {
    const sortedMessages = getSortedCurrentChatMessages();
    oldestLoadedRequestId = sortedMessages.length > 0 ? getMessageRequestId(sortedMessages[0]) : null;
}

function renderCurrentChat() {
    const body = document.getElementById('message-body');
    if (!body) return;

    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.remove();
    }

    body.innerHTML = '';

    const myId = window.currentUser ? window.currentUser.user_id : null;
    const messages = getSortedCurrentChatMessages();

    messages.forEach(msg => {
        const isMine = msg.sender_id === myId;
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.maxWidth = '80%';
        wrapper.style.alignItems = isMine ? 'flex-end' : 'flex-start';
        wrapper.style.alignSelf = isMine ? 'flex-end' : 'flex-start';
        wrapper.dataset.messageId = msg.id;
        wrapper.dataset.requestId = String(getMessageRequestId(msg));

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
        body.appendChild(wrapper);
    });

    if (currentChatUserId && typingUsers.has(currentChatUserId)) {
        showTypingIndicator();
    }
}

// Load messages 10 at a time with a stable request-id cursor
async function loadMessages() {
    if (!currentChatUserId || isLoadingMessages || !hasMoreMessages) return;

    isLoadingMessages = true;
    const body = document.getElementById('message-body');

    try {
        const url = oldestLoadedRequestId === null
            ? `/api/chat/history?target_id=${currentChatUserId}`
            : `/api/chat/history?target_id=${currentChatUserId}&before=${oldestLoadedRequestId}`;
        const messages = await apiRequest(url, 'GET');

        if (!messages || messages.length === 0) {
            hasMoreMessages = false;
            if (currentChatMessages.size === 0) {
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

        messages.forEach(storeChatMessage);
        updateOldestLoadedRequestId();
        renderCurrentChat();

        if (messages.length < 10) {
            hasMoreMessages = false; // API returned less than requested limit (10)
        }

    } catch (error) {
        console.error('Error loading messages:', error);
    } finally {
        isLoadingMessages = false;
    }
}

function appendMessageToChat(msg, shouldScroll = false) {
    storeChatMessage(msg);
    updateOldestLoadedRequestId();
    renderCurrentChat();

    if (shouldScroll) {
        scrollToBottom();
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
            appendMessageToChat(msg.payload, true);
            loadMessagesList();
        }
    } catch (error) {
        showNotification(error.message, 'error');
        input.value = content;
        updateChatStatus('Disconnected');
    }
}

// Allow Enter key and track typing
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

            const now = Date.now();
            if (!isTyping || (now - lastTypingSentAt) >= TYPING_PING_INTERVAL_MS) {
                isTyping = true;
                lastTypingSentAt = now;
                ws.send(JSON.stringify({ type: 'typing', payload: { receiver_id: currentChatUserId } }));
            }

            clearTimeout(typingTimeoutLocal);
            typingTimeoutLocal = setTimeout(() => {
                stopTyping();
            }, TYPING_IDLE_TIMEOUT_MS);
        });

        input.addEventListener('blur', () => {
            stopTyping();
        });

        input.disabled = true; // Disable until a chat is opened
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopTyping();
        }
    });

    window.addEventListener('pagehide', () => {
        stopTyping();
    });
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
        clearTypingForUser(currentChatUserId);
        if (currentChatUserId) updateChatStatus('Connected');
        if (isMessagesPopupOpen()) {
            loadMessagesList();
        }
    }, REMOTE_TYPING_TIMEOUT_MS);
}

function hideTypingIndicator() {
    document.getElementById('typing-indicator')?.remove();
}

function stopTyping() {
    clearTimeout(typingTimeoutLocal);
    if (!isTyping) return;

    isTyping = false;
    lastTypingSentAt = 0;
    if (currentChatUserId && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'stop_typing',
            payload: { receiver_id: currentChatUserId }
        }));
    }
}

function resetLocalTypingState() {
    clearTimeout(typingTimeoutLocal);
    isTyping = false;
    lastTypingSentAt = 0;
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
    resetLocalTypingState();
    clearAllTypingUsers();
    hideTypingIndicator();
    if (ws) {
        ws.close(1000, 'client closing');
        ws = null;
    }
};
window.sendMessage = sendMessage;
window.loadMessagesList = loadMessagesList;
window.openChat = openChat;
window.toggleMessagesPopup = toggleMessagesPopup;
