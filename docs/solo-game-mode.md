# Solo Game Mode

**File:** `src/pages/Game.tsx`

## Overview

Solo mode is a self-contained single-player quiz with no database writes. All state is local.

## Configuration

| Setting | Value | Notes |
|---|---|---|
| Rounds | 10 | Fixed |
| Time per round | 15 seconds | Fixed |
| Countdown between rounds | 3 seconds | Fixed |
| Max score | 2,000 | 10 rounds × 200 max points |

## Game Loop

```
loading ──▶ playing ──▶ answered ──[1s delay]──▶ countdown ──▶ playing (next round)
                                                      │
                                                [round 10]
                                                      ▼
                                                   results
```

### 1. Loading Phase
- `resetSoloGame()` resets score and round counter
- `getPlaylistTracks()` fetches 50 tracks for the selected category
- Tracks are shuffled once with `Array.sort(() => Math.random() - 0.5)`
- First round starts immediately

### 2. Playing Phase
- Question type randomly chosen: `artist` or `song` (50/50)
- 4 answer options generated from the track pool
- Audio preview plays automatically
- Timer counts down from 15,000ms in 100ms intervals

### 3. Answer Phase
- Player taps an option → `handleAnswer(answer)`
- Timer stops immediately
- Points calculated using `calculatePoints()`
- Correct answer highlighted green, wrong answer highlighted red
- Album artwork revealed
- After 1 second delay, transitions to countdown

### 4. Countdown Phase
- 3-second countdown with circular progress animation
- Shows "Up Next" with the next question type hint
- Displays current track info (name + artist)
- At countdown = 0, starts next round

### 5. Results Phase
- Final score displayed with animated progress bar
- Percentage accuracy: `(score / 2000) * 100`
- Two options: "Categories" (go back to selection) or "Play Again" (same category)

## Audio Management

```typescript
// Cleanup pattern used throughout
if (audioRef.current) {
  audioRef.current.pause();
  audioRef.current.src = '';
  audioRef.current = null;
}
```

Audio is explicitly cleaned up:
- Before playing a new track
- On component unmount
- When leaving the game via the quit dialog

## Quit Confirmation

An `AlertDialog` guards the exit button:
- "Keep Playing" dismisses the dialog
- "Leave Game" calls `cleanupGame()`, resets solo state, navigates to `/solo`

## Differences from Multiplayer

| Aspect | Solo | Multiplayer |
|---|---|---|
| State storage | Local (useState/Zustand) | Database (Supabase) |
| Round creation | Client-side, instant | Host creates DB row, broadcast via Realtime |
| Timer | Client-only, 15s fixed | Server-timestamp-based, configurable |
| Leaderboard | None | Live animated sidebar |
| Between rounds | 3s countdown | 5s countdown with host pre-creating next round |
| Settings | Fixed | Host-configurable (category, rounds, time) |
