import { escapeHTML } from './utils.js';

let currentUser = null;

const APP_PATHS = new Set(['/', '/login', '/register']);
const AUTH_STORAGE_KEYS = new Set(['user_data', 'csrf_token']);

const appDeps = {
    closeWebSocket: null,
    initWebSocket: null,
    loadPosts: null,
    showLogin: null,
    showRegister: null,
    toggleCreatePost: null,
    toggleMessagesPopup: null
};

export function initApp(dependencies = {}) {
    Object.assign(appDeps, dependencies);
    setupGlobalEventListeners();
    checkAuth();
}

export function getCurrentUser() {
    return currentUser;
}

export function setCurrentUser(user) {
    currentUser = user;
    if (user) {
        localStorage.setItem('user_data', JSON.stringify(user));
    } else {
        localStorage.removeItem('user_data');
    }
}

export function setCSRFToken(token) {
    if (token) {
        localStorage.setItem('csrf_token', token);
    } else {
        localStorage.removeItem('csrf_token');
    }
}

export function getCSRFToken() {
    return localStorage.getItem('csrf_token') || '';
}

export function showNotification(message, type = 'success') {
    if (!message) return;

    const container = document.getElementById('notifications');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <span class="material-symbols-outlined notification-icon">
            ${type === 'success' ? 'check_circle' : 'error'}
        </span>
        <span class="notification-message">${escapeHTML(message)}</span>
    `;
    container.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

export async function apiRequest(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json'
        }
    };

    const csrfToken = getCSRFToken();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()) && csrfToken) {
        options.headers['X-CSRF-Token'] = csrfToken;
    }

    if (data) {
        options.body = JSON.stringify(data);
    }

    const response = await fetch(endpoint, options);
    const contentType = response.headers.get('content-type');

    let result = null;
    let fallbackMessage = '';
    if (contentType && contentType.includes('application/json')) {
        result = await response.json();
    } else {
        fallbackMessage = await response.text();
    }

    if (!response.ok) {
        const message = formatApiErrorMessage(
            response.status,
            response.statusText,
            result?.message || fallbackMessage
        );

        if (response.status === 401) {
            clearSession({
                updateStorage: true,
                notify: true,
                notificationMessage: 'Your session expired. Please log in again.'
            });
            throw new Error('');
        }

        throw new Error(message);
    }

    return result;
}

export function navigateToPath(path, options = {}) {
    const { replaceHistory = false } = options;
    if (window.location.pathname === path) return;

    const historyMethod = replaceHistory ? 'replaceState' : 'pushState';
    window.history[historyMethod]({}, '', path);
}

export function goHome() {
    navigateToPath('/', { replaceHistory: true });
    routeFromLocation();
}

export function showView(viewName, options = {}) {
    const {
        statusCode = 404,
        title = 'Page Not Found',
        message = 'The page you requested does not exist in this app.',
        pathname = window.location.pathname
    } = options;

    document.getElementById('view-auth').classList.add('hidden');
    document.getElementById('view-not-found').classList.add('hidden');
    document.getElementById('view-feed').classList.add('hidden');

    const view = document.getElementById(`view-${viewName}`);
    if (view) {
        view.classList.remove('hidden');

        if (viewName === 'auth') {
            syncAuthFormWithPath();
        }

        if (viewName === 'not-found') {
            document.getElementById('not-found-status-code').textContent = String(statusCode);
            document.getElementById('not-found-title').textContent = title;
            document.getElementById('not-found-message').textContent = message;
            document.getElementById('not-found-path').textContent = pathname;
        }

        if (viewName === 'feed') {
            appDeps.loadPosts?.();
            appDeps.toggleMessagesPopup?.(false);
        }
    }

    updateHistoryForView(viewName, options);

    const navAuth = document.getElementById('nav-auth');
    if (viewName === 'auth' || viewName === 'not-found') {
        navAuth.classList.add('hidden');
        appDeps.toggleMessagesPopup?.(false);
        appDeps.toggleCreatePost?.(false);
        document.getElementById('notifications').innerHTML = '';

        if (viewName === 'not-found') {
            document.title = `${statusCode} | ${title}`;
        } else if (getAuthModeFromPath() === 'register') {
            document.title = 'AGORA | Register';
        } else {
            document.title = 'AGORA | Login';
        }
    } else {
        navAuth.classList.remove('hidden');
        document.title = 'AGORA | Real-Time Forum';

        if (currentUser) {
            document.getElementById('nav-username').textContent = `@${currentUser.nickname}`;
        }

        const navCreateBtn = document.getElementById('nav-create-btn');
        if (navCreateBtn) {
            navCreateBtn.classList.toggle('hidden', viewName !== 'feed');
            if (viewName !== 'feed') {
                navCreateBtn.classList.remove('active');
            }
        }

        if (viewName !== 'feed') {
            appDeps.toggleCreatePost?.(false);
        }
    }
}

export function clearSession(options = {}) {
    const {
        updateStorage = false,
        notify = false,
        notificationMessage = 'Logged out successfully',
        replaceHistory = true
    } = options;

    const hadSession = Boolean(
        currentUser ||
        localStorage.getItem('user_data') ||
        localStorage.getItem('csrf_token')
    );

    if (updateStorage) {
        localStorage.removeItem('user_data');
        localStorage.removeItem('csrf_token');
    }

    currentUser = null;
    appDeps.closeWebSocket?.();
    showView('auth', { replaceHistory });

    if (notify && hadSession) {
        showNotification(notificationMessage, 'success');
    }
}

export function routeFromLocation() {
    const session = getStoredSession();
    const pathname = window.location.pathname;

    if (!isKnownAppPath(pathname)) {
        showView('not-found', {
            updateHistory: false,
            statusCode: 404,
            title: 'Page Not Found',
            message: 'The page you requested does not exist in this app.',
            pathname
        });
        return;
    }

    if (session) {
        showView('feed', {
            updateHistory: pathname !== '/',
            replaceHistory: true
        });
        return;
    }

    if (pathname === '/') {
        showView('auth', { updateHistory: false, replaceHistory: true });
        return;
    }

    showView('auth', { updateHistory: false });
}

async function checkAuth() {
    const session = await fetchCurrentSession();

    if (session) {
        setCurrentUser(session.user);
        setCSRFToken(session.csrfToken);
    } else {
        clearSession({ updateStorage: true, notify: false });
    }

    routeFromLocation();

    if (session && isKnownAppPath()) {
        appDeps.initWebSocket?.();
    }
}

function getAuthModeFromPath(pathname = window.location.pathname) {
    return pathname === '/register' ? 'register' : 'login';
}

function isKnownAppPath(pathname = window.location.pathname) {
    return APP_PATHS.has(pathname);
}

function updateHistoryForView(viewName, options = {}) {
    const { replaceHistory = false, updateHistory = true } = options;
    if (!updateHistory) return;

    let nextPath = '/';
    if (viewName === 'auth') {
        nextPath = getAuthModeFromPath() === 'register' ? '/register' : '/login';
    }

    navigateToPath(nextPath, { replaceHistory });
}

function syncAuthFormWithPath() {
    if (getAuthModeFromPath() === 'register') {
        appDeps.showRegister?.(false);
    } else {
        appDeps.showLogin?.(false);
    }
}

function setupGlobalEventListeners() {
    document.addEventListener('click', (event) => {
        const notification = event.target.closest('.notification');
        if (notification) {
            notification.remove();
        }
    });

    window.addEventListener('popstate', () => {
        routeFromLocation();
    });

    window.addEventListener('storage', (event) => {
        if (!AUTH_STORAGE_KEYS.has(event.key)) return;

        const session = getStoredSession();
        if (!session) {
            clearSession({
                updateStorage: false,
                notify: true,
                notificationMessage: 'You were logged out in another tab.'
            });
            return;
        }

        currentUser = session.user;

        if (window.location.pathname === '/login' || window.location.pathname === '/register') {
            showView('feed', { replaceHistory: true });
        }

        appDeps.initWebSocket?.();
    });
}

function getStoredSession() {
    const user = localStorage.getItem('user_data');
    const csrfToken = localStorage.getItem('csrf_token');

    if (!user || !csrfToken) return null;

    try {
        return {
            user: JSON.parse(user),
            csrfToken
        };
    } catch (error) {
        console.error('Error parsing user data:', error);
        return null;
    }
}

async function fetchCurrentSession() {
    try {
        const response = await fetch('/api/session', {
            method: 'GET',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            return null;
        }

        const result = await response.json();
        return {
            user: {
                user_id: result.user_id,
                nickname: result.nickname
            },
            csrfToken: result.csrf_token
        };
    } catch (error) {
        console.error('Error loading session:', error);
        return null;
    }
}

function formatApiErrorMessage(statusCode, statusText, rawMessage) {
    const normalizedMessage = (rawMessage || '').trim();
    const safeStatusText = (statusText || 'Request Failed').trim();
    const baseMessage = `${statusCode} ${safeStatusText}`;

    if (!normalizedMessage || normalizedMessage.toLowerCase() === safeStatusText.toLowerCase()) {
        return baseMessage;
    }

    return `${baseMessage}: ${normalizedMessage}`;
}
