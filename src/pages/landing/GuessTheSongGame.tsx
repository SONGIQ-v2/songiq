import { SeoLanding } from "@/components/SeoLanding";

const GuessTheSongGame = () => (
  <SeoLanding
    path="/guess-the-song-game"
    metaTitle="Guess the Song Game — Free Online Music Quiz | SongIQ"
    metaDescription="Play the ultimate guess the song game online. Listen to short clips, name the track in seconds, and challenge friends in multiplayer. Free, no signup."
    h1="The Guess the Song Game You'll Actually Replay"
    intro="Hit play, hear a clip, name the track. Solo or with friends — SongIQ turns your music memory into a fast, addictive quiz."
    features={[
      { icon: "headphones", title: "15-Second Clips", description: "Real audio previews from thousands of tracks" },
      { icon: "zap", title: "Fast Rounds", description: "Five rounds in under two minutes" },
      { icon: "users", title: "Play With Friends", description: "Create a room, share the link, race in real time" },
    ]}
    body={[
      {
        heading: "How the game works",
        paragraph:
          "Each round plays a short audio clip from a real song. You get four answer choices — pick fast for more points. After 5 rounds you'll see your final score, your accuracy, and a breakdown of every song. The more you play, the better you'll get at recognizing intros, hooks and bass lines.",
      },
      {
        heading: "Genres for every kind of music fan",
        paragraph:
          "Choose from playlists across Afrobeats, Amapiano, Highlife, Hip-Hop, R&B, Pop, 2000s throwbacks and more. New playlists are added regularly so the catalog never gets stale. Whether you grew up on Burna Boy or Beyoncé, there's a quiz waiting.",
      },
      {
        heading: "Solo or multiplayer — your call",
        paragraph:
          "Play solo to chase your personal best, or jump into multiplayer to humble your group chat. Multiplayer rooms support up to 8 players, sync in real time, and let the host pick the genre and round count.",
      },
    ]}
    faq={[
      { q: "Is the guess the song game free?", a: "Yes — completely free. No signup, no ads in the gameplay, no paywall." },
      { q: "How long are the song clips?", a: "Each clip plays for up to 15 seconds. You can lock in your answer as soon as you recognize the track for more points." },
      { q: "Can I play with friends online?", a: "Yes. Open multiplayer, create a room, and share the link. Anyone can join from any device." },
      { q: "What genres can I play?", a: "Afrobeats, Amapiano, Highlife, Hip-Hop, R&B, US Pop, 2000s throwbacks and more — with new playlists added regularly." },
    ]}
  />
);

export default GuessTheSongGame;
