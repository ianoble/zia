# Xia: Legends of a Drift System (online)

Vue client and boardgame.io game logic for **Xia: Legends of a Drift System**, built on [@noble/bg-engine](../noble-bg-engine) the same way as Western Legends, Crown Duels and The Golden Ages. Server game id: `zia`.

## Prereqs

- `noble-bg-engine` checked out next to this folder (`../noble-bg-engine`).
- Build the engine server from `noble-bg-engine`. Its `build-external-games` step bundles `game-zia.js` from this repo's `src/logic/index.ts`. Set `ZIA_PATH` to use a different checkout location.

```bash
cd ../noble-bg-engine
npm run build -w packages/engine
npm run build -w packages/server
npm start -w packages/server
```

## Dev

```bash
npm install
npm run dev
```

### `VITE_SERVER_URL`

The client talks to the server over HTTP and Socket.IO at `SERVER_URL` (see `src/config.ts`; default `http://localhost:8000`). If the server runs elsewhere, set e.g. `VITE_SERVER_URL=http://localhost:3000` before `npm run dev`, and restart Vite after changing it.

## Layout

- `src/logic/`: game rules (boardgame.io `Game` + `defineGame`), shared by the client and the server bundle.
- `src/views/`: lobby, join link and in-game views.
- `src/components/`: game UI.
- `public/`: board and card art.

## Tests

```bash
npm test
```
