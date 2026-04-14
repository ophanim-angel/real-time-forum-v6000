import { apiRequest, showNotification } from '../app.js';
import { escapeHTML, getTimeAgo } from '../utils.js';

export function toggleComments(postId) {
    const section = document.getElementById(`comments-${postId}`);
    if (!section) return;

    if (section.classList.contains('hidden')) {
        section.classList.remove('hidden');
        loadComments(postId);
    } else {
        section.classList.add('hidden');
    }
}

export async function loadComments(postId) {
    const section = document.getElementById(`comments-${postId}`);
    if (!section) return;

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
                <button type="button" id="comment-submit-${postId}" class="btn btn-primary">Reply</button>
            </div>
            <div class="comments-list" style="padding: 0 1rem 1rem 1rem;">
        `;

        if (!comments || comments.length === 0) {
            html += `<p style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase;">No comments yet.</p>`;
        } else {
            comments.forEach((comment) => {
                const initial = comment.nickname ? comment.nickname.charAt(0).toUpperCase() : '?';
                const timeAgo = getTimeAgo(comment.created_at);
                html += `
                    <div class="comment-item" style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem;">
                        <div class="post-avatar" style="width: 24px; height: 24px; font-size: 0.625rem;">${initial}</div>
                        <div class="comment-bubble">
                            <div style="font-weight: 800; font-size: 0.625rem; text-transform: uppercase;">
                                ${escapeHTML(comment.nickname)} • <span style="color: var(--text-muted);">${timeAgo}</span>
                            </div>
                            <div style="font-size: 0.75rem; font-weight: 500; margin-top: 0.25rem;">${escapeHTML(comment.content)}</div>
                            <div class="comment-actions">
                                <button type="button" class="comment-action ${comment.user_reaction === 'like' ? 'ruby-red' : ''}" data-comment-reaction="like" data-post-id="${comment.post_id}" data-comment-id="${comment.id}">
                                    <span class="material-symbols-outlined">thumb_up</span>
                                    <span>${comment.likes || 0}</span>
                                </button>
                                <button type="button" class="comment-action ${comment.user_reaction === 'dislike' ? 'ruby-red' : ''}" data-comment-reaction="dislike" data-post-id="${comment.post_id}" data-comment-id="${comment.id}">
                                    <span class="material-symbols-outlined">thumb_down</span>
                                    <span>${comment.dislikes || 0}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        html += `</div>`;
        section.innerHTML = html;

        const input = document.getElementById(`comment-input-${postId}`);
        const submitButton = document.getElementById(`comment-submit-${postId}`);

        input?.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                createComment(postId);
            }
        });

        submitButton?.addEventListener('click', () => {
            createComment(postId);
        });

        section.querySelectorAll('[data-comment-reaction]').forEach((button) => {
            button.addEventListener('click', () => {
                reactToComment(
                    button.dataset.postId,
                    button.dataset.commentId,
                    button.dataset.commentReaction
                );
            });
        });
    } catch (error) {
        showNotification(error.message, 'error');
        section.innerHTML = `<p class="text-center" style="color: var(--error); padding: 1rem; font-size: 0.75rem;">Error loading comments: ${escapeHTML(error.message)}</p>`;
    }
}

export async function createComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    if (!input) return;

    const content = input.value.trim();
    if (!content) {
        showNotification('Comment cannot be empty', 'error');
        return;
    }

    try {
        await apiRequest('/api/comments/create', 'POST', {
            post_id: postId,
            content
        });

        input.value = '';
        showNotification('Comment posted!', 'success');
        loadComments(postId);
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

export async function reactToComment(postId, commentId, type) {
    try {
        await apiRequest('/api/comments/react', 'POST', {
            comment_id: commentId,
            type
        });

        loadComments(postId);
    } catch (error) {
        showNotification(error.message, 'error');
    }
}
