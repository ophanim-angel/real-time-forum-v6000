// ==================== APP STATE ====================

// Current logged-in user
let currentUser = null;

// ==================== INITIALIZATION ====================

// Run when page loads
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupGlobalEventListeners();
});

// ==================== AUTH CHECK ====================

// Check if user is logged in (token in localStorage)
function checkAuth() {
    const token = localStorage.getItem('jwt_token');
    const user = localStorage.getItem('user_data');

    if (token && user) {
        try {
            currentUser = JSON.parse(user);
            window.currentUser = currentUser; // Ensure global sync
            showView('feed');
            if (window.initWebSocket) initWebSocket();
        } catch (error) {
            console.error('Error parsing user data:', error);
            localStorage.removeItem('jwt_token');
            localStorage.removeItem('user_data');
            showView('auth');
        }
    } else {
        showView('auth');
    }
}

// ==================== ROUTER (Show/Hide Views) ====================

// Show specific view, hide others
function showView(viewName) {
    // Hide all views
    document.getElementById('view-auth').classList.add('hidden');
    document.getElementById('view-feed').classList.add('hidden');
    document.getElementById('view-messages').classList.add('hidden');

    // Show requested view
    const view = document.getElementById(`view-${viewName}`);
    if (view) {
        view.classList.remove('hidden');

        // Load posts when feed view is shown
        if (viewName === 'feed') {
            loadPosts();
        }

        // Load messages list when messages view is shown
        if (viewName === 'messages') {
            loadMessagesList();
            const globalBadge = document.getElementById('nav-global-badge');
            if (globalBadge) globalBadge.remove();
        }
    }

    // Update navigation bar
    const navAuth = document.getElementById('nav-auth');
    if (viewName === 'auth') {
        navAuth.classList.add('hidden');
        document.title = 'AGORA | Login';
    } else {
        navAuth.classList.remove('hidden');
        document.title = 'AGORA | Real-Time Forum';

        if (currentUser) {
            document.getElementById('nav-username').textContent = `@${currentUser.nickname}`;
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
            localStorage.removeItem('jwt_token');
            localStorage.removeItem('user_data');
            currentUser = null;
            showView('auth');
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

    // Handle browser back/forward buttons
    window.addEventListener('popstate', () => {
        // Could add routing logic here for SPA navigation
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