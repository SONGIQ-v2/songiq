# Potential Considerations

Ideas that have been researched but not built yet. Each entry records what was
tested, what we found, and what it would take, so the decision can be picked
up later without redoing the research.

---

## Deezer as a song preview source

**Status:** Researched, deferred · **Tested:** 2026-10-05

### Why consider it
- **Faster audio loading:** Deezer previews are about half the size of iTunes previews.
- **Real playlist cover images:** today a playlist's image is borrowed from its first track.

### How Deezer works
- **No login needed:** the public API (`api.deezer.com`) needs no login for reading.
- **Edge function required:** browsers can't call the API directly because it has no CORS, so calls go through a Supabase edge function, the same as iTunes today.
- **Rate limit:** about 50 requests per 5 seconds per IP address.
- **Three ways to get songs:**
  - **Whole playlists:** `GET /playlist/{id}` returns the playlist cover and every track, with a 30-second preview for each track that has one. It works like pulling a Spotify playlist.
  - **Artist top tracks:** `GET /artist/{id}/top?limit=50`. Artist IDs are stable, the same as our current `__artist:<itunesId>` search terms, so names can't collide with song titles.
  - **Charts:** `GET /chart/{genreId}/tracks`. Genre `0` is All and genre `2` is African Music. These could replace `__chart:ng` and `__chart:us`.
- **Images:** playlists, artists and albums all come with images up to 1000×1000 (`picture_xl`, `cover_xl`).

### Test results

| | Deezer | iTunes (current) |
|---|---|---|
| Preview file size | **~469 KB** (MP3) | ~983 KB (M4A) |
| Burna Boy, Taylor Swift, Asake, Sinach, Nathaniel Bassey | 50 tracks each | 50 each |
| Midnight Crew | **3** top tracks (10 albums exist) | 50 |
| Ebenezer Obey | **9** | 50 |
| Mike Abdul | **11** | 46 |
| Preview link lifetime | **~15 minutes** | Doesn't expire |

The iTunes counts come from a name search, so they may include a few tracks where the artist is only featured.

**Playlist quality varies:**
- **Official Deezer editor playlists are good.** The Deezer Afro Editor playlists "Afro Hits" (`1440614715`), "New Afro" (`1257036831`), "Afrobeats Hits" (`3153080842`) and "AfroPop" (`1482254815`) have previews for 46–66 of their tracks.
- **Playlists made by regular users are poor.** "Naija Hits" (`1143406203`) had previews for only 91 of 400 tracks.

### The main blocker: preview links expire
Deezer preview URLs carry a signed token (`hdnea=exp=…`) and stop working after about 15 minutes.
SongIQ currently **stores preview URLs** in:
- Daily Challenge plans
- Friend challenge plans
- Multiplayer rounds

With Deezer, those stored links would be dead within minutes.

**Don't store the audio files themselves.** Deezer's terms allow streaming previews from their servers, not keeping copies, and hosting them would move the bandwidth cost onto Supabase.

**What would work instead:**
1. Store each song's **Deezer track ID**, which never changes, instead of its URL.
2. When a game starts, an edge function asks Deezer for a fresh preview link for each ID (`GET /track/{id}`).
3. The edge function shares fresh links for about 10 minutes, so a busy Daily (1,000 players) costs about 10 Deezer lookups, not 10,000. That keeps us under the rate limit.
4. A 10-song game lasts about 3–4 minutes, so links fetched at the start last the whole game. Longer multiplayer sessions would fetch links round by round.

### Options when we come back to this
1. **Covers only (low risk):** keep iTunes for audio and use Deezer only for playlist and artist images.
2. **Full switch (bigger job):** Deezer audio using track IDs and the fresh-link edge function. This changes how Daily, Challenges and Multiplayer save their song lists. Thin artists (gospel, older Nigerian acts) would need their album tracks pulled, not just top tracks.
3. **Hybrid:** Deezer for big artists and the editor playlists, iTunes as a fallback where Deezer is thin.

### Relevant code today
- `src/lib/playlists.ts`: playlist definitions and `searchTerms`
- `supabase/functions/apple-music/index.ts`, `supabase/functions/_shared/itunes.ts`: current track fetching
- [Music Catalogue & Track Fetching](./music-catalogue.md)
