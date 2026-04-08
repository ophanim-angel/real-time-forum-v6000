// ==================== APP STATE ====================

// Current logged-in user
let currentUser = null;
const APP_PATHS = new Set(['/', '/login', '/register']);
const AUTH_STORAGE_KEYS = new Set(['user_data', 'csrf_token']);

// ==================== INITIALIZATION ====================

// Run when page loads
document.addEventListener('DOMContentLoaded', () => {
    setupGlobalEventListeners();
    checkAuth();
});

// ==================== AUTH CHECK ====================

// Check if user is logged in by asking the server for the current session.
async function checkAuth() {
    const session = await fetchCurrentSession();

    if (session) {
        setCurrentUser(session.user);
        setCSRFToken(session.csrfToken);
    } else {
        clearSession({ updateStorage: true, notify: false });
    }

    routeFromLocation({ replaceHistory: true });

    if (session && isKnownAppPath() && window.initWebSocket) {
        initWebSocket();
    }
}

// ==================== ROUTER (Show/Hide Views) ====================

// Show specific view, hide others
function getAuthModeFromPath(pathname = window.location.pathname) {
    if (pathname === '/register') {
        return 'register';
    }
    return 'login';
}

function isKnownAppPath(pathname = window.location.pathname) {
    return APP_PATHS.has(pathname);
}

function navigateToPath(path, options = {}) {
    const { replaceHistory = false } = options;

    if (window.location.pathname === path) {
        return;
    }

    const historyMethod = replaceHistory ? 'replaceState' : 'pushState';
    window.history[historyMethod]({}, '', path);
}

function updateHistoryForView(viewName, options = {}) {
    const { replaceHistory = false, updateHistory = true } = options;
    let nextPath = '/';

    if (!updateHistory) {
        return;
    }

    if (viewName === 'auth') {
        nextPath = getAuthModeFromPath() === 'register' ? '/register' : '/login';
    }

    navigateToPath(nextPath, { replaceHistory });
}

function syncAuthFormWithPath() {
    if (!window.showLogin || !window.showRegister) {
        return;
    }

    if (getAuthModeFromPath() === 'register') {
        window.showRegister(false);
    } else {
        window.showLogin(false);
    }
}

function routeFromLocation() {
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

function showView(viewName, options = {}) {
    const {
        statusCode = 404,
        title = 'Page Not Found',
        message = 'The page you requested does not exist in this app.',
        pathname = window.location.pathname
    } = options;

    // Hide all views
    document.getElementById('view-auth').classList.add('hidden');
    document.getElementById('view-not-found').classList.add('hidden');
    document.getElementById('view-feed').classList.add('hidden');

    // Show requested view
    const view = document.getElementById(`view-${viewName}`);
    if (view) {
        view.classList.remove('hidden');

        if (viewName === 'auth') {
            syncAuthFormWithPath();
        }

        if (viewName === 'not-found') {
            const statusCodeEl = document.getElementById('not-found-status-code');
            const titleEl = document.getElementById('not-found-title');
            const messageEl = document.getElementById('not-found-message');
            const pathEl = document.getElementById('not-found-path');

            if (statusCodeEl) statusCodeEl.textContent = String(statusCode);
            if (titleEl) titleEl.textContent = title;
            if (messageEl) messageEl.textContent = message;
            if (pathEl) pathEl.textContent = pathname;
        }

        // Load posts when feed view is shown
        if (viewName === 'feed') {
            loadPosts();
        }

        if (viewName === 'feed' && window.toggleMessagesPopup) {
            window.toggleMessagesPopup(false);
        }
    }

    updateHistoryForView(viewName, options);

    // Update navigation bar
    const navAuth = document.getElementById('nav-auth');
    if (viewName === 'auth' || viewName === 'not-found') {
        navAuth.classList.add('hidden');
        if (window.toggleMessagesPopup) {
            window.toggleMessagesPopup(false);
        }
        if (window.toggleCreatePost) {
            window.toggleCreatePost(false);
        }
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

        if (viewName !== 'feed' && window.toggleCreatePost) {
            window.toggleCreatePost(false);
        }
    }
}

// ==================== NOTIFICATIONS ====================

// Show notification toast
function showNotification(message, type = 'success') {
    if (!message) {
        return;
    }

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

    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ==================== API HELPER ====================

// Make API requests using the current session cookie.
async function apiRequest(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
        }
    };

    const csrfToken = getCSRFToken();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()) && csrfToken) {
        options.headers['X-CSRF-Token'] = csrfToken;
    }

    // Add request body if data provided
    if (data) {
        options.body = JSON.stringify(data);
    }

    const response = await fetch(endpoint, options);

    // Check content type before parsing
    const contentType = response.headers.get('content-type');

    let result = null;
    let fallbackMessage = '';
    if (contentType && contentType.includes('application/json')) {
        result = await response.json();
    } else {
        fallbackMessage = await response.text();
    }

    // Handle errors
    if (!response.ok) {
        const message = formatApiErrorMessage(
            response.status,
            response.statusText,
            result?.message || fallbackMessage
        );

        // If 401, session might be expired or revoked.
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

// ==================== UTILITY FUNCTIONS ====================

// Escape HTML to prevent XSS attacks
function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Format date to "time ago" (e.g., "5m ago", "dd/mm/yyyy, hh:mm")
function getTimeAgo(dateString) {
    if (!dateString) return 'Unknown';

    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds >= 300) {
        return date.toLocaleString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    }

    if (seconds < 60) return 'Just now';
    return `${Math.floor(seconds / 60)}m ago`;
}

// Format number with K/M suffix (e.g., 1200 → 1.2K)
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

// ==================== GLOBAL EVENT LISTENERS ====================

function setupGlobalEventListeners() {
    // Close notifications on click
    document.addEventListener('click', (e) => {
        if (e.target.closest('.notification')) {
            e.target.closest('.notification').remove();
        }
    });

    window.addEventListener('popstate', () => {
        routeFromLocation();
    });

    window.addEventListener('storage', (event) => {
        if (!AUTH_STORAGE_KEYS.has(event.key)) {
            return;
        }

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
        window.currentUser = session.user;

        if (window.location.pathname === '/login' || window.location.pathname === '/register') {
            showView('feed', { replaceHistory: true });
        }

        if (window.initWebSocket) {
            window.initWebSocket();
        }
    });

}

// ==================== EXPORT FOR OTHER FILES ====================

// Make functions available globally for other JS files
window.showView = showView;
window.showNotification = showNotification;
window.apiRequest = apiRequest;
window.escapeHTML = escapeHTML;
window.getTimeAgo = getTimeAgo;
window.formatNumber = formatNumber;
window.currentUser = currentUser;
window.navigateToPath = navigateToPath;
window.goHome = () => {
    navigateToPath('/', { replaceHistory: true });
    routeFromLocation();
};

// Update currentUser when auth changes
function setCurrentUser(user) {
    currentUser = user;
    window.currentUser = user; // Ensure global sync
    if (user) {
        localStorage.setItem('user_data', JSON.stringify(user));
    } else {
        localStorage.removeItem('user_data');
    }
}
window.setCurrentUser = setCurrentUser;

function setCSRFToken(token) {
    if (token) {
        localStorage.setItem('csrf_token', token);
    } else {
        localStorage.removeItem('csrf_token');
    }
}
window.setCSRFToken = setCSRFToken;

function getCSRFToken() {
    return localStorage.getItem('csrf_token') || '';
}

function getStoredSession() {
    const user = localStorage.getItem('user_data');
    const csrfToken = localStorage.getItem('csrf_token');

    if (!user || !csrfToken) {
        return null;
    }

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
                'Content-Type': 'application/json',
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

function clearSession(options = {}) {
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
    window.currentUser = null;

    if (window.closeWebSocket) {
        window.closeWebSocket();
    }

    showView('auth', { replaceHistory });

    if (notify && hadSession) {
        showNotification(notificationMessage, 'success');
    }
}

window.clearSession = clearSession;
