import { SeoLanding } from "@/components/SeoLanding";

const GuessTheArtistGame = () => (
  <SeoLanding
    path="/guess-the-artist-game"
    metaTitle="Guess the Artist Game — Name the Musician | SongIQ"
    metaDescription="Play the guess the artist game free. Hear a clip, name the artist behind the track. Solo and multiplayer modes, Afrobeats to Hip-Hop. No signup."
    h1="Guess the Artist Game — Can You Name the Voice?"
    intro="Forget the lyrics — name the artist. SongIQ plays a 15-second clip and asks who's behind it. Fast, free, and brutally fun with friends."
    features={[
      { icon: "music", title: "Thousands of Artists", description: "From mainstream stars to genre-defining underground" },
      { icon: "trophy", title: "Score & Streaks", description: "Speed bonuses reward instant recognition" },
      { icon: "users", title: "Multiplayer Rooms", description: "Race friends live to call the artist first" },
    ]}
    body={[
      {
        heading: "Why guessing the artist is harder than the song",
        paragraph:
          "Anyone can hum a hook — naming the voice takes real ears. SongIQ flips between Guess the Song and Guess the Artist each round so you never get comfortable. It's the perfect drill for anyone who claims to know music.",
      },
      {
        heading: "Pick your scene",
        paragraph:
          "Drop into Afrobeats and call out Burna Boy, Wizkid or Tems. Switch to Hip-Hop, R&B, US Pop or 2000s throwbacks. Each playlist is hand-curated so even deep cuts stay recognizable for true fans.",
      },
      {
        heading: "Play with your crew",
        paragraph:
          "The guess the artist game is even better in multiplayer. Spin up a room, share the link, and watch your group chat melt down as they argue over who is whose featured verse.",
      },
    ]}
    faq={[
      { q: "How is this different from Guess the Song?", a: "Same clip, different question. Guess the Song asks for the track name; Guess the Artist asks who performed it. SongIQ mixes both per round." },
      { q: "Do I need a Spotify or Apple Music account?", a: "No. SongIQ plays clean 15-second previews directly — no third-party login needed." },
      { q: "Can hosts pick the genre?", a: "Yes. In multiplayer the host chooses the playlist, round count, and time limit before starting." },
      { q: "How many people can join a room?", a: "Up to 8 players per multiplayer room. Spectators can watch live too." },
    ]}
  />
);

export default GuessTheArtistGame;
