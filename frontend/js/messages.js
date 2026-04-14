import { apiRequest, clearSession, getCurrentUser, showNotification } from './app.js';
import { debounce, escapeHTML } from './utils.js';

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
let removeTypingTimeout = null;

const TYPING_PING_INTERVAL_MS = 1500;
const TYPING_IDLE_TIMEOUT_MS = 3000;
const REMOTE_TYPING_TIMEOUT_MS = 4500;

function compareUsersForSidebar(a, b) {
    const aHasLastMessage = Boolean(a?.last_msg_time);
    const bHasLastMessage = Boolean(b?.last_msg_time);

    if (aHasLastMessage !== bHasLastMessage) {
        return aHasLastMessage ? -1 : 1;
    }

    if (aHasLastMessage && bHasLastMessage) {
        const timeDiff = new Date(b.last_msg_time).getTime() - new Date(a.last_msg_time).getTime();
        if (timeDiff !== 0) return timeDiff;
    }

    return String(a?.nickname || '').localeCompare(String(b?.nickname || ''));
}

function getMessagesListContainer() {
    return document.getElementById('messages-list');
}

function getEmptyMessagesListMarkup() {
    return '<p class="text-center" style="font-size: 0.75rem; color: var(--text-muted); padding: 1rem;">No users found</p>';
}

function clearMessagesListPlaceholder() {
    const listContainer = getMessagesListContainer();
    if (!listContainer) return;

    const onlyChild = listContainer.children.length === 1 ? listContainer.firstElementChild : null;
    if (onlyChild && onlyChild.tagName === 'P') {
        listContainer.innerHTML = '';
    }
}

function getUserListSnippet(userId, fallbackText) {
    const typingUpdatedAt = typingUsers.get(userId);
    const isTypingNow = Boolean(typingUpdatedAt) && (Date.now() - typingUpdatedAt) < REMOTE_TYPING_TIMEOUT_MS;

    if (!isTypingNow) {
        typingUsers.delete(userId);
    }

    if (isTypingNow) {
        return { text: 'Typing...', isTyping: true };
    }

    let lastMsgText = fallbackText || 'Start a conversation';
    if (lastMsgText.length > 25) lastMsgText = `${lastMsgText.substring(0, 25)}...`;

    return { text: lastMsgText, isTyping: false };
}

function createMessageUserElement(user) {
    const userEl = document.createElement('div');
    userEl.className = `message-user ${currentChatUserId === user.id ? 'active' : ''}`;
    userEl.dataset.userid = user.id;
    userEl.addEventListener('click', () => openChat(user.id, user.nickname));

    const initial = user.nickname.charAt(0).toUpperCase();
    const snippet = getUserListSnippet(user.id, user.last_msg);

    if (snippet.isTyping) {
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
                ${escapeHTML(snippet.text)}
            </div>
        </div>
    `;

    return userEl;
}

function getCachedUser(userId) {
    return usersCache.find((user) => user.id === userId) || null;
}

function upsertUserCache(user) {
    if (!user || !user.id) return null;

    const normalizedUser = {
        id: user.id,
        nickname: user.nickname || '',
        last_msg_time: user.last_msg_time || '',
        last_msg: user.last_msg || '',
        is_online: Boolean(user.is_online)
    };

    const existingIndex = usersCache.findIndex((entry) => entry.id === normalizedUser.id);
    if (existingIndex >= 0) {
        usersCache[existingIndex] = { ...usersCache[existingIndex], ...normalizedUser };
    } else {
        usersCache.push(normalizedUser);
    }

    usersCache.sort(compareUsersForSidebar);
    return getCachedUser(normalizedUser.id);
}

function renderMessagesListFromCache() {
    const listContainer = getMessagesListContainer();
    if (!listContainer) return;

    if (usersCache.length === 0) {
        listContainer.innerHTML = getEmptyMessagesListMarkup();
        return;
    }

    listContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();
    usersCache.forEach((user) => fragment.appendChild(createMessageUserElement(user)));
    listContainer.appendChild(fragment);
}

function upsertMessageUserElement(user) {
    const listContainer = getMessagesListContainer();
    const cachedUser = upsertUserCache(user);
    if (!cachedUser || !listContainer || !isMessagesPopupOpen()) return;

    clearMessagesListPlaceholder();

    const existingEl = listContainer.querySelector(`.message-user[data-userid="${cachedUser.id}"]`);
    const unreadBadge = existingEl?.querySelector('.unread-badge');
    const nextEl = createMessageUserElement(cachedUser);

    if (unreadBadge) {
        nextEl.appendChild(unreadBadge);
    }

    if (existingEl) {
        existingEl.replaceWith(nextEl);
    } else {
        listContainer.appendChild(nextEl);
    }

    Array.from(listContainer.querySelectorAll('.message-user'))
        .sort((a, b) => compareUsersForSidebar(getCachedUser(a.dataset.userid), getCachedUser(b.dataset.userid)))
        .forEach((node) => listContainer.appendChild(node));
}

function updateSidebarSnippet(userId) {
    const userEl = document.querySelector(`.message-user[data-userid="${userId}"]`);
    const user = getCachedUser(userId);
    if (!userEl || !user) return;

    const snippetEl = userEl.querySelector('.msg-snippet');
    const snippet = getUserListSnippet(userId, user.last_msg);

    userEl.classList.toggle('typing', snippet.isTyping);
    if (snippetEl) {
        snippetEl.textContent = snippet.text;
    }
}

function updateConversationPreview(message) {
    const myId = getCurrentUser()?.user_id;
    if (!myId || !message) return;

    const otherUserId = message.sender_id === myId ? message.receiver_id : message.sender_id;
    const existingUser = getCachedUser(otherUserId);
    if (!existingUser) {
        loadMessagesList();
        return;
    }

    upsertMessageUserElement({
        ...existingUser,
        last_msg: message.content,
        last_msg_time: message.created_at
    });
}

function handleWebSocketEvent(event) {
    if (event.type === 'new_message') {
        const msg = event.payload;
        clearTypingForUser(msg.sender_id);
        const myId = getCurrentUser()?.user_id;
        const activeChatId = currentChatUserId;
        const isChatVisible = isMessagesPopupOpen() && activeChatId !== null;

        const isRelevant = isChatVisible && (
            (msg.sender_id === myId && msg.receiver_id === activeChatId) ||
            (msg.sender_id === activeChatId && msg.receiver_id === myId)
        );

        if (isRelevant) {
            appendMessageToChat(msg, true);
            updateChatStatus('Connected');
        } else if (msg.sender_id !== myId) {
            incrementUnreadBadge(msg.sender_id);
            showNotification('New message received', 'success');
            showIncomingMessageToast(msg);
        }

        updateConversationPreview(msg);
        return;
    }

    if (event.type === 'typing') {
        const senderId = event.payload.sender_id;
        typingUsers.set(senderId, Date.now());
        updateSidebarSnippet(senderId);
        if (senderId === currentChatUserId) {
            showTypingIndicator();
            updateChatStatus('Typing...');
        }
        return;
    }

    if (event.type === 'stop_typing') {
        const senderId = event.payload.sender_id;
        clearTypingForUser(senderId);
        updateSidebarSnippet(senderId);
        if (senderId === currentChatUserId) {
            hideTypingIndicator();
            updateChatStatus('Connected');
        }
        return;
    }

    if (event.type === 'presence_update') {
        setUserOnlineStatus(event.payload.user_id, event.payload.is_online);
        if (!event.payload.is_online) {
            clearTypingForUser(event.payload.user_id);
            updateSidebarSnippet(event.payload.user_id);
            if (event.payload.user_id === currentChatUserId) {
                hideTypingIndicator();
                updateChatStatus('Connected');
            }
        }
        return;
    }

    if (event.type === 'user_registered') {
        const registeredUser = event.payload;
        const myId = getCurrentUser()?.user_id;
        if (!registeredUser || registeredUser.id === myId) return;
        upsertMessageUserElement(registeredUser);
        return;
    }

    if (event.type === 'session_revoked') {
        shouldReconnect = false;
        clearSession({
            updateStorage: true,
            notify: true,
            notificationMessage: event.payload?.message || 'Your session was replaced by a new login.'
        });
        return;
    }

    if (event.type === 'rate_limit') {
        showNotification(event.payload?.message || 'Too many requests. Please slow down.', 'error');
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

    const sender = usersCache.find((user) => user.id === message.sender_id);
    const toast = document.createElement('button');
    toast.type = 'button';
    toast.className = 'chat-toast';
    toast.innerHTML = `
        <div class="chat-toast-title">${escapeHTML(sender?.nickname || 'New message')}</div>
        <div class="chat-toast-text">${escapeHTML(message.content)}</div>
    `;
    toast.addEventListener('click', () => {
        toggleMessagesPopup(true);
        if (sender) {
            openChat(sender.id, sender.nickname);
        }
        toast.remove();
    });

    stack.prepend(toast);
    setTimeout(() => toast.remove(), 5000);
}

function setUserOnlineStatus(userId, isOnline) {
    if (!userId) return;

    const cachedUser = usersCache.find((user) => user.id === userId);
    if (cachedUser) {
        cachedUser.is_online = Boolean(isOnline);
    }

    const statusDot = document.querySelector(`.message-user[data-userid="${userId}"] .user-status-dot`);
    if (statusDot) {
        statusDot.classList.toggle('online', Boolean(isOnline));
        statusDot.classList.toggle('offline', !isOnline);
        statusDot.title = isOnline ? 'Online' : 'Offline';
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
    usersCache = usersCache.map((user) => ({ ...user, is_online: false }));
    document.querySelectorAll('.user-status-dot').forEach((dot) => {
        dot.classList.remove('online');
        dot.classList.add('offline');
    });
}

export async function loadMessagesList() {
    try {
        const users = await apiRequest('/api/chat/users', 'GET');
        usersCache = users || [];
        usersCache.sort(compareUsersForSidebar);
        renderMessagesListFromCache();
    } catch (error) {
        console.error('Error loading users:', error);
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

    document.getElementById('typing-indicator')?.remove();
    body.innerHTML = '';

    const myId = getCurrentUser()?.user_id;
    const messages = getSortedCurrentChatMessages();

    messages.forEach((msg) => {
        const isMine = msg.sender_id === myId;
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
        timeInfo.textContent = `${isMine ? 'YOU' : escapeHTML(currentChatUserNickname)} • ${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

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
                body.innerHTML = `
                    <div class="text-center" style="padding: 3rem; color: var(--text-muted);">
                        <span class="material-symbols-outlined" style="font-size: 3rem; opacity: 0.3;">waving_hand</span>
                        <p style="margin-top: 1rem; font-weight: 700; text-transform: uppercase;">Say hi to ${escapeHTML(currentChatUserNickname)}!</p>
                    </div>
                `;
            } else {
                const endEl = document.createElement('div');
                endEl.className = 'text-center';
                endEl.style = 'padding: 1rem; color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; font-weight: 700;';
                endEl.textContent = 'Start of conversation';
                body.prepend(endEl);
            }
            updateChatStatus('Connected');
            return;
        }

        messages.forEach(storeChatMessage);
        updateOldestLoadedRequestId();
        renderCurrentChat();

        if (messages.length < 10) {
            hasMoreMessages = false;
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

export async function openChat(userId, nickname) {
    toggleMessagesPopup(true);
    stopTyping();
    currentChatUserId = userId;
    currentChatUserNickname = nickname;
    oldestLoadedRequestId = null;
    hasMoreMessages = true;
    currentChatMessages = new Map();
    typingUsers.delete(userId);

    const inputArea = document.querySelector('.message-input-area');
    if (inputArea) inputArea.style.display = 'flex';

    document.getElementById('chat-username').textContent = nickname;
    document.getElementById('chat-avatar').textContent = nickname.charAt(0).toUpperCase();
    document.getElementById('chat-status').textContent = 'Loading messages...';

    document.querySelectorAll('.message-user').forEach((userEl) => {
        if (userEl.dataset.userid === userId) {
            userEl.classList.add('active');
            userEl.querySelector('.unread-badge')?.remove();
        } else {
            userEl.classList.remove('active');
        }
    });

    const body = document.getElementById('message-body');
    body.innerHTML = '';

    const input = document.getElementById('message-input');
    input.disabled = false;
    input.focus();
    body.onscroll = debounce(handleScroll, 150);

    await loadMessages();
    scrollToBottom();
    updateChatStatus('Connected');
}

function handleScroll() {
    const body = document.getElementById('message-body');
    if (body.scrollTop === 0 && !isLoadingMessages && hasMoreMessages) {
        const oldHeight = body.scrollHeight;
        loadMessages().then(() => {
            body.scrollTop = body.scrollHeight - oldHeight;
        });
    }
}

export async function sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();
    if (!content || !currentChatUserId) return;

    if (content.length > 500) {
        showNotification('Message is too long! Maximum 500 characters allowed.', 'error');
        return;
    }

    input.value = '';
    stopTyping();

    try {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'send_message',
                payload: {
                    receiver_id: currentChatUserId,
                    content
                }
            }));
            updateChatStatus('Connected');
            return;
        }

        const msg = await apiRequest('/api/chat/send', 'POST', {
            receiver_id: currentChatUserId,
            content
        });
        if (msg?.payload) {
            appendMessageToChat(msg.payload, true);
            updateConversationPreview(msg.payload);
        }
    } catch (error) {
        showNotification(error.message, 'error');
        input.value = content;
        updateChatStatus('Disconnected');
    }
}

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
        if (currentChatUserId) {
            updateChatStatus('Connected');
            updateSidebarSnippet(currentChatUserId);
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

function scrollToBottom() {
    const body = document.getElementById('message-body');
    body.scrollTop = body.scrollHeight;
}

function isMessagesPopupOpen() {
    const popup = document.getElementById('chat-popup');
    return popup && !popup.classList.contains('hidden');
}

export function toggleMessagesPopup(forceState) {
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

export function initWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
    }

    if (!getCurrentUser()) return;

    shouldReconnect = true;
    clearTimeout(reconnectTimeoutId);

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
            event.data.split('\n').forEach((messageString) => {
                if (messageString.trim()) {
                    handleWebSocketEvent(JSON.parse(messageString));
                }
            });
        } catch (error) {
            console.error('Error parsing WS message:', error, 'Raw data:', event.data);
        }
    };

    ws.onclose = () => {
        ws = null;
        hideTypingIndicator();
        clearAllTypingUsers();
        resetLocalTypingState();
        markAllUsersOffline();

        if (currentChatUserId) {
            updateChatStatus('Disconnected');
        }

        if (!shouldReconnect || !getCurrentUser()) return;

        reconnectTimeoutId = setTimeout(() => {
            if (!ws) {
                initWebSocket();
            }
        }, 3000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket Error:', error);
    };
}

export function closeWebSocket() {
    shouldReconnect = false;
    clearTimeout(reconnectTimeoutId);
    resetLocalTypingState();
    clearAllTypingUsers();
    hideTypingIndicator();
    if (ws) {
        ws.close(1000, 'client closing');
        ws = null;
    }
}

export function initMessages() {
    document.getElementById('nav-msg-icon')?.addEventListener('click', () => {
        toggleMessagesPopup();
    });
    document.getElementById('chat-panel-close-btn')?.addEventListener('click', () => {
        toggleMessagesPopup(false);
    });
    document.getElementById('message-send-btn')?.addEventListener('click', sendMessage);

    const input = document.getElementById('message-input');
    if (input) {
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
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

        input.addEventListener('blur', stopTyping);
        input.disabled = true;
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopTyping();
        }
    });

    window.addEventListener('pagehide', stopTyping);
}
