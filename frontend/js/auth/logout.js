import { apiRequest, clearSession } from '../app.js';

export async function logout() {
    try {
        await apiRequest('/api/logout', 'POST');
    } catch (error) {
        // Ignore errors, local session should still be cleared.
    }

    clearSession({
        updateStorage: true,
        notify: true,
        notificationMessage: 'Logged out successfully'
    });
}

export function initLogout() {
    document.getElementById('nav-logout-btn')?.addEventListener('click', logout);
}
