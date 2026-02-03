/**
 * Lightweight dashboard for DevEnv PTY sessions.
 */

export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DevEnv PTY Sessions</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css">
  <style>
    :root {
      --bg: #111317;
      --panel: #1a1f26;
      --border: #2a323d;
      --text: #e6e8eb;
      --muted: #9aa4b2;
      --accent: #7fb0ff;
      --terminal: #0b0d10;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      height: 100vh;
      display: grid;
      grid-template-columns: 260px 1fr;
    }

    aside {
      background: var(--panel);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      padding: 16px;
      gap: 12px;
    }

    h1 {
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin: 0;
    }

    button, select {
      font-family: inherit;
      font-size: 13px;
    }

    .controls {
      display: grid;
      gap: 8px;
    }

    .session-list {
      display: grid;
      gap: 8px;
      overflow: auto;
      padding-right: 4px;
    }

    .session-item {
      background: transparent;
      color: var(--text);
      border: 1px solid var(--border);
      padding: 8px 10px;
      border-radius: 8px;
      text-align: left;
      cursor: pointer;
    }

    .session-item.active {
      border-color: var(--accent);
      color: var(--accent);
    }

    main {
      display: grid;
      grid-template-rows: auto 1fr;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      background: var(--panel);
    }

    .status {
      font-size: 12px;
      color: var(--muted);
    }

    #terminal {
      background: var(--terminal);
      padding: 12px;
      height: 100%;
    }

    #terminal .xterm {
      height: 100%;
    }
  </style>
</head>
<body>
  <aside>
    <h1>Sessions</h1>
    <div class="controls">
      <button id="refreshBtn">Refresh</button>
      <button id="disconnectBtn">Disconnect</button>
    </div>
    <div class="session-list" id="sessionList"></div>
  </aside>
  <main>
    <header>
      <div id="sessionTitle">No session selected</div>
      <div class="status" id="sessionStatus">Status: idle</div>
    </header>
    <div id="terminal"></div>
  </main>

  <script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js"></script>
  <script>
    let sessions = [];
    let activeId = null;
    let socket = null;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      lineHeight: 1.4,
      theme: {
        background: '#0b0d10',
        foreground: '#e6e8eb',
        cursor: '#7fb0ff',
        selectionBackground: 'rgba(127, 176, 255, 0.25)'
      }
    });
    const fit = new FitAddon.FitAddon();
    term.loadAddon(fit);
    term.open(document.getElementById('terminal'));
    requestAnimationFrame(() => fit.fit());

    function setStatus(text) {
      document.getElementById('sessionStatus').textContent = text;
    }

    async function loadSessions() {
      const response = await fetch('/api/sessions');
      sessions = await response.json();
      renderSessions();
    }

    function renderSessions() {
      const list = document.getElementById('sessionList');
      list.innerHTML = '';
      if (!sessions.length) {
        const empty = document.createElement('div');
        empty.textContent = 'No active sessions.';
        empty.style.color = '#9aa4b2';
        empty.style.fontSize = '12px';
        list.appendChild(empty);
        return;
      }
      sessions.forEach((session) => {
        const item = document.createElement('button');
        item.className = 'session-item' + (session.id === activeId ? ' active' : '');
        item.textContent = session.title || session.id;
        item.addEventListener('click', () => connect(session));
        list.appendChild(item);
      });
    }

    function connect(session) {
      disconnect();
      activeId = session.id;
      document.getElementById('sessionTitle').textContent = session.title || session.id;
      setStatus('Status: ' + session.status);
      renderSessions();

      socket = new WebSocket('ws://' + window.location.host + '/ws?session=' + session.id);
      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'history' }));
      };
      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'output' || msg.type === 'history') {
          term.write(msg.data);
        }
        if (msg.type === 'state') {
          setStatus('Status: ' + msg.status);
        }
        if (msg.type === 'error') {
          term.write('\r\n[error] ' + msg.message + '\r\n');
        }
      };
      socket.onclose = () => {
        setStatus('Status: disconnected');
      };
      term.onData((data) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'input', data }));
        }
      });
    }

    function disconnect() {
      if (socket) {
        socket.close();
        socket = null;
      }
      activeId = null;
      document.getElementById('sessionTitle').textContent = 'No session selected';
      setStatus('Status: idle');
      term.reset();
      renderSessions();
    }

    document.getElementById('refreshBtn').addEventListener('click', loadSessions);
    document.getElementById('disconnectBtn').addEventListener('click', disconnect);
    window.addEventListener('resize', () => fit.fit());

    loadSessions();
    setInterval(loadSessions, 3000);
  </script>
</body>
</html>`;
