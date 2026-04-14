import { navigateToPath } from '../app.js';
import { login } from './login.js';
import { register } from './register.js';

export function showRegister(updateHistory = true) {
    document.getElementById('form-login').classList.add('hidden');
    document.getElementById('form-register').classList.remove('hidden');
    document.title = 'AGORA | Register';

    if (updateHistory && window.location.pathname !== '/register') {
        navigateToPath('/register');
    }
}

export function showLogin(updateHistory = true) {
    document.getElementById('form-register').classList.add('hidden');
    document.getElementById('form-login').classList.remove('hidden');
    document.title = 'AGORA | Login';

    if (updateHistory && window.location.pathname !== '/login') {
        navigateToPath('/login');
    }
}

export function initAuthForms() {
    document.getElementById('login-submit-btn')?.addEventListener('click', login);
    document.getElementById('show-register-btn')?.addEventListener('click', () => showRegister());
    document.getElementById('register-submit-btn')?.addEventListener('click', register);
    document.getElementById('show-login-btn')?.addEventListener('click', () => showLogin());

    document.querySelectorAll('.password-toggle').forEach(toggle => {
        const input = toggle.previousElementSibling;

        const showPassword = () => {
            input.type = 'text';
            toggle.textContent = 'visibility_off';
        };

        const hidePassword = () => {
            input.type = 'password';
            toggle.textContent = 'visibility';
        };

        toggle.addEventListener('mousedown', showPassword);
        toggle.addEventListener('mouseup', hidePassword);
        toggle.addEventListener('mouseleave', hidePassword);
        toggle.addEventListener('touchstart', (event) => {
            event.preventDefault();
            showPassword();
        });
        toggle.addEventListener('touchend', hidePassword);
    });

    document.getElementById('login-identifier')?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            document.getElementById('login-password')?.focus();
        }
    });

    document.getElementById('login-password')?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            login();
        }
    });

    document.getElementById('reg-password')?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            register();
        }
    });
}
