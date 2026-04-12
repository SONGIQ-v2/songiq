# Architecture Overview

## System Diagram

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────────┐
│  React SPA   │────▶│  Supabase Cloud  │────▶│  Apple Music API  │
│  (Vite/TS)   │◀────│  (Postgres + RT) │     │  (iTunes Search)  │
└──────────────┘     └──────────────────┘     └───────────────────┘
```

## Frontend

| Layer | Technology | Purpose |
|---|---|---|
| UI Framework | React 18 + TypeScript | Component rendering |
| Build Tool | Vite 5 | HMR, bundling |
| Styling | Tailwind CSS 3 | Utility-first CSS with semantic tokens |
| Animation | Framer Motion | Layout animations, transitions |
| State | Zustand 5 | Global client state (player, room, scores) |
| Routing | React Router 6 | SPA navigation |
| Data | Supabase JS SDK | DB queries, auth, realtime subscriptions |

## Backend (Serverless)

All backend logic runs on Supabase:

- **PostgreSQL** — Persistent storage for rooms, players, rounds, answers
- **Realtime** — Postgres change notifications broadcast to all clients
- **Edge Functions** — Proxy layer for Apple Music / iTunes Search API
- **Anonymous Auth** — Lightweight session identity for multiplayer

## Data Model

```
game_rooms ──┬── room_players (1:N)
             ├── game_rounds  (1:N) ──── player_answers (1:N)
             └── player_answers (1:N, denormalised room_id)
```

### Tables

| Table | Purpose |
|---|---|
| `game_rooms` | Room metadata: code, host, status, settings, timestamps |
| `room_players` | Players in a room with name, avatar, score, ready state |
| `game_rounds` | Per-round data: track info, options, question type, timestamps |
| `player_answers` | Each player's answer per round with correctness and points |

## Key Design Decisions

1. **Host-authoritative model** — Only the host creates rounds and controls game flow. This avoids race conditions from multiple clients writing rounds.
2. **Realtime + polling fallback** — Postgres realtime delivers instant updates; a 2-second polling loop catches any missed events.
3. **Edge Function proxy** — Apple Music API calls go through an Edge Function to avoid CORS and keep API details server-side.
4. **Anonymous auth** — Players authenticate anonymously via Supabase Auth. No sign-up friction; session persists across page reloads.
5. **Cookie-based name persistence** — Player nicknames are stored in a 1-year cookie (`songiq_username`) for returning users.
