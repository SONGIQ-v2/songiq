/**
 * Title, description and link-preview text for every page search engines
 * should index -- the single source for both:
 *  - <PageSeo> (src/components/PageSeo.tsx), which sets them in the browser,
 *  - the build step in vite.config.ts, which writes a copy of index.html per
 *    page (dist/daily.html, ...) with these tags already in place, so
 *    crawlers and link previews that don't run JavaScript (WhatsApp, X,
 *    Facebook, most SEO tools) see the right text instead of the homepage's.
 *
 * Kept free of imports so vite.config.ts can load it at build time.
 */

export const SITE_URL = "https://songiq.io";

export interface PageSeoEntry {
  title: string;
  description: string;
  /** Link-preview (og:/twitter:) title; defaults to `title`. */
  ogTitle?: string;
  /** Link-preview description; defaults to `description`. */
  ogDescription?: string;
}

export const SEO_PAGES: Record<string, PageSeoEntry> = {
  "/": {
    title: "SongIQ: Guess the Song Music Quiz Game",
    description:
      "Play SongIQ, the guess-the-song music quiz. Challenge friends in multiplayer across Afrobeats, Pop, Hip-Hop and more. Free online.",
    ogTitle: "SongIQ: Guess the Song & Music Quiz Game",
    ogDescription:
      "Think you know music? Play SongIQ and guess songs from Afrobeats, Pop, Hip-Hop & more. Challenge friends in real-time multiplayer!",
  },
  "/solo": {
    title: "Solo Play: Pick a Playlist & Start the Quiz | SongIQ",
    description:
      "Play SongIQ solo. Pick a genre (Afrobeats, Amapiano, Hip-Hop, Pop and more) and guess the song or artist in 15 seconds.",
    ogTitle: "SongIQ Solo Play: Pick a Playlist & Start the Quiz",
    ogDescription: "Play SongIQ solo. Pick a genre and guess the song or artist in 15 seconds.",
  },
  "/multiplayer": {
    title: "Multiplayer Music Quiz: Play with Friends Live | SongIQ",
    description:
      "Create or join a SongIQ multiplayer room. Up to 25 players, live scoring and a shareable link. Race friends to guess the song first.",
    ogTitle: "SongIQ Multiplayer: Music Quiz with Friends",
    ogDescription: "Up to 25 players, live scoring. Create a room, share the link, settle the group chat.",
  },
  "/daily": {
    title: "Daily Music Challenge | SongIQ",
    description:
      "One music quiz a day, with the same 10 songs for everyone. Play today's SongIQ Daily Challenge, keep your streak alive and climb the leaderboard.",
    ogDescription: "Same 10 songs for everyone, once a day. Can you top today's leaderboard?",
  },
  "/challenges": {
    title: "Active Challenges | SongIQ",
    description:
      "Browse live SongIQ challenges from real players. Pick one, beat their score, and see if you can top the leaderboard.",
  },
  "/leaderboard": {
    title: "Global Leaderboard | SongIQ",
    description: "SongIQ's global leaderboard: top players by time played and Points across every game mode.",
  },
  "/how-it-works": {
    title: "How It Works | SongIQ",
    description:
      "How SongIQ works: hear a 15-second clip, pick the song or artist, and score up to 200 points for speed. Solo, Daily Challenge, Multiplayer and Challenge links explained.",
  },
  "/privacy": {
    title: "Privacy Policy | SongIQ Music Quiz",
    description:
      "How SongIQ collects, uses, and protects your data, including our limited use of Google API services.",
    ogTitle: "Privacy Policy | SongIQ",
    ogDescription: "How SongIQ collects, uses, and protects your data.",
  },
  "/guess-the-song-game": {
    title: "Guess the Song Game: Free Online Music Quiz | SongIQ",
    description:
      "Play the ultimate guess the song game online. Listen to short clips, name the track in seconds, and challenge friends in multiplayer. Free, no signup.",
  },
  "/guess-the-artist-game": {
    title: "Guess the Artist Game: Name the Musician | SongIQ",
    description:
      "Play the guess the artist game free. Hear a clip, name the artist behind the track. Solo and multiplayer modes, Afrobeats to Hip-Hop. No signup.",
  },
  "/song-quiz-online": {
    title: "Song Quiz Online: Free Music Trivia | SongIQ",
    description:
      "The best song quiz online. Play instantly in your browser, no download, no signup. Afrobeats, Hip-Hop, Pop & more. Solo or multiplayer.",
  },
  "/music-quiz-multiplayer": {
    title: "Music Quiz Multiplayer: Play with Friends Live | SongIQ",
    description:
      "Music quiz multiplayer for friends and family. Create a room, share the link, race live to guess songs and artists. Free, web-based, no signup.",
  },
  "/heardle-alternative": {
    title: "Heardle Alternative: Unlimited Music Quiz | SongIQ",
    description:
      "Looking for a Heardle alternative? SongIQ gives you unlimited rounds, multiplayer with friends, and playlists from Afrobeats to Pop. Free, no signup.",
  },
  "/afrobeats-quiz": {
    title: "Afrobeats Quiz: Name the Song & Artist Game | SongIQ",
    description:
      "The ultimate Afrobeats quiz. Hear a clip, name the song or artist: Burna Boy, Wizkid, Tems, Davido and more. Solo or multiplayer. Free.",
  },
  "/amapiano-quiz": {
    title: "Amapiano Quiz: Name the Track Game | SongIQ",
    description:
      "The first proper Amapiano quiz online. Hear a log drum, name the song or artist: Kabza, Maphorisa, Tyler ICU, Uncle Waffles & more. Free.",
  },
  "/african-music-quiz": {
    title: "African Music Quiz: Afrobeats & Amapiano | SongIQ",
    description:
      "The African music quiz built for real fans. Afrobeats, Amapiano, Highlife and Bongo Flava. Hear a clip, name the song or artist. Free, multiplayer.",
  },
};

export type SeoPath = keyof typeof SEO_PAGES;

/** The tags both PageSeo and the build step write, resolved from an entry. */
export function resolvePageSeo(path: string) {
  const entry = SEO_PAGES[path];
  if (!entry) throw new Error(`No SEO entry for ${path}`);
  const ogTitle = entry.ogTitle ?? entry.title;
  const ogDescription = entry.ogDescription ?? entry.description;
  return {
    title: entry.title,
    description: entry.description,
    canonical: path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`,
    ogTitle,
    ogDescription,
  };
}
