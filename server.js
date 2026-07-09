const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { movePlayer, rollDice, BOARD_SIZE } = require('./game-logic');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// --- Stanze fisse -----------------------------------------------------
// OSTERIA è la stanza premium: per ora, in assenza di un vero sistema di
// pagamento (richiede un account Stripe/PayPal intestato a un adulto),
// l'accesso è protetto da un codice di sblocco placeholder.
const OSTERIA_UNLOCK_CODE = 'OSTERIA2026';
const MAX_PLAYERS = 4;

const rooms = {
  PUB: createRoom('PUB', false),
  BAR: createRoom('BAR', false),
  OSTERIA: createRoom('OSTERIA', true),
};

function createRoom(name, premium) {
  return {
    name,
    premium,
    players: [], // { id, name, position, skipTurn, inPrisonTurns, inWell }
    status: 'waiting', // waiting | playing | finished
    turnIndex: 0,
    winner: null,
  };
}

function publicRoomState(room) {
  return {
    name: room.name,
    premium: room.premium,
    status: room.status,
    turnIndex: room.turnIndex,
    winner: room.winner,
    maxPlayers: MAX_PLAYERS,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      skipTurn: p.skipTurn,
      inPrisonTurns: p.inPrisonTurns,
      inWell: p.inWell,
    })),
  };
}

function broadcastRoomsSummary() {
  const summary = Object.values(rooms).map((r) => ({
    name: r.name,
    premium: r.premium,
    status: r.status,
    players: r.players.length,
    maxPlayers: MAX_PLAYERS,
  }));
  io.emit('rooms-summary', summary);
}

function broadcastRoom(roomId) {
  io.to(roomId).emit('room-update', publicRoomState(rooms[roomId]));
}

function resetRoom(room) {
  room.players = [];
  room.status = 'waiting';
  room.turnIndex = 0;
  room.winner = null;
}

function advanceTurn(room) {
  if (room.players.length === 0) return;
  let attempts = 0;
  do {
    room.turnIndex = (room.turnIndex + 1) % room.players.length;
    const p = room.players[room.turnIndex];
    if (p.skipTurn) {
      p.skipTurn = false;
      attempts++;
      continue;
    }
    if (p.inPrisonTurns > 0) {
      p.inPrisonTurns--;
      attempts++;
      continue;
    }
    break;
  } while (attempts < room.players.length + 1);
}

io.on('connection', (socket) => {
  socket.emit(
    'rooms-summary',
    Object.values(rooms).map((r) => ({
      name: r.name,
      premium: r.premium,
      status: r.status,
      players: r.players.length,
      maxPlayers: MAX_PLAYERS,
    }))
  );

  socket.on('join-room', ({ roomId, name, unlockCode }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error-message', 'Stanza inesistente.');
    if (room.premium && unlockCode !== OSTERIA_UNLOCK_CODE) {
      return socket.emit('error-message', 'Codice di sblocco OSTERIA non valido.');
    }
    if (room.status === 'playing') {
      return socket.emit('error-message', 'Partita già in corso in questa stanza, riprova più tardi.');
    }
    if (room.players.length >= MAX_PLAYERS) {
      return socket.emit('error-message', 'Stanza piena.');
    }

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.name = (name || 'Giocatore').slice(0, 20);

    room.players.push({
      id: socket.id,
      name: socket.data.name,
      position: 0,
      skipTurn: false,
      inPrisonTurns: 0,
      inWell: false,
    });

    io.to(roomId).emit('chat-message', {
      system: true,
      text: `${socket.data.name} è entrato nella stanza ${roomId} (${room.players.length}/${MAX_PLAYERS})`,
    });

    broadcastRoom(roomId);
    broadcastRoomsSummary();

    if (room.players.length === MAX_PLAYERS && room.status === 'waiting') {
      room.status = 'playing';
      room.turnIndex = 0;
      io.to(roomId).emit('chat-message', {
        system: true,
        text: 'Stanza piena! La partita inizia ora.',
      });
      broadcastRoom(roomId);
      broadcastRoomsSummary();
    }
  });

  socket.on('chat-message', ({ text }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !text) return;
    const clean = String(text).slice(0, 300);
    io.to(roomId).emit('chat-message', {
      system: false,
      name: socket.data.name,
      text: clean,
    });
  });

  socket.on('roll-dice', () => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room || room.status !== 'playing') return;

    const currentPlayer = room.players[room.turnIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      return socket.emit('error-message', 'Non è il tuo turno.');
    }

    const dice = rollDice();
    const wasInWell = currentPlayer.inWell;
    if (wasInWell) {
      // Chi è nel pozzo aspetta che un altro lo raggiunga: qui semplifichiamo
      // liberandolo automaticamente al turno successivo.
      currentPlayer.inWell = false;
    }
    const events = movePlayer(currentPlayer, dice);

    io.to(roomId).emit('chat-message', {
      system: true,
      text: `${currentPlayer.name} tira ${dice}: ${events.length ? events.join('; ') : `avanza alla casella ${currentPlayer.position}`}`,
    });

    if (currentPlayer.position === BOARD_SIZE) {
      room.status = 'finished';
      room.winner = currentPlayer.name;
      io.to(roomId).emit('chat-message', {
        system: true,
        text: `🎉 ${currentPlayer.name} ha vinto la partita! La stanza si resetta tra poco.`,
      });
      broadcastRoom(roomId);
      broadcastRoomsSummary();
      setTimeout(() => {
        resetRoom(room);
        broadcastRoom(roomId);
        broadcastRoomsSummary();
      }, 8000);
      return;
    }

    advanceTurn(room);
    broadcastRoom(roomId);
  });

  socket.on('leave-room', () => leaveCurrentRoom(socket));
  socket.on('disconnect', () => leaveCurrentRoom(socket));

  function leaveCurrentRoom(socket) {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms[roomId];
    if (!room) return;

    const idx = room.players.findIndex((p) => p.id === socket.id);
    if (idx === -1) return;
    const [left] = room.players.splice(idx, 1);
    socket.leave(roomId);
    socket.data.roomId = null;

    io.to(roomId).emit('chat-message', {
      system: true,
      text: `${left.name} ha lasciato la stanza.`,
    });

    if (room.status === 'playing' && room.players.length > 0) {
      if (room.turnIndex >= room.players.length) room.turnIndex = 0;
    }
    if (room.players.length === 0) {
      resetRoom(room);
    }

    broadcastRoom(roomId);
    broadcastRoomsSummary();
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server gioco dell'oca in ascolto sulla porta ${PORT}`);
});
