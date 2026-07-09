const socket = io();

const BOARD_SIZE = 63;
const COLS = 9;
const PLAYER_COLORS = ['#a83232', '#2f6fa8', '#3a8a4a', '#a87c2f'];

const SPECIAL = {
  6: { cls: 'ponte', icon: '🌉' },
  9: { cls: 'oca', icon: '🪿' },
  18: { cls: 'oca', icon: '🪿' },
  19: { cls: 'locanda', icon: '🛏️' },
  27: { cls: 'oca', icon: '🪿' },
  31: { cls: 'pozzo', icon: '🕳️' },
  36: { cls: 'oca', icon: '🪿' },
  42: { cls: 'labirinto', icon: '🌀' },
  45: { cls: 'oca', icon: '🪿' },
  52: { cls: 'prigione', icon: '🔒' },
  54: { cls: 'oca', icon: '🪿' },
  58: { cls: 'morte', icon: '💀' },
};

let myName = '';
let currentRoomId = null;
let pendingPremiumRoom = null;

const screenRooms = document.getElementById('screen-rooms');
const screenGame = document.getElementById('screen-game');
const roomsGrid = document.getElementById('rooms-grid');
const nameInput = document.getElementById('player-name');
const unlockBox = document.getElementById('unlock-box');
const unlockInput = document.getElementById('unlock-code');
const roomError = document.getElementById('room-error');

const boardEl = document.getElementById('board');
const roomTitle = document.getElementById('room-title');
const roomStatus = document.getElementById('room-status');
const rollBtn = document.getElementById('roll-btn');
const turnIndicator = document.getElementById('turn-indicator');
const playersList = document.getElementById('players-list');
const chatLog = document.getElementById('chat-log');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const leaveBtn = document.getElementById('leave-btn');

// --- Costruzione tabellone a serpentina (9 colonne) --------------------
function buildBoard() {
  boardEl.innerHTML = '';
  const rows = Math.ceil(BOARD_SIZE / COLS);
  boardEl.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

  for (let n = 1; n <= BOARD_SIZE; n++) {
    const rowFromBottom = Math.floor((n - 1) / COLS);
    const row = rows - 1 - rowFromBottom;
    const posInRow = (n - 1) % COLS;
    const col = rowFromBottom % 2 === 0 ? posInRow : COLS - 1 - posInRow;

    const sq = document.createElement('div');
    sq.className = 'square';
    sq.id = `sq-${n}`;
    sq.style.gridRow = row + 1;
    sq.style.gridColumn = col + 1;

    if (n === 1) sq.classList.add('start');
    if (n === BOARD_SIZE) sq.classList.add('finish');
    const special = SPECIAL[n];
    if (special) sq.classList.add(special.cls);

    sq.innerHTML = `<span class="num">${n}</span>${special ? `<span class="icon">${special.icon}</span>` : ''}<div class="token-row" id="tokens-${n}"></div>`;
    boardEl.appendChild(sq);
  }
}
buildBoard();

// --- Schermata stanze ----------------------------------------------------
socket.on('rooms-summary', (rooms) => {
  roomsGrid.innerHTML = '';
  rooms.forEach((r) => {
    const card = document.createElement('div');
    card.className = 'room-card' + (r.premium ? ' premium' : '') + (r.players >= r.maxPlayers ? ' full' : '');
    card.innerHTML = `
      <h3>${r.name}</h3>
      ${r.premium ? '<span class="tag">Premium</span>' : ''}
      <div class="occupancy">${r.players}/${r.maxPlayers} giocatori</div>
      <div class="status-line">${statusLabel(r.status)}</div>
    `;
    card.addEventListener('click', () => attemptJoin(r));
    roomsGrid.appendChild(card);
  });
});

function statusLabel(status) {
  if (status === 'playing') return 'partita in corso';
  if (status === 'finished') return 'si sta resettando';
  return 'in attesa di giocatori';
}

function attemptJoin(room) {
  roomError.textContent = '';
  myName = nameInput.value.trim() || 'Giocatore';
  if (room.players >= room.maxPlayers) {
    roomError.textContent = 'Questa stanza è piena, prova un\'altra.';
    return;
  }
  if (room.premium) {
    pendingPremiumRoom = room.name;
    unlockBox.classList.remove('hidden');
    return;
  }
  socket.emit('join-room', { roomId: room.name, name: myName });
}

document.getElementById('unlock-confirm').addEventListener('click', () => {
  if (!pendingPremiumRoom) return;
  socket.emit('join-room', {
    roomId: pendingPremiumRoom,
    name: myName,
    unlockCode: unlockInput.value.trim(),
  });
});
document.getElementById('unlock-cancel').addEventListener('click', () => {
  pendingPremiumRoom = null;
  unlockBox.classList.add('hidden');
});

socket.on('error-message', (msg) => {
  roomError.textContent = msg;
});

// --- Ingresso in stanza ---------------------------------------------------
socket.on('room-update', (room) => {
  currentRoomId = room.name;
  screenRooms.classList.add('hidden');
  screenGame.classList.remove('hidden');
  unlockBox.classList.add('hidden');

  roomTitle.textContent = room.name;
  roomStatus.textContent = statusLabel(room.status);
  roomStatus.className = 'pill ' + room.status;

  // token sui quadretti
  for (let n = 1; n <= BOARD_SIZE; n++) {
    const t = document.getElementById(`tokens-${n}`);
    if (t) t.innerHTML = '';
  }
  room.players.forEach((p, idx) => {
    const pos = Math.max(1, p.position || 1);
    if (p.position === 0) return;
    const container = document.getElementById(`tokens-${pos}`);
    if (container) {
      const tok = document.createElement('div');
      tok.className = 'token';
      tok.style.background = PLAYER_COLORS[idx % PLAYER_COLORS.length];
      tok.title = p.name;
      container.appendChild(tok);
    }
  });

  playersList.innerHTML = '';
  room.players.forEach((p, idx) => {
    const li = document.createElement('li');
    if (room.status === 'playing' && idx === room.turnIndex) li.classList.add('active-turn');
    let extra = '';
    if (p.inPrisonTurns > 0) extra = ' 🔒';
    if (p.skipTurn) extra = ' 🛏️';
    li.innerHTML = `<span class="dot" style="background:${PLAYER_COLORS[idx % PLAYER_COLORS.length]}"></span> ${p.name} — casella ${p.position}${extra}`;
    playersList.appendChild(li);
  });

  const me = room.players.find((p) => p.name === myName);
  const isMyTurn = room.status === 'playing' && room.players[room.turnIndex] && me && room.players[room.turnIndex].id === socket.id;
  rollBtn.disabled = !isMyTurn;

  if (room.status === 'waiting') {
    turnIndicator.textContent = `In attesa di altri giocatori (${room.players.length}/4)…`;
  } else if (room.status === 'playing') {
    const turnPlayer = room.players[room.turnIndex];
    turnIndicator.textContent = turnPlayer ? `Turno di: ${turnPlayer.name}` : '';
  } else if (room.status === 'finished') {
    turnIndicator.textContent = room.winner ? `🎉 Ha vinto ${room.winner}! Reset in corso…` : 'Partita finita';
  }
});

// --- Chat ------------------------------------------------------------
socket.on('chat-message', (msg) => {
  const line = document.createElement('div');
  line.className = 'chat-line' + (msg.system ? ' system' : '');
  line.innerHTML = msg.system
    ? msg.text
    : `<span class="who">${msg.name}:</span> ${escapeHtml(msg.text)}`;
  chatLog.appendChild(line);
  chatLog.scrollTop = chatLog.scrollHeight;
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit('chat-message', { text });
  chatInput.value = '';
});

// --- Dado e uscita -----------------------------------------------------
rollBtn.addEventListener('click', () => socket.emit('roll-dice'));

leaveBtn.addEventListener('click', () => {
  socket.emit('leave-room');
  currentRoomId = null;
  screenGame.classList.add('hidden');
  screenRooms.classList.remove('hidden');
  chatLog.innerHTML = '';
});
