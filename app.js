// ============================================================
// PingMe — Real-Time P2P Chat using PeerJS
// ============================================================

const EMOJIS = ['😀','😂','🥰','😎','🤩','😍','🥳','🤔','😮','😢','😡','🙏','👍','👎','❤️','🔥','⚡','🎉','✨','🌟','💯','🎊','🚀','💪','🤝','👋','🌈','🌙','☀️','🍕','☕','🎵','🏆','⚽','🌲','🐱','🐶','🦋','🌸','💎','🎯','❄️','🌊','😴','🤣','😇','🥺','😬','🤯','🥶'];

// ── State ──────────────────────────────────────────────────
const S = {
  name: '',
  color: '#6C63FF',
  peer: null,       // PeerJS instance
  conn: null,       // Active DataConnection
  roomId: '',
  isHost: false,
  peerName: '',
  peerColor: '',
  typingTimer: null,
  emojiOpen: false,
};

// ── DOM helpers ───────────────────────────────────────────
const $ = id => document.getElementById(id);
const show = id => { const el = $(id); if (el) { el.style.display = ''; el.classList.add('active'); } };
const hide = id => { const el = $(id); if (el) { el.classList.remove('active'); el.style.display = 'none'; } };

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  const el = $(id);
  el.style.display = 'flex';
  // Trigger reflow then animate
  requestAnimationFrame(() => el.classList.add('active'));
}

function getInitials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function timeNow() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function toast(msg, duration = 3000) {
  const t = $('toast');
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.display = 'none'; }, duration);
}

// ── Screen 1: Name entry ──────────────────────────────────
document.querySelectorAll('.color-dot').forEach(dot => {
  dot.addEventListener('click', () => {
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
    dot.classList.add('selected');
    S.color = dot.dataset.color;
  });
});

$('btn-continue').addEventListener('click', () => {
  const name = $('input-name').value.trim();
  if (!name) {
    $('input-name').focus();
    $('input-name').style.borderColor = '#FF4444';
    setTimeout(() => $('input-name').style.borderColor = '', 1500);
    return;
  }
  S.name = name;
  $('user-greeting').innerHTML = `Welcome, <strong>${name}</strong>! 👋  What would you like to do?`;
  showScreen('screen-lobby');
});

$('input-name').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-continue').click(); });

// ── Screen 2: Lobby ───────────────────────────────────────

// CREATE ROOM
$('btn-create-room').addEventListener('click', () => {
  $('btn-create-room').textContent = 'Creating...';
  $('btn-create-room').disabled = true;

  // Generate a short readable room ID
  const roomId = generateRoomId();
  S.roomId = roomId;
  S.isHost = true;

  initPeer(roomId);
});

// JOIN ROOM
$('btn-join-room').addEventListener('click', joinRoom);
$('input-room-code').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });

function joinRoom() {
  const code = $('input-room-code').value.trim().toUpperCase();
  if (!code) {
    $('input-room-code').focus();
    $('input-room-code').style.borderColor = '#FF4444';
    setTimeout(() => $('input-room-code').style.borderColor = '', 1500);
    return;
  }
  S.roomId = code;
  S.isHost = false;
  $('btn-join-room').textContent = 'Joining...';
  $('btn-join-room').disabled = true;

  // Create peer with random ID, then connect to host
  initPeer(null, code);
}

// Generate 6-char room code like "XK9P2M"
function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = 'PM-';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// ── PeerJS init ───────────────────────────────────────────
function initPeer(peerId, hostId = null) {
  const opts = {
    debug: 0,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]
    }
  };

  if (peerId) {
    S.peer = new Peer(peerId, opts);
  } else {
    S.peer = new Peer(opts); // random ID for joiner
  }

  S.peer.on('open', (id) => {
    console.log('My PeerID:', id);

    if (S.isHost) {
      // HOST: Show waiting screen
      const shareUrl = buildShareUrl(S.roomId);
      $('share-link-display').textContent = shareUrl;
      $('room-code-display').textContent = S.roomId;
      showScreen('screen-waiting');

      // Set up copy button
      $('btn-copy-link').onclick = () => copyText(shareUrl);

      // Wait for incoming connection
      S.peer.on('connection', conn => {
        S.conn = conn;
        setupConnection(conn);
      });

    } else {
      // JOINER: Connect to host
      const conn = S.peer.connect(hostId, { reliable: true, metadata: { name: S.name, color: S.color } });
      S.conn = conn;
      setupConnection(conn);
    }
  });

  S.peer.on('error', (err) => {
    console.error('Peer error:', err);
    if (err.type === 'peer-unavailable') {
      toast('❌ Room not found. Check the code and try again.');
    } else {
      toast('⚠️ Connection error: ' + err.type);
    }
    $('btn-join-room').textContent = 'Join';
    $('btn-join-room').disabled = false;
    $('btn-create-room').textContent = 'Create Room 🔗';
    $('btn-create-room').disabled = false;
  });

  S.peer.on('disconnected', () => {
    toast('⚠️ Disconnected from server. Trying to reconnect...');
    setTimeout(() => { if (S.peer && !S.peer.destroyed) S.peer.reconnect(); }, 2000);
  });
}

function buildShareUrl(roomId) {
  // Build URL with room code as query param so friend can auto-join
  const base = window.location.href.split('?')[0];
  return `${base}?room=${roomId}`;
}

// ── Connection setup ──────────────────────────────────────
function setupConnection(conn) {
  conn.on('open', () => {
    console.log('Connection open!');

    // Exchange handshake
    conn.send({ type: 'handshake', name: S.name, color: S.color });

    // Transition to chat
    openChatScreen();
  });

  conn.on('data', (data) => {
    handleData(data);
  });

  conn.on('close', () => {
    showDisconnectedBanner();
    $('peer-status').textContent = '● Disconnected';
    $('peer-status').style.color = '#FF4444';
  });

  conn.on('error', (err) => {
    console.error('Connection error:', err);
    toast('⚠️ Connection issue. Please refresh.');
  });
}

function handleData(data) {
  if (!data || !data.type) return;

  switch (data.type) {
    case 'handshake':
      S.peerName = data.name;
      S.peerColor = data.color;
      $('peer-name-display').textContent = data.name;
      $('peer-avatar').textContent = getInitials(data.name);
      $('peer-avatar').style.background = data.color;
      $('system-join-msg').textContent = `🎉 ${data.name} joined the chat!`;
      break;

    case 'message':
      receiveMessage(data.text, data.time);
      break;

    case 'typing':
      showTyping(data.typing);
      break;
  }
}

// ── Chat Screen ───────────────────────────────────────────
function openChatScreen() {
  showScreen('screen-chat');

  // Header
  $('header-room-code').textContent = S.roomId;

  // Share invite button
  $('btn-invite').addEventListener('click', () => {
    const url = buildShareUrl(S.roomId);
    $('modal-share-link').textContent = url;
    $('share-modal').style.display = 'flex';
    $('modal-copy-btn').onclick = () => copyText(url);
  });
  $('close-share-modal').onclick = () => { $('share-modal').style.display = 'none'; };
  $('share-modal').addEventListener('click', e => { if (e.target === $('share-modal')) $('share-modal').style.display = 'none'; });

  // If we know peer name already (joiner side, host accepted)
  if (S.peerName) {
    $('peer-name-display').textContent = S.peerName;
    $('peer-avatar').textContent = getInitials(S.peerName);
    $('peer-avatar').style.background = S.peerColor;
  }

  // Input
  const msgInput = $('msg-input');
  const btnSend = $('btn-send');

  msgInput.addEventListener('input', () => {
    btnSend.disabled = msgInput.value.trim() === '';
    // Auto-resize
    msgInput.style.height = 'auto';
    msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
    // Typing indicator
    sendTyping(true);
    clearTimeout(S.typingTimer);
    S.typingTimer = setTimeout(() => sendTyping(false), 2000);
  });

  msgInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!btnSend.disabled) doSend();
    }
  });

  btnSend.addEventListener('click', doSend);

  // Emoji
  EMOJIS.forEach(em => {
    const btn = document.createElement('button');
    btn.className = 'e-btn';
    btn.textContent = em;
    btn.addEventListener('click', () => {
      msgInput.value += em;
      btnSend.disabled = false;
      msgInput.focus();
    });
    $('emoji-grid').appendChild(btn);
  });

  $('emoji-toggle').addEventListener('click', e => {
    e.stopPropagation();
    S.emojiOpen = !S.emojiOpen;
    $('emoji-panel').style.display = S.emojiOpen ? 'block' : 'none';
  });

  document.addEventListener('click', e => {
    if (S.emojiOpen && !$('emoji-panel').contains(e.target) && e.target !== $('emoji-toggle')) {
      S.emojiOpen = false;
      $('emoji-panel').style.display = 'none';
    }
  });
}

function doSend() {
  const input = $('msg-input');
  const text = input.value.trim();
  if (!text || !S.conn) return;

  const time = timeNow();
  // Render own message
  appendMessage({ type: 'sent', text, time });

  // Send to peer
  try {
    S.conn.send({ type: 'message', text, time });
  } catch (e) {
    toast('⚠️ Failed to send. Are you still connected?');
  }

  input.value = '';
  input.style.height = 'auto';
  $('btn-send').disabled = true;
  sendTyping(false);
}

function receiveMessage(text, time) {
  appendMessage({ type: 'recv', text, time: time || timeNow() });
  // Hide typing
  showTyping(false);
}

function appendMessage({ type, text, time }) {
  const msgs = $('messages');

  const row = document.createElement('div');
  row.className = `msg-row ${type}`;

  const isRecv = type === 'recv';
  const name = isRecv ? S.peerName : S.name;
  const color = isRecv ? S.peerColor : S.color;

  row.innerHTML = `
    ${isRecv ? `<div class="msg-av" style="background:${color}">${getInitials(name)}</div>` : ''}
    <div class="bubble">
      ${escapeHtml(text)}
      <span class="ts">${time}</span>
    </div>
  `;

  msgs.appendChild(row);
  msgs.scrollTop = msgs.scrollHeight;
}

function escapeHtml(text) {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function sendTyping(isTyping) {
  if (S.conn && S.conn.open) {
    try { S.conn.send({ type: 'typing', typing: isTyping }); } catch(e) {}
  }
}

function showTyping(show) {
  const row = $('typing-row');
  const label = $('typing-label');
  if (show) {
    label.textContent = `${S.peerName || 'Friend'} is typing...`;
    row.style.display = 'flex';
    $('messages').scrollTop = $('messages').scrollHeight;
  } else {
    row.style.display = 'none';
  }
}

function showDisconnectedBanner() {
  const banner = document.createElement('div');
  banner.className = 'disconnected-banner';
  banner.textContent = '⚠️ Your friend disconnected. Refresh the page to start a new chat.';
  document.querySelector('.chat-layout').insertBefore(banner, $('messages').nextSibling);
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    toast('✅ Link copied! Send it to your friend.');
  }).catch(() => {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('✅ Link copied!');
  });
}

// ── Auto-join from URL param ──────────────────────────────
function checkAutoJoin() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  if (room) {
    // Pre-fill the join field and show a hint
    const inp = $('input-room-code');
    if (inp) {
      inp.value = room;
      // Show auto-join hint on lobby screen
      window._autoJoinRoom = room;
    }
  }
}

// After name is entered and lobby shown, auto-trigger join if URL had room param
const origContinue = $('btn-continue').onclick;
$('btn-continue').addEventListener('click', () => {
  setTimeout(() => {
    if (window._autoJoinRoom) {
      $('input-room-code').value = window._autoJoinRoom;
      toast(`🔗 Room code detected: ${window._autoJoinRoom}`);
    }
  }, 100);
});

// ── Init ──────────────────────────────────────────────────
checkAutoJoin();
showScreen('screen-name');
console.log('🚀 PingMe Real-Time loaded!');
