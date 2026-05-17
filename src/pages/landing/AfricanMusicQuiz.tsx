import { SeoLanding } from "@/components/SeoLanding";

const AfricanMusicQuiz = () => (
  <SeoLanding
    path="/african-music-quiz"
    metaTitle="African Music Quiz — Afrobeats, Amapiano, Highlife & More | SongIQ"
    metaDescription="The African music quiz built for real fans. Afrobeats, Amapiano, Highlife, Bongo Flava — hear a clip, name the song or artist. Free, multiplayer."
    h1="African Music Quiz — The Continent on Shuffle"
    intro="Afrobeats. Amapiano. Highlife. Bongo Flava. One quiz, every sound — and 15 seconds to prove you know it."
    features={[
      { icon: "music", title: "Multiple Genres", description: "Curated playlists across African music styles" },
      { icon: "trophy", title: "Speed Bonuses", description: "Faster guesses score higher" },
      { icon: "users", title: "Play With Friends", description: "Live multiplayer rooms — share a link to join" },
    ]}
    body={[
      {
        heading: "African music deserves a proper quiz",
        paragraph:
          "Western music games treat the entire continent as a footnote. SongIQ flips that — Afrobeats, Amapiano, Highlife and Bongo Flava are first-class playlists, hand-curated with hundreds of artists from across Nigeria, South Africa, Ghana, Tanzania and beyond.",
      },
      {
        heading: "From Wizkid to Sarkodie to Diamond Platnumz",
        paragraph:
          "Hear a clip, name the song or artist. SongIQ pulls from genre pioneers and rising stars alike — Burna Boy, Tems, Davido, Kabza De Small, Uncle Waffles, Sarkodie, Diamond Platnumz, Black Sherif and many more. Each round is randomized so no two games feel the same.",
      },
      {
        heading: "Solo for practice, multiplayer for pride",
        paragraph:
          "Run solo to drill your recognition speed, then bring friends into a multiplayer room. Hosts pick the genre, set rounds and time limits, and live scoring keeps the energy up between rounds.",
      },
    ]}
    faq={[
      { q: "Which African genres are covered?", a: "Afrobeats, Amapiano, Highlife and Bongo Flava have dedicated playlists, with hundreds of artists from across the continent." },
      { q: "Are non-African genres available too?", a: "Yes — Hip-Hop, R&B, US Pop and 2000s throwbacks are available alongside the African playlists." },
      { q: "Is the African music quiz free?", a: "Yes. Unlimited play, no signup, no paywall." },
      { q: "Can I play with friends in other countries?", a: "Yes — multiplayer rooms work anywhere with a browser. Just share the room link." },
    ]}
  />
);

export default AfricanMusicQuiz;
