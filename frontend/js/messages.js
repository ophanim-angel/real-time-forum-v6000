// ==================== MESSAGES & CHAT LOGIC ====================

let ws = null;
let currentChatUserId = null;
let currentChatUserNickname = '';
let chatOffset = 0;
let isLoadingMessages = false;
let hasMoreMessages = true;

// Initialize WebSocket
function initWebSocket() {
    if (ws) {
        ws.close();
    }

    if (!window.currentUser) return;

    const token = localStorage.getItem('jwt_token');
    if (!token) return;

    // Connect to WebSocket using current host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket connected');
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

    ws.onclose = () => {
        console.log('WebSocket disconnected. Reconnecting in 3s...');
        setTimeout(initWebSocket, 3000);
    };

    ws.onerror = (err) => {
        console.error('WebSocket Error:', err);
    };
}

// Handle incoming WS events
function handleWebSocketEvent(event) {
    console.log('WS Event received:', event.type, event);

    if (event.type === 'user_status') {
        const userId = event.user_id;
        const isOnline = event.is_online;
        const view = document.getElementById('view-messages');
        if (view && !view.classList.contains('hidden')) {
            loadMessagesList();
        }
    } else if (event.type === 'new_message') {
        const msg = event.payload;
        const myId = window.currentUser ? window.currentUser.user_id : null;
        const activeChatId = currentChatUserId;

        console.log('New message for processing:', {
            msg_sender: msg.sender_id,
            msg_receiver: msg.receiver_id,
            my_id: myId,
            active_chat_id: activeChatId
        });

        // If message belongs to current active chat, append it
        const isRelevant = (msg.sender_id === myId && msg.receiver_id === activeChatId) ||
            (msg.sender_id === activeChatId && msg.receiver_id === myId);

        if (isRelevant) {
            console.log('Appending message to active chat');
            appendMessageToChat(msg, false);
            scrollToBottom();
        } else {
            console.log('Message is for background or from other user');
            // ... (rest of the logic remains same but using explicit window scoped vars if needed)
            if (msg.sender_id !== myId) {
                const userEl = document.querySelector(`.message-user[data-userid="${msg.sender_id}"]`);
                if (userEl) {
                    let badge = userEl.querySelector('.unread-badge');
                    if (!badge) {
                        badge = document.createElement('span');
                        badge.className = 'unread-badge';
                        badge.textContent = '1';
                        badge.style = 'background: var(--error); color: white; padding: 2px 6px; border-radius: 10px; font-size: 0.6rem; font-weight: bold; margin-left: auto;';
                        userEl.appendChild(badge);
                    } else {
                        badge.textContent = parseInt(badge.textContent) + 1;
                    }
                } else {
                    showNotification('New message received!', 'success');
                }

                if (document.getElementById('view-messages').classList.contains('hidden')) {
                    const navIcon = document.getElementById('nav-msg-icon');
                    if (navIcon) {
                        navIcon.style.position = 'relative';
                        let globalBadge = document.getElementById('nav-global-badge');
                        if (!globalBadge) {
                            globalBadge = document.createElement('span');
                            globalBadge.id = 'nav-global-badge';
                            globalBadge.style = 'position: absolute; top: -5px; right: -5px; background: var(--error); width: 10px; height: 10px; border-radius: 50%;';
                            navIcon.appendChild(globalBadge);
                        }
                    }
                }

                if (!document.getElementById('view-messages').classList.contains('hidden')) {
                    const snippet = userEl?.querySelector('.msg-snippet');
                    if (snippet) snippet.textContent = msg.content.substring(0, 25) + '...';
                }
            }
        }
    } else if (event.type === 'typing') {
        const senderId = event.payload.sender_id;
        if (senderId === currentChatUserId) {
            showTypingIndicator();
        }
    }
}

// Load users for the sidebar
async function loadMessagesList() {
    const listContainer = document.getElementById('messages-list');

    try {
        const users = await apiRequest('/api/chat/users', 'GET');

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

            const statusClass = user.is_online ? 'status-online' : 'status-offline';
            const initial = user.nickname.charAt(0).toUpperCase();

            let lastMsgText = user.last_msg || 'Start a conversation';
            if (lastMsgText.length > 25) lastMsgText = lastMsgText.substring(0, 25) + '...';

            // Keep existing unread badge if we reload
            const existingBadge = document.querySelector(`.message-user[data-userid="${user.id}"] .unread-badge`);
            const badgeHtml = existingBadge ? existingBadge.outerHTML : '';

            userEl.innerHTML = `
                <div class="post-avatar" style="width: 32px; height: 32px; font-size: 0.75rem;">${initial}</div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 800; font-size: 0.75rem;">${escapeHTML(user.nickname)}</div>
                    <div class="msg-snippet" style="font-size: 0.625rem; color: ${currentChatUserId === user.id ? 'var(--bg)' : 'var(--text-muted)'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${escapeHTML(lastMsgText)}
                    </div>
                </div>
                ${badgeHtml}
                <div class="message-user-status ${statusClass}" style="margin-left: ${badgeHtml ? '8px' : 'auto'};"></div>
            `;

            listContainer.appendChild(userEl);
        });

    } catch (error) {
        console.error('Error loading users:', error);
    }
}

// Open chat with a user
async function openChat(userId, nickname) {
    currentChatUserId = userId;
    currentChatUserNickname = nickname;
    chatOffset = 0;
    hasMoreMessages = true;

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

    document.getElementById('chat-status').textContent = 'Connected';
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

    try {
        const msg = await apiRequest('/api/chat/send', 'POST', payload);

        // Append it immediately to our own chat body
        if (msg && msg.payload) {
            appendMessageToChat(msg.payload, false);
            scrollToBottom();

            // Also refresh sidebar to show newest message text
            loadMessagesList();
        }
    } catch (error) {
        showNotification(error.message, 'error');
        // Put text back if failed
        input.value = content;
    }
}

// Allow Enter key and track typing
let isTyping = false;
let typingTimeoutLocal = null;

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('message-input');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });

        input.addEventListener('input', () => {
            if (!currentChatUserId || !ws || ws.readyState !== WebSocket.OPEN) return;

            if (!isTyping) {
                isTyping = true;
                ws.send(JSON.stringify({ type: 'typing', payload: { receiver_id: currentChatUserId } }));
            }

            clearTimeout(typingTimeoutLocal);
            typingTimeoutLocal = setTimeout(() => {
                isTyping = false;
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
        if (indicator) indicator.remove();
    }, 2500);
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
    if (ws) {
        ws.close();
        ws = null;
    }
};
window.sendMessage = sendMessage;
