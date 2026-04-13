// ==================== FEED FUNCTIONS ====================

let allPosts = [];
let latestPostsRequestId = 0;

function formatTopicLabel(topic) {
    if (!topic) return 'General';
    return topic.charAt(0).toUpperCase() + topic.slice(1);
}

function parsePostTopics(category) {
    if (!category) return ['general'];

    const topics = category
        .split(',')
        .map(topic => topic.trim().toLowerCase())
        .filter(Boolean);

    return topics.length > 0 ? topics : ['general'];
}

function getSelectedPostTopics() {
    return Array.from(document.querySelectorAll('input[name="post-topic"]:checked'))
        .map(input => input.value);
}

function getFeedFilters() {
    const selectedTopics = Array.from(document.querySelectorAll('input[name="feed-topic"]:checked'))
        .map(input => input.value);
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
    posts.forEach(post => {
        const postElement = createPostElement(post);
        container.appendChild(postElement);
    });
}

// Load Posts from API
async function loadPosts() {
    const container = document.getElementById('posts-container');
    const requestId = ++latestPostsRequestId;
    container.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
        </div>
    `;

    try {
        const posts = await apiRequest(`/api/posts${buildPostsQuery()}`, 'GET');
        if (requestId !== latestPostsRequestId) {
            return;
        }
        allPosts = posts || [];
        renderPosts(allPosts);

    } catch (error) {
        if (requestId !== latestPostsRequestId) {
            return;
        }
        console.error('Error loading posts:', error);
        container.innerHTML = `
            <div class="text-center" style="padding: 3rem; color: var(--error);">
                <span class="material-symbols-outlined" style="font-size: 3rem; opacity: 0.3;">error</span>
                <p style="margin-top: 1rem; font-weight: 700; text-transform: uppercase; font-size: 0.75rem;">Failed to load posts</p>
                <button class="btn btn-sm btn-outline" style="margin-top: 1rem;" onclick="loadPosts()">Retry</button>
            </div>
        `;
    }
}

// Create Post HTML Element
function createPostElement(post) {
    const card = document.createElement('div');
    card.className = 'post-card';

    const timeAgo = getTimeAgo(post.created_at);
    const initial = post.nickname ? post.nickname.charAt(0).toUpperCase() : '?';
    const topicMarkup = parsePostTopics(post.category)
        .map(topic => `<span class="post-category-chip">${escapeHTML(formatTopicLabel(topic))}</span>`)
        .join('');

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
            <button class="post-action ${post.user_reaction === 'like' ? 'ruby-red' : ''}" onclick="reactToPost('${post.id}', 'like')">
                <span class="material-symbols-outlined">thumb_up</span>
                <span>${post.likes || 0}</span>
            </button>
            <button class="post-action ${post.user_reaction === 'dislike' ? 'ruby-red' : ''}" onclick="reactToPost('${post.id}', 'dislike')">
                <span class="material-symbols-outlined">thumb_down</span>
                <span>${post.dislikes || 0}</span>
            </button>
            <button class="post-action" onclick="toggleComments('${post.id}')">
                <span class="material-symbols-outlined">chat_bubble</span>
                <span>${post.comments || 0}</span>
            </button>
            ${currentUser && currentUser.user_id === post.user_id ? `
            <button class="post-action delete" onclick="deletePost('${post.id}')">
                <span class="material-symbols-outlined">delete</span>
                <span>Delete</span>
            </button>
            ` : ''}
        </div>
        <div id="comments-${post.id}" class="comments-section hidden">
            <!-- Comments loaded dynamically here -->
        </div>
    `;

    return card;
}

// Create Post
async function createPost() {
    const title = document.getElementById('post-title').value.trim();
    const content = document.getElementById('post-content').value.trim();
    const selectedTopics = getSelectedPostTopics();
    const category = selectedTopics.length > 0 ? selectedTopics.join(', ') : 'general';

    if (!title || !content) {
        showNotification('Please fill title and content', 'error');
        return;
    }

    try {
        await apiRequest('/api/posts/create', 'POST', {
            title: title,
            content: content,
            category: category
        });

        showNotification('Post created!', 'success');

        document.getElementById('post-title').value = '';
        document.getElementById('post-content').value = '';
        document.querySelectorAll('input[name="post-topic"]').forEach(input => {
            input.checked = false;
        });

        loadPosts();

    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// Delete Post
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

// React to Post
async function reactToPost(postId, type) {
    try {
        await apiRequest('/api/posts/react', 'POST', {
            post_id: postId,
            type: type
        });

        loadPosts();

    } catch (error) {
        showNotification(error.message, 'error');
    }
}

function updateFeedFilters() {
    loadPosts();
}

function clearFeedFilters() {
    const likedFilter = document.getElementById('feed-liked-filter');
    document.querySelectorAll('input[name="feed-topic"]').forEach(input => {
        input.checked = false;
    });
    if (likedFilter) likedFilter.checked = false;

    loadPosts();
}

function toggleCreatePost(forceState) {
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

// ==================== COMMENTS LOGIC ====================

function toggleComments(postId) {
    const section = document.getElementById(`comments-${postId}`);
    if (section.classList.contains('hidden')) {
        section.classList.remove('hidden');
        loadComments(postId);
    } else {
        section.classList.add('hidden');
    }
}

async function loadComments(postId) {
    const section = document.getElementById(`comments-${postId}`);
    section.innerHTML = `
        <div class="loading text-center" style="padding: 1rem;">
            <div class="spinner" style="width: 20px; height: 20px;"></div>
        </div>
    `;

    try {
        const comments = await apiRequest(`/api/comments?post_id=${postId}`, 'GET');

        let html = `
            <div class="comment-form-area" style="display: flex; gap: 0.5rem; margin-bottom: 1rem; padding: 0.5rem 1rem;">
                <input type="text" id="comment-input-${postId}" class="input" placeholder="Write a comment..." style="margin-bottom: 0;" autocomplete="off">
                <button id="comment-submit-${postId}" class="btn btn-primary">Reply</button>
            </div>
            <div class="comments-list" style="padding: 0 1rem 1rem 1rem;">
        `;

        if (!comments || comments.length === 0) {
            html += `<p style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">No comments yet.</p>`;
        } else {
            comments.forEach(c => {
                const initial = c.nickname ? c.nickname.charAt(0).toUpperCase() : '?';
                const timeAgo = getTimeAgo(c.created_at);
                html += `
                    <div class="comment-item" style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem;">
                        <div class="post-avatar" style="width: 24px; height: 24px; font-size: 0.625rem;">${initial}</div>
                        <div class="comment-bubble">
                            <div style="font-weight: 800; font-size: 0.625rem; text-transform: uppercase;">
                                ${escapeHTML(c.nickname)} • <span style="color: var(--text-muted);">${timeAgo}</span>
                            </div>
                            <div style="font-size: 0.75rem; font-weight: 500; margin-top: 0.25rem;">${escapeHTML(c.content)}</div>
                            <div class="comment-actions">
                                <button class="comment-action ${c.user_reaction === 'like' ? 'ruby-red' : ''}" onclick="reactToComment('${c.post_id}', '${c.id}', 'like')">
                                    <span class="material-symbols-outlined">thumb_up</span>
                                    <span>${c.likes || 0}</span>
                                </button>
                                <button class="comment-action ${c.user_reaction === 'dislike' ? 'ruby-red' : ''}" onclick="reactToComment('${c.post_id}', '${c.id}', 'dislike')">
                                    <span class="material-symbols-outlined">thumb_down</span>
                                    <span>${c.dislikes || 0}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        html += `</div>`;
        section.innerHTML = html;

        setTimeout(() => {
            const input = document.getElementById(`comment-input-${postId}`);
            const submitBtn = document.getElementById(`comment-submit-${postId}`);

            if (input) {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        createComment(postId);
                    }
                });
            }

            if (submitBtn) {
                submitBtn.addEventListener('click', () => {
                    createComment(postId);
                });
            }
        }, 100);

    } catch (error) {
        section.innerHTML = `<p class="text-center" style="color: var(--error); padding: 1rem; font-size: 0.75rem;">Error loading comments: ${error.message}</p>`;
    }
}

async function createComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    if (!input) {
        return;
    }

    const content = input.value.trim();

    if (!content) {
        showNotification('Comment cannot be empty', 'error');
        return;
    }

    try {
        await apiRequest('/api/comments/create', 'POST', {
            post_id: postId,
            content: content
        });

        input.value = '';
        showNotification('Comment posted!', 'success');
        loadComments(postId);
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

async function reactToComment(postId, commentId, type) {
    try {
        await apiRequest('/api/comments/react', 'POST', {
            comment_id: commentId,
            type: type
        });

        loadComments(postId);
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// Export for global access by inline onclicks
window.loadPosts = loadPosts;
window.createPost = createPost;
window.deletePost = deletePost;
window.reactToPost = reactToPost;
window.toggleComments = toggleComments;
window.createComment = createComment;
window.reactToComment = reactToComment;
window.updateFeedFilters = updateFeedFilters;
window.clearFeedFilters = clearFeedFilters;
window.toggleCreatePost = toggleCreatePost;
