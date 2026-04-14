import { setCurrentUser, setCSRFToken, showNotification, showView } from '../app.js';
import { initWebSocket } from '../messages.js';

export async function register() {
    const data = {
        nickname: document.getElementById('reg-nickname').value.trim(),
        email: document.getElementById('reg-email').value.trim(),
        password: document.getElementById('reg-password').value,
        first_name: document.getElementById('reg-firstname').value.trim(),
        last_name: document.getElementById('reg-lastname').value.trim(),
        age: parseInt(document.getElementById('reg-age').value, 10),
        gender: document.getElementById('reg-gender').value
    };

    if (!data.nickname || !data.email || !data.password || !data.first_name || !data.last_name || !data.age || !data.gender){
        showNotification('Please fill all required fields', 'error');
        return;
    }

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

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

        setCurrentUser({
            user_id: result.user_id,
            nickname: result.nickname
        });
        setCSRFToken(result.csrf_token);
        initWebSocket();
        showNotification('Account created successfully!', 'success');
        showView('feed');
    } catch (error) {
        showNotification(error.message, 'error');
    }
}
