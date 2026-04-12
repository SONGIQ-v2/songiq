# State Management

## Zustand Store

**File:** `src/lib/gameStore.ts`

The global state is managed by a single Zustand store (`useGameStore`) with no persistence middleware — state resets on page refresh.

### State Shape

```typescript
interface GameState {
  // Identity
  playerId: string | null;     // Supabase anonymous auth UID
  playerName: string;           // Display name
  avatarIndex: number;          // 1–8, maps to gradient color
  isInitialized: boolean;       // Auth complete flag

  // Room
  roomId: string | null;
  roomCode: string | null;
  isHost: boolean;

  // Multiplayer
  players: Player[];
  currentRound: GameRound | null;
  roundNumber: number;
  totalRounds: number;
  gameStatus: "idle" | "waiting" | "playing" | "finished";
  category: string;

  // Solo
  soloScore: number;
  soloRound: number;
}
```

### Actions

| Action | Purpose |
|---|---|
| `initializeAuth()` | Check session → sign in anonymously if needed |
| `setPlayer(name, avatarIndex)` | Set display identity |
| `setRoom(roomId, roomCode, isHost)` | Associate player with a room |
| `addSoloPoints(points)` | Increment solo score |
| `resetSoloGame()` | Reset solo score and round to 0 |
| `reset()` | Full state reset (room, players, scores) |

## Authentication Flow

```
App loads
  │
  ▼
Check existing Supabase session
  │
  ├── Session exists → use session.user.id
  │
  └── No session → signInAnonymously()
                       │
                       ▼
                  Store user.id as playerId
                  Set isInitialized = true
```

### Key Properties

- **Anonymous**: No email/password required. Zero-friction for a quiz game.
- **Persistent**: Supabase stores the session in localStorage. Returning users get the same `playerId`.
- **Idempotent**: `initializeAuth()` checks `isInitialized` to avoid duplicate calls.

## Name Persistence

Player names are stored in a browser cookie rather than the database:

```typescript
document.cookie = `songiq_username=${encodeURIComponent(name)}; path=/; max-age=${365*24*60*60}; SameSite=Lax`;
```

This allows:
- Pre-filling the name field on return visits
- Working across rooms without a profiles table
- 1-year expiry

## Component-Level State

Most game UI state lives in component `useState` hooks rather than the global store:

| State | Location | Why |
|---|---|---|
| `timeLeft`, `hasAnswered` | `useMultiplayerGame` hook | Tightly coupled to game loop lifecycle |
| `isMuted`, `isPlaying` | `MultiplayerGame` / `Game` page | UI-only, no need to share |
| `selectedCategory`, `selectedRounds` | `RoomLobby` page | Form state, synced to DB on start |
| `tracks[]` | `useMultiplayerGame` / `Game` | Large array, only needed during gameplay |

## Refs for Interval Safety

The codebase uses `useRef` extensively to avoid stale closures in `setInterval`/`setTimeout` callbacks:

| Ref | Purpose |
|---|---|
| `timerRef` | Clear round timer on answer/cleanup |
| `betweenRoundsRef` | Clear between-rounds countdown |
| `timeUpHandledRef` | Prevent duplicate time-up processing per round |
| `countdownActiveRef` | Prevent duplicate countdown intervals |
| `tracksRef` | Access current tracks in interval callbacks |
| `createRoundRef` | Access latest `createRound` function in intervals |
| `endGameRef` | Access latest `endGame` function in intervals |
