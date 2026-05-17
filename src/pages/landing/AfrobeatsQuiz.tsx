import { SeoLanding } from "@/components/SeoLanding";

const AfrobeatsQuiz = () => (
  <SeoLanding
    path="/afrobeats-quiz"
    metaTitle="Afrobeats Quiz — Name the Song & Artist Game | SongIQ"
    metaDescription="The ultimate Afrobeats quiz. Hear a clip, name the song or artist — Burna Boy, Wizkid, Tems, Davido and more. Solo or multiplayer. Free."
    h1="Afrobeats Quiz — Prove You Know the Sound"
    intro="From Wizkid to Tems, Burna Boy to Asake — hear the clip, call the name. The Afrobeats quiz built for true fans of the genre."
    features={[
      { icon: "music", title: "Hand-Picked Afrobeats", description: "200+ artists from the genre's biggest catalogues" },
      { icon: "headphones", title: "Real Audio Clips", description: "15 seconds of the actual track — no covers" },
      { icon: "users", title: "Play With Your Crew", description: "Multiplayer rooms for the group chat debate" },
    ]}
    body={[
      {
        heading: "An Afrobeats quiz that actually knows Afrobeats",
        paragraph:
          "Most music games stop at one Burna Boy track and call it 'African music.' SongIQ goes deeper — Wizkid, Davido, Tems, Asake, Rema, Ayra Starr, Olamide, Tiwa Savage and dozens more, with both flagship hits and the deep cuts that separate real heads from casuals.",
      },
      {
        heading: "Two question types, double the test",
        paragraph:
          "Each round flips between Guess the Song and Guess the Artist. Naming 'Last Last' is one thing; calling Burna Boy off two seconds of vocal is another. SongIQ keeps you sharp on both.",
      },
      {
        heading: "Multiplayer makes it lethal",
        paragraph:
          "Open the Afrobeats playlist in a multiplayer room and watch the group chat melt down. Hosts pick the round count and time limit, players join from any device, and live scoring keeps the trash talk flowing.",
      },
    ]}
    faq={[
      { q: "Which Afrobeats artists are in the quiz?", a: "200+ artists including Burna Boy, Wizkid, Davido, Tems, Asake, Rema, Ayra Starr, Olamide, Tiwa Savage, Fireboy DML and many more." },
      { q: "Does it cover Amapiano and Highlife too?", a: "Yes — SongIQ has dedicated playlists for Amapiano and Highlife in addition to mainline Afrobeats." },
      { q: "Are the clips real?", a: "Yes. Every round plays a 15-second clip of the actual track, not a cover or instrumental." },
      { q: "Can I play this Afrobeats quiz with friends?", a: "Yes — create a multiplayer room, share the link, up to 8 players can join from anywhere." },
    ]}
  />
);

export default AfrobeatsQuiz;
