# Music Catalogue & Track Fetching

## Architecture

```
Client (useAppleMusic) ──▶ Edge Function (apple-music) ──▶ iTunes Search API
```

All music data comes from the iTunes Search API, proxied through a Supabase Edge Function to avoid CORS issues and keep implementation details server-side.

## Playlist System

**File:** `src/lib/playlists.ts`

### Data Model

```typescript
interface Playlist {
  id: string;           // URL-safe identifier
  name: string;         // Display name
  description: string;  // Short tagline
  image: string;        // Fetched at runtime from API
  searchTerms: string[]; // Artist/song names to search
}
```

### Available Playlists

| ID | Name | Region | Track Count (search terms) |
|---|---|---|---|
| `afrobeats-chill` | Afrobeats & Chill | Nigeria/West Africa | 48 artists |
| `amapiano-hits` | Amapiano Hits | South Africa | 36 artists |
| `naija-throwback` | Naija Throwback | Nigeria (classic) | 41 artists |
| `afro-classics` | Afro Classics | Pan-African legends | 31 artists |
| `east-africa-vibes` | East Africa Vibes | Tanzania/Kenya | 35 artists |
| `ghana-sounds` | Ghana Sounds | Ghana | 36 artists |

### How Search Terms Work

Each playlist contains 30–48 artist or song names. When a game starts:

1. The Edge Function receives the search terms array
2. For each term, it queries iTunes Search API: `https://itunes.apple.com/search?term={term}&media=music&limit=3`
3. Results are filtered to only include tracks with a `previewUrl` (30-second audio clip)
4. Tracks are deduplicated by `trackId`
5. The combined list is returned to the client

## Track Data Structure

```typescript
interface AppleMusicTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl100: string;     // 100x100 album art
  previewUrl: string;        // 30-second audio preview URL
  trackTimeMillis: number;
  primaryGenreName: string;
}
```

## Quiz Option Generation

### Solo Mode (`src/pages/Game.tsx`)

```typescript
function generateOptionsFromTracks(
  correctTrack: AppleMusicTrack,
  allTracks: AppleMusicTrack[],
  questionType: QuestionType,
  optionCount: number = 4
): string[]
```

Algorithm:
1. Extract the correct answer (artist name or track name, based on question type)
2. Collect all other tracks' corresponding field (artist/track name)
3. Filter out duplicates of the correct answer
4. Deduplicate remaining options
5. Shuffle and take `optionCount - 1` distractors
6. Combine with correct answer and shuffle the final array

### Multiplayer Mode (`src/hooks/useMultiplayerGame.ts`)

Same logic but executed on the host's client before inserting the round:
- Options are serialised as JSON and stored in `game_rounds.options`
- All clients receive identical options via Realtime

## Question Types

Each round randomly selects one of two question types:

| Type | Prompt | Correct Answer | Distractors |
|---|---|---|---|
| `"Guess the Artist"` | 🎤 Guess the Artist | `track.artistName` | Other artists from the playlist |
| `"Guess the Song"` | 🎵 Guess the Song | `track.trackName` | Other song names from the playlist |

Selection is 50/50 random: `Math.random() > 0.5 ? "artist" : "song"`

## Track Shuffling

### Solo Mode
Tracks are shuffled once at game start using Fisher-Yates shuffle. Each round uses the track at index `round - 1`, ensuring no repeats.

### Multiplayer Mode
Uses a custom Fisher-Yates implementation:
```typescript
const shuffleArray = <T,>(arr: T[]): T[] => {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};
```

## Playlist Image Loading

In the lobby, playlist card images are fetched asynchronously:
1. For each playlist, `getPlaylistTracks` is called with `limit=5`
2. The `playlistImage` field from the response (first track's artwork) is stored
3. Images load progressively as API calls complete

## Audio Playback

- Audio uses the HTML5 `<audio>` element via `new Audio(previewUrl)`
- Volume defaults to 0.7 (70%)
- Mute toggle sets volume to 0 without pausing
- Audio starts on `canplay` event with a 1-second fallback timeout
- Audio is paused and cleaned up on round change, unmount, or game end
