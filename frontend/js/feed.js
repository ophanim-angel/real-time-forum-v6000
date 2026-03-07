// ==================== FEED FUNCTIONS ====================

// Load Posts from API
async function loadPosts() {
    const container = document.getElementById('posts-container');
    container.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
        </div>
    `;

    try {
        const posts = await apiRequest('/api/posts', 'GET');

        if (!posts || posts.length === 0) {
            container.innerHTML = `
                <div class="text-center" style="padding: 3rem; color: var(--text-muted);">
                    <span class="material-symbols-outlined" style="font-size: 3rem; opacity: 0.3;">inbox</span>
                    <p style="margin-top: 1rem; font-weight: 700; text-transform: uppercase; font-size: 0.75rem;">No posts yet. Be the first!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        posts.forEach(post => {
            const postElement = createPostElement(post);
            container.appendChild(postElement);
        });

    } catch (error) {
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

    card.innerHTML = `
        <div class="post-header">
            <div class="post-avatar">${initial}</div>
            <div class="post-meta">
                <span class="post-author">${escapeHTML(post.nickname || 'Anonymous')}</span>
                <span class="post-category">${escapeHTML(post.category || 'General')}</span>
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
                <span>Comments</span>
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

    // Get all selected categories
    const categorySelect = document.getElementById('post-category');
    const selectedCategories = Array.from(categorySelect.selectedOptions).map(opt => opt.value);

    // Default to 'general' if none selected
    const category = selectedCategories.length > 0 ? selectedCategories.join(', ') : 'general';

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

        // Clear form
        document.getElementById('post-title').value = '';
        document.getElementById('post-content').value = '';

        // Reset category selection
        Array.from(document.getElementById('post-category').options).forEach(opt => opt.selected = false);

        // Reload posts
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

        loadPosts(); // Reload posts to update counters and active state

    } catch (error) {
        showNotification(error.message, 'error');
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

        // Render Add Comment Form
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
                        <div style="background: var(--bg); padding: 0.5rem 0.75rem; border-radius: var(--radius); flex: 1;">
                            <div style="font-weight: 800; font-size: 0.625rem; text-transform: uppercase;">
                                ${escapeHTML(c.nickname)} • <span style="color: var(--text-muted);">${timeAgo}</span>
                            </div>
                            <div style="font-size: 0.75rem; font-weight: 500; margin-top: 0.25rem;">${escapeHTML(c.content)}</div>
                        </div>
                    </div>
                `;
            });
        }

        html += `</div>`;
        section.innerHTML = html;

        // Add Enter key support
        setTimeout(() => {
            const input = document.getElementById(`comment-input-${postId}`);
            const submitBtn = document.getElementById(`comment-submit-${postId}`);

            if (input) {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        console.log(`Enter key pressed for post ${postId}`);
                        createComment(postId);
                    }
                });
            }

            if (submitBtn) {
                submitBtn.addEventListener('click', () => {
                    console.log(`Reply button clicked for post ${postId}`);
                    createComment(postId);
                });
            }
        }, 100);

    } catch (error) {
        section.innerHTML = `<p class="text-center" style="color: var(--error); padding: 1rem; font-size: 0.75rem;">Error loading comments: ${error.message}</p>`;
    }
}

async function createComment(postId) {
    console.log(`createComment called for post: ${postId}`);
    const input = document.getElementById(`comment-input-${postId}`);
    if (!input) {
        console.error(`Input field not found for post: ${postId}`);
        return;
    }

    const content = input.value.trim();
    console.log(`Comment content: "${content}"`);

    if (!content) {
        showNotification('Comment cannot be empty', 'error');
        return;
    }

    try {
        console.log(`Sending API request to create comment...`);
        const result = await apiRequest('/api/comments/create', 'POST', {
            post_id: postId,
            content: content
        });
        console.log(`Comment created successfully:`, result);

        // Clear and Reload comments instantly
        input.value = '';
        showNotification('Comment posted!', 'success');
        loadComments(postId);
    } catch (error) {
        console.error(`Error in createComment:`, error);
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