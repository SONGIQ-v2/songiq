# Room Management

## Room Lifecycle

```
[Create] → waiting → playing → finished
                         ↓
                    [Play Again] → waiting (loop)
```

### Status Values

| Status | Description |
|---|---|
| `waiting` | Lobby phase — players can join, host configures settings |
| `playing` | Active game — rounds are being played |
| `finished` | All rounds complete — results screen shown |

## Room Creation

**File:** `src/pages/Multiplayer.tsx`

1. Player enters a nickname
2. Client calls `supabase.auth.signInAnonymously()` to get a `playerId`
3. A 6-character alphanumeric room code is generated (`generateRoomCode()`)
4. A `game_rooms` row is inserted with `host_id = playerId`
5. A `room_players` row is inserted with `is_host = true`
6. User is navigated to `/room/{code}`

### Room Code Generation

```
Character set: ABCDEFGHJKLMNPQRSTUVWXYZ23456789
Length: 6 characters
```

Ambiguous characters (`I`, `O`, `0`, `1`) are excluded to avoid confusion when sharing codes verbally.

## Joining a Room

Two entry points:

### 1. Manual Code Entry (`/multiplayer`)
- Player types the 6-character code
- Code is uppercased and looked up via `room_code` column
- Validates room exists and `status === 'waiting'`
- Inserts `room_players` row with `is_host = false`

### 2. Direct Link (`/room/{code}`)
- Player arrives at the lobby URL shared by the host
- If not yet in the room, a modal prompts for a nickname
- Same insert logic as manual entry
- Name is pre-filled from the `songiq_username` cookie if available

## Host Controls

Only the host (`is_host = true`) can:

| Action | Implementation |
|---|---|
| **Select category** | Updates `game_rooms.category` on start |
| **Set rounds** (5/10/15/20) | Updates `game_rooms.total_rounds` before starting |
| **Set time per round** (10/15/20/30s) | Updates `game_rooms.time_per_round` before starting |
| **Start game** | Requires ≥2 players. Loads tracks, sets status to `playing`, creates first round |
| **Play Again** | Deletes old answers/rounds, resets scores, sets status back to `waiting` |

Guest players see the current settings but cannot modify them.

## Room Termination

### Host Leaves
1. Host's `room_players` row is deleted
2. The entire `game_rooms` row is deleted (cascade deletes players, rounds, answers)
3. All remaining clients detect the deletion via:
   - **Realtime**: `DELETE` event on `game_rooms` sets `gameStatus = "terminated"`
   - **Polling fallback**: Room query returns `null`
4. Guests are redirected to `/` with toast: "The host has closed the room"

### Guest Leaves
1. Guest's `room_players` row is deleted
2. No effect on the room or other players
3. Other clients see the player disappear via realtime player list updates

## Shareable Room Links

The lobby includes a "Copy Link" button that copies `{origin}/room/{code}` to the clipboard, allowing friends to join directly without manually entering a code.

## Player Profiles

- Each player is assigned a random `avatar_index` (1–8) on join
- Avatar indices map to gradient color pairs for visual distinction
- Players can update their name mid-lobby via a profile modal
- Name changes are persisted to the cookie and DB in real-time
