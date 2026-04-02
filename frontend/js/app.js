// ==================== APP STATE ====================

// Current logged-in user
let currentUser = null;
const AUTH_PATHS = new Set(['/login', '/register']);
const AUTH_STORAGE_KEYS = new Set(['jwt_token', 'user_data']);

// ==================== INITIALIZATION ====================

// Run when page loads
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupGlobalEventListeners();
});

// ==================== AUTH CHECK ====================

// Check if user is logged in (token in localStorage)
function checkAuth() {
    const session = getStoredSession();

    if (session) {
        currentUser = session.user;
        window.currentUser = currentUser; // Ensure global sync
        showView('feed', { replaceHistory: true });
        if (window.initWebSocket) initWebSocket();
        return;
    }

    clearSession({ updateStorage: true, replaceHistory: true });
}

// ==================== ROUTER (Show/Hide Views) ====================

// Show specific view, hide others
function getAuthModeFromPath(pathname = window.location.pathname) {
    if (pathname === '/register') {
        return 'register';
    }
    return 'login';
}

function isAuthPath(pathname = window.location.pathname) {
    return AUTH_PATHS.has(pathname);
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
    const token = localStorage.getItem('jwt_token');
    const user = localStorage.getItem('user_data');

    if (token && user && !isAuthPath()) {
        showView('feed', { updateHistory: false });
        return;
    }

    showView('auth', { updateHistory: false });
}

function showView(viewName, options = {}) {
    // Hide all views
    document.getElementById('view-auth').classList.add('hidden');
    document.getElementById('view-feed').classList.add('hidden');
    document.getElementById('view-messages').classList.add('hidden');

    // Show requested view
    const view = document.getElementById(`view-${viewName}`);
    if (view) {
        view.classList.remove('hidden');

        if (viewName === 'auth') {
            syncAuthFormWithPath();
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
    if (viewName === 'auth') {
        navAuth.classList.add('hidden');
        if (window.toggleMessagesPopup) {
            window.toggleMessagesPopup(false);
        }
        if (window.toggleCreatePost) {
            window.toggleCreatePost(false);
        }
        document.getElementById('notifications').innerHTML = '';

        if (getAuthModeFromPath() === 'register') {
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

// Make API requests with JWT token
async function apiRequest(endpoint, method = 'GET', data = null) {
    const token = localStorage.getItem('jwt_token');
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        }
    };

    // Add JWT token if available
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }

    // Add request body if data provided
    if (data) {
        options.body = JSON.stringify(data);
    }

    const response = await fetch(endpoint, options);

    // Check content type before parsing
    const contentType = response.headers.get('content-type');

    let result;
    if (contentType && contentType.includes('application/json')) {
        result = await response.json();
    } else {
        const text = await response.text();
        throw new Error(text || 'Request failed');
    }

    // Handle errors
    if (!response.ok) {
        // If 401, token might be expired - log out user
        if (response.status === 401) {
            clearSession({
                updateStorage: true,
                notify: true,
                notificationMessage: 'Your session expired. Please log in again.'
            });
        }
        throw new Error(result.message || 'Request failed');
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

// Format date to "time ago" (e.g., "5m ago", "2h ago")
function getTimeAgo(dateString) {
    if (!dateString) return 'Unknown';

    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return `${Math.floor(seconds / 604800)}w ago`;
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

    // Auto-hide notifications after timeout
    setInterval(() => {
        const notifications = document.querySelectorAll('.notification');
        notifications.forEach(notif => {
            const age = Date.now() - notif.dataset.created;
            if (age > 3000) {
                notif.remove();
            }
        });
    }, 1000);
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

function getStoredSession() {
    const token = localStorage.getItem('jwt_token');
    const user = localStorage.getItem('user_data');

    if (!token || !user) {
        return null;
    }

    try {
        return {
            token,
            user: JSON.parse(user)
        };
    } catch (error) {
        console.error('Error parsing user data:', error);
        return null;
    }
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
        localStorage.getItem('jwt_token') ||
        localStorage.getItem('user_data')
    );

    if (updateStorage) {
        localStorage.removeItem('jwt_token');
        localStorage.removeItem('user_data');
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
