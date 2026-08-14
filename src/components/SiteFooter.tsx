import { Link } from "react-router-dom";

const gameLinks = [
  { to: "/solo", label: "Play Solo" },
  { to: "/multiplayer", label: "Multiplayer Rooms" },
  { to: "/daily", label: "Daily Challenge" },
  { to: "/leaderboard", label: "Leaderboard" },
];

const quizLinks = [
  { to: "/guess-the-song-game", label: "Guess the Song Game" },
  { to: "/guess-the-artist-game", label: "Guess the Artist Game" },
  { to: "/song-quiz-online", label: "Song Quiz Online" },
  { to: "/music-quiz-multiplayer", label: "Music Quiz Multiplayer" },
];

const genreLinks = [
  { to: "/afrobeats-quiz", label: "Afrobeats Quiz" },
  { to: "/amapiano-quiz", label: "Amapiano Quiz" },
  { to: "/african-music-quiz", label: "African Music Quiz" },
  { to: "/heardle-alternative", label: "Heardle Alternative" },
];

const Column = ({ title, links }: { title: string; links: { to: string; label: string }[] }) => (
  <div>
    <h2 className="font-display text-sm uppercase tracking-wide mb-3 text-foreground">{title}</h2>
    <ul className="space-y-2">
      {links.map((l) => (
        <li key={l.to}>
          <Link
            to={l.to}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  </div>
);

export const SiteFooter = () => (
  <footer className="relative z-10 border-t border-border/40 mt-16 px-4 py-12">
    <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
      <Column title="Play" links={gameLinks} />
      <Column title="Quiz Games" links={quizLinks} />
      <Column title="Genres" links={genreLinks} />
      <div>
        <h2 className="font-display text-sm uppercase tracking-wide mb-3 text-foreground">SongIQ</h2>
        <p className="text-sm text-muted-foreground mb-3">
          A free online music quiz for Afrobeats, Amapiano and global hits. Guess songs and artists
          from real audio clips — solo or with friends.
        </p>
        <Link to="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Privacy Policy
        </Link>
      </div>
    </div>
    <p className="max-w-5xl mx-auto text-xs text-muted-foreground mt-8">
      © {new Date().getFullYear()} SongIQ. All rights reserved.
    </p>
  </footer>
);
