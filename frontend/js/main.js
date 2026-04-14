import { goHome, initApp } from './app.js';
import { initFeed, loadPosts, toggleCreatePost } from './feed.js';
import { initMessages, initWebSocket, closeWebSocket, toggleMessagesPopup } from './messages.js';
import { initAuthForms, showLogin, showRegister } from './auth/forms.js';
import { initLogout } from './auth/logout.js';

document.addEventListener('DOMContentLoaded', () => {
    initAuthForms();
    initLogout();
    initFeed();
    initMessages();

    document.getElementById('logo-link')?.addEventListener('click', (event) => {
        event.preventDefault();
        goHome();
    });

    document.getElementById('not-found-home-btn')?.addEventListener('click', goHome);

    initApp({
        closeWebSocket,
        initWebSocket,
        loadPosts,
        showLogin,
        showRegister,
        toggleCreatePost,
        toggleMessagesPopup
    });
});
