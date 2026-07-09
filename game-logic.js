// Logica del Gioco dell'Oca - tabellone classico a 63 caselle

const BOARD_SIZE = 63;

// Caselle speciali (numerazione classica italiana)
const SPECIAL_SQUARES = {
  6: { type: 'ponte', target: 12, label: 'Ponte' },
  19: { type: 'locanda', label: 'Locanda (perdi un turno)' },
  31: { type: 'pozzo', label: 'Pozzo (fermo finché non arriva un altro)' },
  42: { type: 'labirinto', target: 30, label: 'Labirinto' },
  52: { type: 'prigione', label: 'Prigione (fermo 3 turni)' },
  58: { type: 'morte', target: 1, label: 'Morte (si ricomincia)' },
};

const OCA_SQUARES = new Set([9, 18, 27, 36, 45, 54]);

function isOca(pos) {
  return OCA_SQUARES.has(pos);
}

function rollDice() {
  return Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
}

// Applica il movimento e gli effetti delle caselle speciali a un giocatore.
// player: { position, skipTurn, inPrisonTurns, inWell }
// Ritorna un log di eventi testuali da mostrare in chat/partita.
function movePlayer(player, diceValue) {
  const events = [];
  let newPos = player.position + diceValue;

  if (newPos > BOARD_SIZE) {
    // Rimbalzo: si torna indietro dell'eccedenza
    newPos = BOARD_SIZE - (newPos - BOARD_SIZE);
    events.push(`rimbalza ed arriva alla casella ${newPos}`);
  }

  player.position = newPos;

  // Effetto oca: si ripete il tiro raddoppiando lo spostamento
  let chainGuard = 0;
  while (isOca(player.position) && player.position !== BOARD_SIZE && chainGuard < 10) {
    events.push(`casella dell'oca (${player.position})! Rilancia`);
    player.position += diceValue;
    if (player.position > BOARD_SIZE) {
      player.position = BOARD_SIZE - (player.position - BOARD_SIZE);
    }
    chainGuard++;
  }

  const special = SPECIAL_SQUARES[player.position];
  if (special) {
    switch (special.type) {
      case 'ponte':
        events.push(`Ponte! Salta avanti alla casella ${special.target}`);
        player.position = special.target;
        break;
      case 'locanda':
        events.push('Finisce alla Locanda: salta il prossimo turno');
        player.skipTurn = true;
        break;
      case 'pozzo':
        events.push('Cade nel Pozzo: resta fermo finché un altro giocatore non lo raggiunge');
        player.inWell = true;
        break;
      case 'labirinto':
        events.push(`Labirinto! Torna alla casella ${special.target}`);
        player.position = special.target;
        break;
      case 'prigione':
        events.push('Finisce in Prigione: fermo per 3 turni');
        player.inPrisonTurns = 3;
        break;
      case 'morte':
        events.push('Casella della Morte! Si ricomincia dalla casella 1');
        player.position = special.target;
        break;
    }
  }

  if (player.position === BOARD_SIZE) {
    events.push('Ha raggiunto la casella 63: VINCITORE!');
  }

  return events;
}

module.exports = {
  BOARD_SIZE,
  SPECIAL_SQUARES,
  OCA_SQUARES,
  isOca,
  rollDice,
  movePlayer,
};
