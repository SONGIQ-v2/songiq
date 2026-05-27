import { SeoLanding } from "@/components/SeoLanding";

const SongQuizOnline = () => (
  <SeoLanding
    path="/song-quiz-online"
    metaTitle="Song Quiz Online — Free Music Trivia | SongIQ"
    metaDescription="The best song quiz online. Play instantly in your browser, no download, no signup. Afrobeats, Hip-Hop, Pop & more. Solo or multiplayer."
    h1="Song Quiz Online — Play Free in Your Browser"
    intro="No downloads. No accounts. Just open SongIQ, pick a playlist, and start guessing. Built for phones, tablets and desktops."
    features={[
      { icon: "zap", title: "Instant Play", description: "Loads in seconds — start a quiz in one tap" },
      { icon: "music", title: "Curated Playlists", description: "Genres from Afrobeats to 2000s throwbacks" },
      { icon: "trophy", title: "Track Your Score", description: "Personal bests and round-by-round breakdowns" },
    ]}
    body={[
      {
        heading: "Why play SongIQ online",
        paragraph:
          "Most song quiz apps want you to install, sign up and sit through ads. SongIQ runs entirely in the browser — open it on your phone during a coffee break, share the URL in a group chat, or throw it on a TV for game night.",
      },
      {
        heading: "Works on any device",
        paragraph:
          "Whether you're on iOS Safari, Android Chrome, or a laptop, gameplay is the same. The 2x2 answer grid scales cleanly, audio plays without permissions, and multiplayer rooms sync over the web — no app store required.",
      },
      {
        heading: "Solo for focus, multiplayer for chaos",
        paragraph:
          "Use solo mode to chase a personal best on Afrobeats classics. Hop to multiplayer when the group chat needs settling. Both modes are free, online, and ad-free during gameplay.",
      },
    ]}
    faq={[
      { q: "Is the song quiz really free online?", a: "Yes. No paywall, no signup, no app install. Play unlimited rounds." },
      { q: "Does it work on mobile?", a: "Yes — the entire game is mobile-first. Touch-friendly cards, fast audio, lightweight pages." },
      { q: "Do I need to create an account?", a: "No. Just enter a nickname and play. Multiplayer also runs without accounts." },
      { q: "How does multiplayer work online?", a: "The host creates a room and shares a link. Anyone clicking the link joins the same lobby — no installs, no friend requests." },
    ]}
  />
);

export default SongQuizOnline;
