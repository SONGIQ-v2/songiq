# Scoring & Leaderboard

## Points Calculation

**File:** `src/lib/spotify.ts` → `calculatePoints()`

```typescript
function calculatePoints(isCorrect: boolean, answerTimeMs: number, maxTimeMs: number): number {
  if (!isCorrect) return 0;
  
  const basePoints = 100;
  const timeBonus = Math.floor(((maxTimeMs - answerTimeMs) / maxTimeMs) * 100);
  
  return basePoints + Math.max(0, timeBonus);
}
```

### Formula Breakdown

| Component | Value | Description |
|---|---|---|
| Base Points | 100 | Awarded for any correct answer |
| Time Bonus | 0–100 | Linear decay based on response time |
| Wrong Answer | 0 | No points for incorrect answers |
| **Max Possible** | **200** | Correct + instant answer |

### Time Bonus Curve

```
Points
200 ┤ ●
    │  ╲
150 ┤   ╲
    │    ╲
100 ┤─────●─── (base only at max time)
    │
  0 ┤ (wrong answer)
    └──────────────── Time →
    0s              max_time
```

The bonus is perfectly linear: answering at 50% of the allowed time yields a 50-point bonus.

### Score Storage

- **Solo mode**: Stored in Zustand (`soloScore`), persists only during the session
- **Multiplayer**: Stored in `room_players.score` (cumulative) and `player_answers.points_earned` (per-round)

## Leaderboard

**File:** `src/components/Leaderboard.tsx`

### Sorting

Players are sorted by descending score:
```typescript
const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
```

### Rank Change Tracking

Each player carries two rank properties:

| Property | Description |
|---|---|
| `previousRank` | Rank before the latest score update |
| `currentRank` | Rank after the latest score update |

Rank change is computed per-render:
```typescript
const getRankChange = (player) => {
  if (currentRank < previousRank) return "up";    // moved up
  if (currentRank > previousRank) return "down";  // moved down
  return "same";                                   // unchanged
};
```

### Visual Indicators

| Rank Change | Icon | Color |
|---|---|---|
| ↑ Up | `TrendingUp` | Green |
| ↓ Down | `TrendingDown` | Red |
| — Same | `Minus` | Muted |

### Rank Colors

| Position | Color |
|---|---|
| 1st | Gold (`text-yellow-400`) |
| 2nd | Silver (`text-gray-300`) |
| 3rd | Bronze (`text-amber-600`) |

### Animated Layout

The leaderboard uses Framer Motion's `layout` animation:

```tsx
<AnimatePresence mode="popLayout">
  {sortedPlayers.map((player) => (
    <motion.div
      key={player.player_id}
      layout
      transition={{
        type: "spring",
        stiffness: 500,
        damping: 30,
        layout: { duration: 0.4 },
      }}
    />
  ))}
</AnimatePresence>
```

When scores change and players swap positions, the rows physically animate to their new positions with a spring-based transition. This creates a satisfying "shuffle" effect.

### Round Score Display

During gameplay (`showRoundScore = true`):
- A checkmark badge appears next to players who have answered
- A `+N` green label shows points earned in the current round
- Both animate in with scale/fade transitions

### Compact Mode

The `compact` prop reduces padding for use in the results screen where space is limited.

## Answer Indicators

During an active round, the leaderboard shows who has answered:

```tsx
{player.hasAnswered && (
  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
    <Check className="w-3 h-3 text-primary" />
  </motion.div>
)}
```

This creates competitive pressure — players can see when opponents have locked in their answers.
