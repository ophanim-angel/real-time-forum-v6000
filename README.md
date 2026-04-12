<div style="font-family: 'Spline Sans', Arial, sans-serif; background:#f0f2f5; color:#000; padding:24px; line-height:1.6;">

<div style="max-width:1100px; margin:0 auto;">

<div style="background:#fff; border:3px solid #000; box-shadow:4px 4px 0 #000; padding:28px; margin-bottom:24px;">
  <div style="display:flex; align-items:center; gap:14px; margin-bottom:12px;">
    <div style="background:#000; color:#fff; border:2px solid #000; padding:10px 12px; font-weight:900; text-transform:uppercase;">AGORA</div>
    <div style="font-size:30px; font-weight:900; text-transform:uppercase; letter-spacing:-1px;">Real-Time Forum</div>
  </div>
  <p style="margin:0 0 14px 0; font-size:15px; font-weight:600; color:#333;">
    A single-page real-time forum built with Go, SQLite, WebSockets, vanilla JavaScript, HTML, and CSS.
  </p>
  <div style="display:flex; flex-wrap:wrap; gap:10px;">
    <span style="border:2px solid #000000; background:#5b13ec; color:#fff; padding:8px 12px; font-weight:800; text-transform:uppercase; font-size:12px;">Go Backend</span>
    <span style="border:2px solid #000; background:#fff; color:#000; padding:8px 12px; font-weight:800; text-transform:uppercase; font-size:12px;">SQLite</span>
    <span style="border:2px solid #000; background:#fff; color:#000; padding:8px 12px; font-weight:800; text-transform:uppercase; font-size:12px;">WebSockets</span>
    <span style="border:2px solid #000; background:#fff; color:#000; padding:8px 12px; font-weight:800; text-transform:uppercase; font-size:12px;">Vanilla JS SPA</span>
  </div>
</div>

<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:20px; margin-bottom:24px;">
  <div style="background:#fff; border:3px solid #000; box-shadow:4px 4px 0 #000; padding:22px;">
    <div style="font-size:12px; font-weight:900; text-transform:uppercase; border-bottom:2px solid #000; padding-bottom:8px; margin-bottom:12px;">Project</div>
    <p style="margin:0 0 10px 0;"><strong>Name:</strong> real-time-forum</p>
    <p style="margin:0 0 10px 0;"><strong>Interface:</strong> AGORA</p>
    <p style="margin:0;"><strong>Repo:</strong><br><a href="https://learn.zone01oujda.ma/git/mohnouri/real-time-forum">https://learn.zone01oujda.ma/git/mohnouri/real-time-forum</a></p>
  </div>
  <div style="background:#fff; border:3px solid #000; box-shadow:4px 4px 0 #000; padding:22px;">
    <div style="font-size:12px; font-weight:900; text-transform:uppercase; border-bottom:2px solid #000; padding-bottom:8px; margin-bottom:12px;">Run</div>
    <pre style="margin:0; background:#f0f2f5; border:2px solid #000000; padding:14px; overflow:auto;"><code style="color:black">go run .</code></pre>
    <p style="margin:12px 0 0 0;"><strong>Local URL:</strong> <code style="color:#fff">http://localhost:8080</code></p>
  </div>
  <div style="background:#fff; border:3px solid #000; box-shadow:4px 4px 0 #000; padding:22px;">
    <div style="font-size:12px; font-weight:900; text-transform:uppercase; border-bottom:2px solid #000; padding-bottom:8px; margin-bottom:12px;">Allowed Packages</div>
    <ul style="margin:0; padding-left:18px;">
      <li>Standard Go packages</li>
      <li><code style="color:#fff">github.com/gorilla/websocket</code></li>
      <li><code style="color:#fff">github.com/mattn/go-sqlite3</code></li>
      <li><code style="color:#fff">golang.org/x/crypto</code></li>
      <li><code style="color:#fff">github.com/gofrs/uuid</code></li>
    </ul>
  </div>
</div>

<div style="background:#fff; border:3px solid #000; box-shadow:4px 4px 0 #000; padding:24px; margin-bottom:24px;">
  <div style="font-size:12px; font-weight:900; text-transform:uppercase; border-bottom:2px solid #000; padding-bottom:8px; margin-bottom:16px;">Objectives</div>
  <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px;">
    <div style="border:2px solid #000; padding:14px; background:#fff;">
      <div style="font-weight:900; text-transform:uppercase; margin-bottom:6px;">Registration & Login</div>
      <div style="font-size:14px;">Register, login with nickname or email, session cookies, logout from anywhere.</div>
    </div>
    <div style="border:2px solid #000; padding:14px; background:#fff;">
      <div style="font-weight:900; text-transform:uppercase; margin-bottom:6px;">Posts & Comments</div>
      <div style="font-size:14px;">Create posts, assign topics, react, comment, and browse a feed-based interface.</div>
    </div>
    <div style="border:2px solid #000; padding:14px; background:#fff;">
      <div style="font-weight:900; text-transform:uppercase; margin-bottom:6px;">Private Messages</div>
      <div style="font-size:14px;">Real-time chat, typing indicators, online presence, and message history loading.</div>
    </div>
    <div style="border:2px solid #000; padding:14px; background:#fff;">
      <div style="font-weight:900; text-transform:uppercase; margin-bottom:6px;">Single Page App</div>
      <div style="font-size:14px;">One HTML file, page switching handled entirely in JavaScript.</div>
    </div>
  </div>
</div>

<div style="background:#fff; border:3px solid #000; box-shadow:4px 4px 0 #000; padding:24px; margin-bottom:24px;">
  <div style="font-size:12px; font-weight:900; text-transform:uppercase; border-bottom:2px solid #000; padding-bottom:8px; margin-bottom:16px;">Implemented Features</div>

  <h3 style="margin:0 0 8px 0; text-transform:uppercase;">Authentication</h3>
  <ul>
    <li>User registration with nickname, age, gender, first name, last name, email, and password</li>
    <li>Login with either nickname or email</li>
    <li>Database-backed sessions with cookies</li>
    <li>CSRF token protection on authenticated write actions</li>
    <li>Logout from any page</li>
  </ul>

  <h3 style="margin:18px 0 8px 0; text-transform:uppercase;">Posts and Comments</h3>
  <ul>
    <li>Create posts with allowed topics: <code style="color:#fff">General</code>, <code style="color:#fff">Science</code>, <code style="color:#fff">Tech</code>, <code style="color:#fff">Art</code>, <code style="color:#fff">Gaming</code></li>
    <li>Multi-topic support with backend validation</li>
    <li>Comments shown on demand when a post is expanded</li>
    <li>Post and comment reactions</li>
    <li>Delete option for post owners</li>
  </ul>

  <h3 style="margin:18px 0 8px 0; text-transform:uppercase;">Real-Time Messaging</h3>
  <ul>
    <li>Private messages through WebSockets</li>
    <li>Online/offline users list</li>
    <li>Typing and stop-typing indicators</li>
    <li>Conversation history loading 10 messages at a time</li>
    <li>Chat ordering by latest activity, then alphabetically for new users</li>
  </ul>
</div>

<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:20px; margin-bottom:24px;">
  <div style="background:#fff; border:3px solid #000; box-shadow:4px 4px 0 #000; padding:22px;">
    <div style="font-size:12px; font-weight:900; text-transform:uppercase; border-bottom:2px solid #000; padding-bottom:8px; margin-bottom:12px;">Backend Stack</div>
    <ul style="margin:0; padding-left:18px;">
      <li>Go HTTP server</li>
      <li>SQLite persistence</li>
      <li>WebSocket manager for presence and private messages</li>
      <li>Session middleware</li>
      <li>User-based rate limiting for protected routes</li>
    </ul>
  </div>
  <div style="background:#fff; border:3px solid #000; box-shadow:4px 4px 0 #000; padding:22px;">
    <div style="font-size:12px; font-weight:900; text-transform:uppercase; border-bottom:2px solid #000; padding-bottom:8px; margin-bottom:12px;">Frontend Stack</div>
    <ul style="margin:0; padding-left:18px;">
      <li>Single HTML entry point</li>
      <li>Vanilla JS ES modules</li>
      <li>Client-side view switching</li>
      <li>Real-time chat popup</li>
      <li>Feed filters and live UI updates</li>
    </ul>
  </div>
  <div style="background:#fff; border:3px solid #000; box-shadow:4px 4px 0 #000; padding:22px;">
    <div style="font-size:12px; font-weight:900; text-transform:uppercase; border-bottom:2px solid #000; padding-bottom:8px; margin-bottom:12px;">Database Tables</div>
    <ul style="margin:0; padding-left:18px;">
      <li><code style="color:#fff">users</code></li>
      <li><code style="color:#fff">posts</code></li>
      <li><code style="color:#fff">comments</code></li>
      <li><code style="color:#fff">private_messages</code></li>
      <li><code style="color:#fff">post_reactions</code></li>
      <li><code style="color:#fff">comment_reactions</code></li>
      <li><code style="color:#fff">sessions</code></li>
    </ul>
  </div>
</div>

<div style="background:#fff; border:3px solid #000; box-shadow:4px 4px 0 #000; padding:24px; margin-bottom:24px;">
  <div style="font-size:12px; font-weight:900; text-transform:uppercase; border-bottom:2px solid #000; padding-bottom:8px; margin-bottom:16px;">Routes</div>

  <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">
    <div>
      <div style="font-weight:900; text-transform:uppercase; margin-bottom:8px;">Public API</div>
      <ul>
        <li><code style="color:#fff">POST /api/register</code></li>
        <li><code style="color:#fff">POST /api/login</code></li>
        <li><code style="color:#fff">GET /api/session</code></li>
      </ul>
    </div>
    <div>
      <div style="font-weight:900; text-transform:uppercase; margin-bottom:8px;">Protected API</div>
      <ul>
        <li><code style="color:#fff">POST /api/logout</code></li>
        <li><code style="color:#fff">GET /api/posts</code></li>
        <li><code style="color:#fff">POST /api/posts/create</code></li>
        <li><code style="color:#fff">DELETE /api/posts/delete</code></li>
        <li><code style="color:#fff">POST /api/comments/create</code></li>
        <li><code style="color:#fff">GET /api/chat/history</code></li>
        <li><code style="color:#fff">POST /api/chat/send</code></li>
      </ul>
    </div>
    <div>
      <div style="font-weight:900; text-transform:uppercase; margin-bottom:8px;">WebSocket</div>
      <ul>
        <li><code style="color:#fff">GET /ws</code></li>
        <li><code style="color:#fff">new_message</code></li>
        <li><code style="color:#fff">typing</code></li>
        <li><code style="color:#fff">stop_typing</code></li>
        <li><code style="color:#fff">presence_update</code></li>
        <li><code style="color:#fff">session_revoked</code></li>
      </ul>
    </div>
  </div>
</div>

<div style="background:#fff; border:3px solid #000; box-shadow:4px 4px 0 #000; padding:24px; margin-bottom:24px;">
  <div style="font-size:12px; font-weight:900; text-transform:uppercase; border-bottom:2px solid #000; padding-bottom:8px; margin-bottom:16px;">Project Structure</div>
  <pre style="margin:0; background:#f0f2f5; border:2px solid #000; padding:16px; overflow:auto;"><code style="color:#000">.
├── backend
│   ├── handlers
│   ├── middlewares
│   ├── models
│   ├── utils
│   └── ws
├── database
│   ├── dbInit.go
│   └── forum.db
├── frontend
│   ├── css
│   ├── js
│   └── index.html
├── go.mod
├── go.sum
└── main.go</code></pre>
</div>

<div style="background:#fff; border:3px solid #000; box-shadow:4px 4px 0 #000; padding:24px; margin-bottom:24px;">
  <div style="font-size:12px; font-weight:900; text-transform:uppercase; border-bottom:2px solid #000; padding-bottom:8px; margin-bottom:16px;">AGORA Flat UI Design System</div>

  <h3 style="margin:0 0 8px 0; text-transform:uppercase;">Visual Philosophy</h3>
  <p>The AGORA interface uses a bold flat UI with strong black borders, compact cards, sharp contrast, and controlled accent colors. The goal is structural clarity, not decorative depth.</p>

  <h3 style="margin:18px 0 8px 0; text-transform:uppercase;">Core Principles</h3>
  <ul>
    <li><strong>Clarity over depth:</strong> solid surfaces and readable hierarchy</li>
    <li><strong>Structural boldness:</strong> 2px to 4px borders define containers and actions</li>
    <li><strong>Accent restraint:</strong> purple, error red, and success green are used intentionally</li>
    <li><strong>SPA consistency:</strong> one shell, dynamic views, real-time updates</li>
  </ul>

  <h3 style="margin:18px 0 8px 0; text-transform:uppercase;">Palette</h3>
  <div style="display:flex; flex-wrap:wrap; gap:10px;">
    <span style="border:2px solid #000; background:#000; color:#fff; padding:8px 12px; font-weight:800;">#000000</span>
    <span style="border:2px solid #000; background:#5b13ec; color:#fff; padding:8px 12px; font-weight:800;">#5B13EC</span>
    <span style="border:2px solid #000; background:#7c3aed; color:#fff; padding:8px 12px; font-weight:800;">#7C3AED</span>
    <span style="border:2px solid #000; background:#f0f2f5; color:#000; padding:8px 12px; font-weight:800;">#F0F2F5</span>
    <span style="border:2px solid #000; background:#ffffff; color:#000; padding:8px 12px; font-weight:800;">#FFFFFF</span>
    <span style="border:2px solid #000; background:#10b981; color:#fff; padding:8px 12px; font-weight:800;">#10B981</span>
    <span style="border:2px solid #000; background:#ef4444; color:#fff; padding:8px 12px; font-weight:800;">#EF4444</span>
  </div>

  <h3 style="margin:18px 0 8px 0; text-transform:uppercase;">Component Style</h3>
  <ul>
    <li><strong>Cards:</strong> white surfaces, thick borders, offset shadows</li>
    <li><strong>Buttons:</strong> uppercase labels, high-contrast states, tactile movement on press</li>
    <li><strong>Inputs:</strong> strong borders, simple fills, visible focus</li>
    <li><strong>Chat:</strong> persistent popup layout, separated sidebar and conversation panel</li>
  </ul>
</div>

<div style="background:#5b13ec; color:#fff; border:3px solid #000; box-shadow:4px 4px 0 #000; padding:24px;">
  <div style="font-size:12px; font-weight:900; text-transform:uppercase; margin-bottom:8px;">Author</div>
  <div style="font-size:22px; font-weight:900; text-transform:uppercase;">mohnouri</div>
  <div style="font-size:22px; font-weight:900; text-transform:uppercase;">obenmbar</div>
  <div style="font-size:14px; margin-top:6px;">Zone01 Oujda • real-time-forum project</div>
</div>

</div>
</div>
