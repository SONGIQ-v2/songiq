# Multiplayer Game Engine

**File:** `src/hooks/useMultiplayerGame.ts` (~980 lines)

This is the core hook that orchestrates the entire multiplayer game flow.

## Game State Machine

```
waiting ──[startGame]──▶ playing ──[timeUp/allAnswered]──▶ between_rounds
                            ▲                                    │
                            │              [countdown=0]         │
                            └────────────────────────────────────┘
                                                                 │
                                              [lastRound]        ▼
                                                              results
```

### States

| State | Duration | What Happens |
|---|---|---|
| `waiting` | Until host starts | Lobby — players join, host configures |
| `playing` | `time_per_round` seconds | Audio plays, players select answers |
| `between_rounds` | 5 seconds | Shows correct answer, leaderboard, "Up Next" overlay |
| `results` | Until host clicks Play Again | Final leaderboard and winner announcement |
| `terminated` | — | Room deleted by host, all clients redirect home |

## Round Creation (Host Only)

```typescript
createRound(availableTracks, roundNum)
```

1. Select track at index `roundNum - 1` from pre-shuffled track array
2. Randomly pick question type: `"Guess the Artist"` or `"Guess the Song"`
3. Generate 4 answer options:
   - 1 correct answer (artist name or track name)
   - 3 distractors from other tracks in the playlist (deduplicated)
   - All 4 shuffled randomly
4. Insert `game_rounds` row with track info, options (JSON), question type
5. Update `game_rooms.current_round`

## Realtime Synchronization

The hook subscribes to a Supabase Realtime channel with 4 listeners:

| Table | Event | Action |
|---|---|---|
| `game_rooms` | `*` | Detect status changes (playing/finished/deleted) |
| `room_players` | `*` | Refetch player list, recalculate ranks |
| `game_rounds` | `INSERT` | Receive new round data, parse options, set question type |
| `player_answers` | `INSERT` | Mark player as answered, show check indicator |

### Polling Fallback

A 2-second interval polls the database for:
- Room status changes (catches missed realtime events)
- New rounds (in case `INSERT` event was lost)
- Player score updates (with change detection to avoid unnecessary re-renders)

```typescript
// Change detection for player polling
const prevScores = prev.map(p => `${p.player_id}:${p.score}:${p.is_ready}`).join(',');
const newScores = playersData.map(p => `${p.player_id}:${p.score}:${p.is_ready}`).join(',');
if (prevScores === newScores) return prev; // skip update
```

## Timer Synchronization

### Server-Authoritative Timestamps
- Each round stores `started_at` (server timestamp) in the database
- All clients calculate remaining time as: `max(0, ROUND_TIME - (now - started_at))`
- This ensures all players see approximately the same timer regardless of when they loaded

### Tab Visibility Handling
When a browser tab becomes visible again after being backgrounded:
```typescript
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const elapsed = Date.now() - new Date(currentRound.started_at).getTime();
    const remaining = Math.max(0, ROUND_TIME - elapsed);
    setTimeLeft(remaining);
  }
});
```

### Client-Side Timer
- A `setInterval` ticks every 100ms, decrementing `timeLeft` by 100
- When `timeLeft` reaches 0, a separate effect handles the time-up logic
- The `timeUpHandledRef` prevents duplicate processing

## Early Round Completion

If all players answer before the timer expires, the round ends early:

1. **Realtime detection**: Each `player_answers` INSERT triggers a check — if every player in `players[]` has `hasAnswered = true`, skip to `between_rounds`
2. **Polling fallback**: Every 1.5 seconds, query `player_answers` for the current round. If `answers.length >= players.length`, trigger early completion.

## Between-Rounds Flow

When entering `between_rounds`:

1. A 5-second countdown begins (`setBetweenRoundsCountdown(5)`)
2. An overlay shows the countdown circle, "Up Next" label, and next question type hint
3. **Host pre-creates the next round immediately** — this means the round data and question type are available before the countdown ends
4. At countdown = 0:
   - If it was the last round: host calls `endGame()`
   - Otherwise: reset all round state, set `gameStatus = "playing"`
5. `countdownActiveRef` prevents duplicate countdown intervals

## Answer Submission

```typescript
submitAnswer(answer: string)
```

1. Determine correctness based on question type (artist vs. song)
2. Calculate points using time-based formula
3. Set local state: `hasAnswered`, `selectedAnswer`, `isCorrect`
4. Insert `player_answers` row
5. Update `room_players.score` (cumulative)

## Inactivity Detection

**File:** `src/pages/MultiplayerGame.tsx`

- After 30 seconds of no mouse/keyboard/touch activity during gameplay, a warning modal appears
- A 10-second termination countdown begins
- If the player doesn't interact, they're automatically removed from the game
- Any user interaction resets the inactivity timer

## Play Again Flow

1. Host clicks "Play Again"
2. Delete all `player_answers` for the room
3. Delete all `game_rounds` for the room
4. Reset all `room_players` scores to 0, `is_ready` to false
5. Update `game_rooms`: status → `waiting`, reset round counters and timestamps
6. All clients detect `status = "waiting"` and navigate back to lobby
