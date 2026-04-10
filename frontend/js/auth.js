// ==================== AUTH FUNCTIONS ====================

// Show Register Form
function showRegister(updateHistory = true) {
    document.getElementById('form-login').classList.add('hidden');
    document.getElementById('form-register').classList.remove('hidden');
    document.title = 'AGORA | Register';

    if (updateHistory && window.location.pathname !== '/register') {
        if (window.navigateToPath) {
            window.navigateToPath('/register');
        } else {
            window.history.pushState({}, '', '/register');
        }
    }
}

// Show Login Form
function showLogin(updateHistory = true) {
    document.getElementById('form-register').classList.add('hidden');
    document.getElementById('form-login').classList.remove('hidden');
    document.title = 'AGORA | Login';

    if (updateHistory && window.location.pathname !== '/login') {
        if (window.navigateToPath) {
            window.navigateToPath('/login');
        } else {
            window.history.pushState({}, '', '/login');
        }
    }
}

// Login
async function login() {
    const identifier = document.getElementById('login-identifier').value.trim();
    const password = document.getElementById('login-password').value;

    if (!identifier || !password) {
        showNotification('Please fill all fields', 'error');
        return;
    }

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                identifier,
                password
            })
        });

        // Check if response is JSON or text
        const contentType = response.headers.get('content-type');
        let result;

        if (contentType && contentType.includes('application/json')) {
            result = await response.json();
        } else {
            const text = await response.text();
            throw new Error(text || 'Login failed');
        }

        if (!response.ok) {
            throw new Error(result.message || 'Login failed');
        }

        const user = {
            user_id: result.user_id,
            nickname: result.nickname
        };

        if (window.setCurrentUser) {
            window.setCurrentUser(user);
        } else {
            currentUser = user;
            window.currentUser = user;
            localStorage.setItem('user_data', JSON.stringify(user));
        }

        if (window.setCSRFToken) {
            window.setCSRFToken(result.csrf_token);
        }

        if (window.initWebSocket) window.initWebSocket();
        showNotification('Login successful!', 'success');
        showView('feed');

    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// Register
async function register() {
    const data = {
        nickname: document.getElementById('reg-nickname').value.trim(),
        email: document.getElementById('reg-email').value.trim(),
        password: document.getElementById('reg-password').value,
        first_name: document.getElementById('reg-firstname').value.trim(),
        last_name: document.getElementById('reg-lastname').value.trim(),
        age: parseInt(document.getElementById('reg-age').value),
        gender: document.getElementById('reg-gender').value
    };

    // Basic validation
    if (!data.nickname || !data.email || !data.password) {
        showNotification('Please fill all required fields', 'error');
        return;
    }

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        // Check if response is JSON or text
        const contentType = response.headers.get('content-type');
        let result;

        if (contentType && contentType.includes('application/json')) {
            result = await response.json();
        } else {
            const text = await response.text();
            throw new Error(text || 'Registration failed');
        }

        if (!response.ok) {
            throw new Error(result.message || 'Registration failed');
        }

        showNotification('Account created! Please login.', 'success');
        showLogin();

    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// Logout
async function logout() {
    try {
        await apiRequest('/api/logout', 'POST');
    } catch (error) {
        // Ignore errors, still clear local data
    }

    if (window.clearSession) {
        window.clearSession({
            updateStorage: true,
            notify: true,
            notificationMessage: 'Logged out successfully'
        });
        return;
    }

    localStorage.removeItem('user_data');
    localStorage.removeItem('csrf_token');
    currentUser = null;
    window.currentUser = null;

    if (window.closeWebSocket) window.closeWebSocket();

    showNotification('Logged out successfully', 'success');
    showView('auth');
}

// Password Toggle Logic (Hold to reveal)
document.addEventListener('DOMContentLoaded', () => {
    const toggles = document.querySelectorAll('.password-toggle');

    toggles.forEach(toggle => {
        const input = toggle.previousElementSibling;

        const showPassword = () => {
            input.type = 'text';
            toggle.textContent = 'visibility_off';
        };

        const hidePassword = () => {
            input.type = 'password';
            toggle.textContent = 'visibility';
        };

        // Mouse events (Desktop)
        toggle.addEventListener('mousedown', showPassword);
        toggle.addEventListener('mouseup', hidePassword);
        toggle.addEventListener('mouseleave', hidePassword);

        // Touch events (Mobile)
        toggle.addEventListener('touchstart', (e) => {
            e.preventDefault();
            showPassword();
        });
        toggle.addEventListener('touchend', hidePassword);
    });

    // Enter key support
    document.getElementById('login-identifier')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('login-password').focus();
    });

    document.getElementById('login-password')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') login();
    });

    document.getElementById('reg-password')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') register();
    });
});

// Export for global access
window.showRegister = showRegister;
window.showLogin = showLogin;
window.login = login;
window.register = register;
window.logout = logout;
