import { SeoLanding } from "@/components/SeoLanding";

const MusicQuizMultiplayer = () => (
  <SeoLanding
    path="/music-quiz-multiplayer"
    metaTitle="Music Quiz Multiplayer — Play with Friends Live | SongIQ"
    metaDescription="Music quiz multiplayer for friends and family. Create a room, share the link, race live to guess songs and artists. Free, web-based, no signup."
    h1="Music Quiz Multiplayer — Settle the Group Chat"
    intro="Up to 8 players, live scoring, real songs. Create a room in 10 seconds and find out who actually knows music."
    features={[
      { icon: "users", title: "Up to 8 Players", description: "Cross-device — phones, laptops, tablets together" },
      { icon: "zap", title: "Real-Time Sync", description: "Live leaderboard updates after every round" },
      { icon: "trophy", title: "Host Controls", description: "Pick the genre, rounds and time per round" },
    ]}
    primaryCta={{ label: "Start a Multiplayer Room", to: "/multiplayer" }}
    secondaryCta={{ label: "Try Solo First", to: "/solo" }}
    body={[
      {
        heading: "Multiplayer that actually works in a browser",
        paragraph:
          "SongIQ multiplayer rooms run entirely on the web. Hosts pick a playlist, set the round count and time limit, then share a single link. Players join from any device — no app installs, no friend requests, no waiting for everyone to download something.",
      },
      {
        heading: "Live scoring, live drama",
        paragraph:
          "Each round, every player races to lock in their answer before the timer ends. Speed and accuracy both count. The leaderboard updates between rounds so you'll know exactly who's leading and by how much — perfect for trash talk.",
      },
      {
        heading: "Pick the music your crew actually likes",
        paragraph:
          "Hosts choose from Afrobeats, Amapiano, Highlife, Hip-Hop, R&B, US Pop, 2000s throwbacks and more. Mix and match playlists between rounds to keep everyone honest.",
      },
    ]}
    faq={[
      { q: "How many people can play together?", a: "Up to 8 players per room. Anyone with the link can join." },
      { q: "Do all players need to be in the same place?", a: "No — multiplayer is fully online. Players can be anywhere as long as they have a browser." },
      { q: "Who controls the game?", a: "The host. They pick the genre, round count and time limit, and they start each round." },
      { q: "Is multiplayer free?", a: "Yes, completely. No subscriptions, no upgrade prompts." },
    ]}
  />
);

export default MusicQuizMultiplayer;
