import { Link } from "react-router-dom";

// Same links as Header.tsx's NAV_LINKS -- kept as its own copy here (not
// imported) since Header.tsx doesn't export it.
const NAV_LINKS = [
  { to: "/solo", label: "Solo" },
  { to: "/multiplayer", label: "Multiplayer" },
  { to: "/daily", label: "Daily Challenge" },
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/how-it-works", label: "How it works" },
];

/**
 * Header.tsx's desktop nav row, for screens that hold live room state
 * (Multiplayer lobby, results) where navigating the current tab away would
 * lose that state -- every link opens in a NEW TAB (target="_blank")
 * instead. No active-route highlighting: it doesn't mean anything for a
 * link that always opens elsewhere, unlike the real in-place nav.
 *
 * Desktop-only (hidden md:flex) -- render this as its own sibling between
 * the logo/leave group and the right-side actions group, matching
 * Header.tsx's real 3-way layout (its mobile nav trigger lives in
 * NewTabAccountMenu instead, alongside the account section, same as
 * Header.tsx nests it there too).
 */
export function NewTabNavMenu() {
  return (
    <nav className="hidden md:flex items-center gap-8" aria-label="Main navigation (opens in a new tab)">
      {NAV_LINKS.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
