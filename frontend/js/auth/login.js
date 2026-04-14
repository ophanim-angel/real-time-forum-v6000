import { setCurrentUser, setCSRFToken, showNotification, showView } from '../app.js';
import { initWebSocket } from '../messages.js';

export async function login() {
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
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ identifier, password })
        });

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

        setCurrentUser({
            user_id: result.user_id,
            nickname: result.nickname
        });
        setCSRFToken(result.csrf_token);
        initWebSocket();
        showNotification('Login successful!', 'success');
        showView('feed');
    } catch (error) {
        showNotification(error.message, 'error');
    }
}
