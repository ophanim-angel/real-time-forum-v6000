import { loadPosts, initPosts } from './feed/posts.js';

export function updateFeedFilters() {
    loadPosts();
}

export function clearFeedFilters() {
    const likedFilter = document.getElementById('feed-liked-filter');
    document.querySelectorAll('input[name="feed-topic"]').forEach((input) => {
        input.checked = false;
    });
    if (likedFilter) {
        likedFilter.checked = false;
    }

    loadPosts();
}

export function toggleCreatePost(forceState) {
    const panel = document.getElementById('create-post-panel');
    const navButton = document.getElementById('nav-create-btn');
    if (!panel) return;

    const shouldOpen = typeof forceState === 'boolean'
        ? forceState
        : panel.classList.contains('hidden');

    panel.classList.toggle('hidden', !shouldOpen);

    if (navButton) {
        navButton.classList.toggle('active', shouldOpen);
    }

    if (shouldOpen) {
        document.getElementById('post-title')?.focus();
    }
}

export function initFeed() {
    initPosts();

    document.getElementById('nav-create-btn')?.addEventListener('click', () => {
        toggleCreatePost();
    });
    document.getElementById('create-post-close-btn')?.addEventListener('click', () => {
        toggleCreatePost(false);
    });
    document.getElementById('clear-filters-btn')?.addEventListener('click', clearFeedFilters);

    document.querySelectorAll('input[name="feed-topic"], #feed-liked-filter').forEach((input) => {
        input.addEventListener('change', updateFeedFilters);
    });
}

export { loadPosts };
