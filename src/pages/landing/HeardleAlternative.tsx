import { SeoLanding } from "@/components/SeoLanding";

const HeardleAlternative = () => (
  <SeoLanding
    path="/heardle-alternative"
    metaTitle="Heardle Alternative — Unlimited Multiplayer Music Quiz | SongIQ"
    metaDescription="Looking for a Heardle alternative? SongIQ gives you unlimited rounds, multiplayer with friends, and playlists from Afrobeats to Pop. Free, no signup."
    h1="The Heardle Alternative Worth Switching To"
    intro="Unlimited daily play. Real multiplayer. Genres beyond mainstream pop. If Heardle ran out of songs, start here."
    features={[
      { icon: "zap", title: "Unlimited Rounds", description: "No once-a-day cap — play as much as you want" },
      { icon: "users", title: "True Multiplayer", description: "Live rooms with friends, not just leaderboards" },
      { icon: "music", title: "Beyond Pop", description: "Afrobeats, Amapiano, Highlife, R&B, Hip-Hop & more" },
    ]}
    body={[
      {
        heading: "What's missing from Heardle?",
        paragraph:
          "Heardle pioneered the daily song-guess format, but the one-song-per-day cap and pop-heavy catalog leave most music fans wanting more. SongIQ keeps the addictive 'name that tune' feel and adds unlimited replay, live multiplayer rooms, and curated playlists across genres Heardle barely touches.",
      },
      {
        heading: "How SongIQ compares",
        paragraph:
          "Daily limit: Heardle has one, SongIQ has none. Multiplayer: Heardle relies on share-your-score, SongIQ has real synced rooms for up to 8 players. Genre depth: Heardle is mostly Western pop; SongIQ leads with Afrobeats, Amapiano, Highlife and Bongo Flava alongside Hip-Hop, R&B and Pop. Pricing: both free.",
      },
      {
        heading: "Same satisfying loop, more of it",
        paragraph:
          "Each SongIQ round plays a short clip and asks you to name the song or the artist. Lock in fast for speed bonuses. Multiplayer adds live scoring, host controls, and the social pressure that makes guess-the-song games actually fun.",
      },
    ]}
    faq={[
      { q: "Is SongIQ really unlimited?", a: "Yes. Play as many rounds as you want, switch genres mid-session, replay your favorites — no daily cap." },
      { q: "Does SongIQ have multiplayer like Heardle does not?", a: "Yes — fully synced, live, browser-based rooms for up to 8 players. Just share a link." },
      { q: "Which Heardle features does SongIQ keep?", a: "The core 'hear a clip, name the song' loop, fast rounds, and clean mobile gameplay." },
      { q: "Is it free?", a: "100% free. No ads in gameplay, no signup required." },
    ]}
  />
);

export default HeardleAlternative;
