# Gioco dell'Oca online — PUB / BAR / OSTERIA

## Come avviarlo
1. Installa Node.js (se non l'hai già)
2. Apri il terminale nella cartella del progetto
3. Esegui:
   ```
   npm install
   npm start
   ```
4. Apri il browser su http://localhost:3000

## Come funziona
- 3 stanze fisse: PUB, BAR (gratuite) e OSTERIA (premium, protetta da un codice
  di sblocco temporaneo: `OSTERIA2026`, da sostituire con un vero sistema di
  pagamento quando un adulto potrà attivare un account come Stripe/PayPal)
- Massimo 4 giocatori a stanza, la partita parte automaticamente a stanza piena
- Chat in tempo reale sia in attesa sia durante la partita
- Tabellone classico a 63 caselle con oche, ponte, locanda, pozzo, labirinto,
  prigione e morte

## File principali
- `server.js` — server Node.js + Socket.IO (stanze, chat, turni)
- `game-logic.js` — regole del gioco dell'oca (mosse, caselle speciali)
- `public/index.html`, `public/style.css`, `public/client.js` — interfaccia

## Prossimi passi suggeriti
- Sostituire il codice di sblocco di OSTERIA con un vero pagamento (serve un
  account intestato a un adulto)
- Aggiungere un sistema di login/nickname persistente
- Deploy online (es. Render o Railway) per renderlo accessibile da internet
