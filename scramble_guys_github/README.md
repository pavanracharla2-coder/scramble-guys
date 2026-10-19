# Scramble Guys

A real-time multiplayer drawing board with a redesigned UI and a persistent light/dark mode toggle.

## Run locally
1. Install Node.js 18 or newer.
2. Open a terminal in this folder.
3. Run `npm install`.
4. Run `npm start`.
5. Visit `http://localhost:3000`.

To test multiplayer, open the site in two browser tabs. Create a room in one tab and enter its six-character code in the other.

## Features
- Six-character room codes
- Live drawing updates with Socket.IO
- Pen, eraser, six colors, adjustable brush size
- Shared clear-board action and live player list
- Responsive UI and light/dark mode toggle (theme preference saved in browser)

## Deploy
Deploy as a persistent Node.js web service with WebSocket support. This Express + Socket.IO server should not be configured as a standard serverless function. Use `npm start` as the start command.

## Limitations
Room data is held in memory and is cleared when the server restarts. Anyone with a room code can draw and clear the board. Do not use room codes for sensitive content.


## Draw & Guess word game
- Start a multiplayer word round with at least two players in a room.
- The server privately sends the randomly generated word only to the current drawer.
- Other players type guesses within 60 seconds.
- Correct guess: +10 points for the guesser and +5 for the drawer.
- The drawing role rotates between rounds, and the scoreboard is visible to everyone.
- During a round, only the drawer can draw; guesses are checked on the server.
