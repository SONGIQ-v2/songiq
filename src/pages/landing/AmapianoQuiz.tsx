import { SeoLanding } from "@/components/SeoLanding";

const AmapianoQuiz = () => (
  <SeoLanding
    path="/amapiano-quiz"
    metaTitle="Amapiano Quiz — Name the Track Game | SongIQ"
    metaDescription="The first proper Amapiano quiz online. Hear a log drum, name the song or artist — Kabza, Maphorisa, Tyler ICU, Uncle Waffles & more. Free."
    h1="Amapiano Quiz — Hear the Log Drum, Call the Track"
    intro="From Kabza De Small to Tyler ICU, Uncle Waffles to Maphorisa — SongIQ's Amapiano quiz puts your ear to the test."
    features={[
      { icon: "music", title: "Curated Amapiano", description: "Hits and deep cuts from the genre's pioneers" },
      { icon: "headphones", title: "Real 15s Clips", description: "Hear the groove, not just the chorus" },
      { icon: "users", title: "Multiplayer Rooms", description: "Run it back with your crew live" },
    ]}
    body={[
      {
        heading: "Why Amapiano fans need their own quiz",
        paragraph:
          "Amapiano isn't a sub-genre — it's a whole movement, and most music games barely scratch it. SongIQ leads with Amapiano as a first-class playlist, featuring Kabza De Small, DJ Maphorisa, Tyler ICU, Uncle Waffles, Focalistic, Mellow & Sleazy and many more.",
      },
      {
        heading: "Built for real listeners",
        paragraph:
          "The log drum hits, the vocal floats in — and you have 15 seconds to call it. Each round mixes Guess the Song and Guess the Artist, so you can't fake it on either side. Speed bonuses reward fans who clock a track from the first bar.",
      },
      {
        heading: "Bring the yano to the group chat",
        paragraph:
          "Create a multiplayer room, share the link, set the Amapiano playlist and watch friends scramble. Hosts control rounds and time limits — players can join from any phone, anywhere.",
      },
    ]}
    faq={[
      { q: "Which Amapiano artists are included?", a: "Kabza De Small, DJ Maphorisa, Tyler ICU, Uncle Waffles, Focalistic, Mellow & Sleazy, Daliwonga, Young Stunna and many more." },
      { q: "Is this only Amapiano?", a: "The Amapiano playlist focuses on the genre, but SongIQ also has Afrobeats, Highlife, Hip-Hop and more if you want to mix it up." },
      { q: "Do clips include the log drum?", a: "Yes — clips are 15 seconds from the actual track, so you hear the groove, not just a vocal snippet." },
      { q: "Can I play in multiplayer?", a: "Yes. Up to 8 players, real-time scoring, browser-based — no apps." },
    ]}
  />
);

export default AmapianoQuiz;
