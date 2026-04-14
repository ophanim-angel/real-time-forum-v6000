import { apiRequest, getCurrentUser, showNotification } from '../app.js';
import { escapeHTML, getTimeAgo } from '../utils.js';
import { toggleComments } from './comments.js';

let latestPostsRequestId = 0;

function formatTopicLabel(topic) {
    if (!topic) return 'General';
    return topic.charAt(0).toUpperCase() + topic.slice(1);
}

function parsePostTopics(category) {
    if (!category) return ['general'];

    const topics = category
        .split(',')
        .map((topic) => topic.trim().toLowerCase())
        .filter(Boolean);

    return topics.length > 0 ? topics : ['general'];
}

function getSelectedPostTopics() {
    return Array.from(document.querySelectorAll('input[name="post-topic"]:checked'))
        .map((input) => input.value);
}

function getFeedFilters() {
    const selectedTopics = Array.from(document.querySelectorAll('input[name="feed-topic"]:checked'))
        .map((input) => input.value);
    const likedOnly = document.getElementById('feed-liked-filter')?.checked || false;
    return { topics: selectedTopics, likedOnly };
}

function buildPostsQuery() {
    const { topics, likedOnly } = getFeedFilters();
    const params = new URLSearchParams();

    if (topics.length > 0) {
        params.set('topic', topics.join(','));
    }

    if (likedOnly) {
        params.set('liked', 'true');
    }

    const queryString = params.toString();
    return queryString ? `?${queryString}` : '';
}

function createPostElement(post) {
    const card = document.createElement('div');
    card.className = 'post-card';

    const timeAgo = getTimeAgo(post.created_at);
    const initial = post.nickname ? post.nickname.charAt(0).toUpperCase() : '?';
    const topicMarkup = parsePostTopics(post.category)
        .map((topic) => `<span class="post-category-chip">${escapeHTML(formatTopicLabel(topic))}</span>`)
        .join('');
    const currentUser = getCurrentUser();

    card.innerHTML = `
        <div class="post-header">
            <div class="post-avatar">${initial}</div>
            <div class="post-meta">
                <span class="post-author">${escapeHTML(post.nickname || 'Anonymous')}</span>
                <div class="post-category-list">${topicMarkup}</div>
                <span class="post-time">${timeAgo}</span>
            </div>
        </div>
        <div class="post-content">
            <h3 class="post-title">${escapeHTML(post.title || 'No Title')}</h3>
            <p class="post-text">${escapeHTML(post.content || '')}</p>
        </div>
        <div class="post-footer">
            <button type="button" class="post-action ${post.user_reaction === 'like' ? 'ruby-red' : ''}" data-post-action="react" data-post-id="${post.id}" data-reaction-type="like">
                <span class="material-symbols-outlined">thumb_up</span>
                <span>${post.likes || 0}</span>
            </button>
            <button type="button" class="post-action ${post.user_reaction === 'dislike' ? 'ruby-red' : ''}" data-post-action="react" data-post-id="${post.id}" data-reaction-type="dislike">
                <span class="material-symbols-outlined">thumb_down</span>
                <span>${post.dislikes || 0}</span>
            </button>
            <button type="button" class="post-action" data-post-action="comments" data-post-id="${post.id}">
                <span class="material-symbols-outlined">chat_bubble</span>
                <span>${post.comments || 0}</span>
            </button>
            ${currentUser && currentUser.user_id === post.user_id ? `
            <button type="button" class="post-action delete" data-post-action="delete" data-post-id="${post.id}">
                <span class="material-symbols-outlined">delete</span>
                <span>Delete</span>
            </button>
            ` : ''}
        </div>
        <div id="comments-${post.id}" class="comments-section hidden"></div>
    `;

    return card;
}

function renderPosts(posts) {
    const container = document.getElementById('posts-container');

    if (!posts || posts.length === 0) {
        const { topics, likedOnly } = getFeedFilters();
        const emptyMessage = topics.length > 0 || likedOnly
            ? 'No posts match the current filters.'
            : 'No posts yet. Be the first!';

        container.innerHTML = `
            <div class="text-center" style="padding: 3rem; color: var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size: 3rem; opacity: 0.3;">inbox</span>
                <p style="margin-top: 1rem; font-weight: 700; text-transform: uppercase; font-size: 0.75rem;">${emptyMessage}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    posts.forEach((post) => {
        container.appendChild(createPostElement(post));
    });
}

export async function loadPosts() {
    const container = document.getElementById('posts-container');
    const requestId = ++latestPostsRequestId;
    container.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
        </div>
    `;

    try {
        const posts = await apiRequest(`/api/posts${buildPostsQuery()}`, 'GET');
        if (requestId !== latestPostsRequestId) return;
        renderPosts(posts || []);
    } catch (error) {
        if (requestId !== latestPostsRequestId) return;

        console.error('Error loading posts:', error);
        showNotification(error.message, 'error');
        container.innerHTML = `
            <div class="text-center" style="padding: 3rem; color: var(--error);">
                <span class="material-symbols-outlined" style="font-size: 3rem; opacity: 0.3;">error</span>
                <p style="margin-top: 1rem; font-weight: 700; text-transform: uppercase; font-size: 0.75rem;">Failed to load posts</p>
                <button type="button" class="btn btn-sm btn-outline" style="margin-top: 1rem;" data-post-action="retry">Retry</button>
            </div>
        `;
    }
}

export async function createPost() {
    const title = document.getElementById('post-title').value.trim();
    const content = document.getElementById('post-content').value.trim();
    const selectedTopics = getSelectedPostTopics();
    const category = selectedTopics.length > 0 ? selectedTopics.join(', ') : 'general';

    if (!title || !content) {
        showNotification('Please fill title and content', 'error');
        return;
    }

    try {
        await apiRequest('/api/posts/create', 'POST', { title, content, category });
        showNotification('Post created!', 'success');

        document.getElementById('post-title').value = '';
        document.getElementById('post-content').value = '';
        document.querySelectorAll('input[name="post-topic"]').forEach((input) => {
            input.checked = false;
        });

        loadPosts();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

async function deletePost(postId) {
    if (!confirm('Are you sure you want to delete this post?')) {
        return;
    }

    try {
        await apiRequest(`/api/posts/delete?id=${postId}`, 'DELETE');
        showNotification('Post deleted!', 'success');
        loadPosts();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

async function reactToPost(postId, type) {
    try {
        await apiRequest('/api/posts/react', 'POST', {
            post_id: postId,
            type
        });
        loadPosts();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

export function initPosts() {
    document.getElementById('create-post-submit-btn')?.addEventListener('click', createPost);

    document.getElementById('posts-container')?.addEventListener('click', (event) => {
        const actionTarget = event.target.closest('[data-post-action]');
        if (!actionTarget) return;

        const { postAction, postId, reactionType } = actionTarget.dataset;

        if (postAction === 'retry') {
            loadPosts();
            return;
        }

        if (postAction === 'react' && postId && reactionType) {
            reactToPost(postId, reactionType);
            return;
        }

        if (postAction === 'comments' && postId) {
            toggleComments(postId);
            return;
        }

        if (postAction === 'delete' && postId) {
            deletePost(postId);
        }
    });
}
