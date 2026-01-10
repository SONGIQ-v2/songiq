// Spotify API integration for SongIQ
// This will be used to fetch African music tracks

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: {
    name: string;
    images: { url: string; height: number; width: number }[];
  };
  preview_url: string | null;
  duration_ms: number;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  images: { url: string }[];
  tracks: {
    total: number;
    items: { track: SpotifyTrack }[];
  };
}

// African music categories with their Spotify playlist IDs
export const AFRICAN_CATEGORIES = {
  afrobeats: {
    name: "Afrobeats",
    description: "The sound of modern Africa",
    color: "from-orange-500 to-yellow-500",
    icon: "🔥",
    // Popular Afrobeats playlists
    playlists: ["37i9dQZF1DWYkaDif7Ztbp", "37i9dQZF1DX8SfyqmSFDwe"],
  },
  amapiano: {
    name: "Amapiano",
    description: "South African house vibes",
    color: "from-purple-500 to-pink-500",
    icon: "🎹",
    playlists: ["37i9dQZF1DX0BcQWzuB7ZO"],
  },
  highlife: {
    name: "Highlife",
    description: "Classic West African grooves",
    color: "from-green-500 to-teal-500",
    icon: "🎺",
    playlists: ["37i9dQZF1DX1W96TRxN9NN"],
  },
  bongoFlava: {
    name: "Bongo Flava",
    description: "Tanzanian beats",
    color: "from-blue-500 to-cyan-500",
    icon: "🌴",
    playlists: ["37i9dQZF1DX2FhqVBKWGnX"],
  },
  naija: {
    name: "Naija Hits",
    description: "Nigerian chart-toppers",
    color: "from-green-600 to-emerald-500",
    icon: "🇳🇬",
    playlists: ["37i9dQZF1DX1W96TRxN9NN"],
  },
  genge: {
    name: "Genge & Gengetone",
    description: "Kenyan urban sound",
    color: "from-red-500 to-orange-500",
    icon: "🇰🇪",
    playlists: ["37i9dQZF1DX3LDIBRoaCDQ"],
  },
  afroClassics: {
    name: "Afro Classics",
    description: "Timeless African legends",
    color: "from-amber-600 to-yellow-500",
    icon: "👑",
    playlists: ["37i9dQZF1DX8SfyqmSFDwe"],
  },
  hiplife: {
    name: "Hiplife",
    description: "Ghanaian hip-hop fusion",
    color: "from-yellow-500 to-red-500",
    icon: "🇬🇭",
    playlists: ["37i9dQZF1DX0PmGx9OhEAU"],
  },
};

export type CategoryKey = keyof typeof AFRICAN_CATEGORIES;

// Mock track data for demo (will be replaced with Spotify API)
export const DEMO_TRACKS: SpotifyTrack[] = [
  {
    id: "1",
    name: "Essence",
    artists: [{ name: "Wizkid ft. Tems" }],
    album: {
      name: "Made In Lagos",
      images: [{ url: "/placeholder.svg", height: 300, width: 300 }],
    },
    preview_url: "https://p.scdn.co/mp3-preview/sample1",
    duration_ms: 240000,
  },
  {
    id: "2",
    name: "Love Nwantiti",
    artists: [{ name: "CKay" }],
    album: {
      name: "Ckay The First",
      images: [{ url: "/placeholder.svg", height: 300, width: 300 }],
    },
    preview_url: "https://p.scdn.co/mp3-preview/sample2",
    duration_ms: 200000,
  },
  {
    id: "3",
    name: "Calm Down",
    artists: [{ name: "Rema" }],
    album: {
      name: "Rave & Roses",
      images: [{ url: "/placeholder.svg", height: 300, width: 300 }],
    },
    preview_url: "https://p.scdn.co/mp3-preview/sample3",
    duration_ms: 220000,
  },
  {
    id: "4",
    name: "Peru",
    artists: [{ name: "Fireboy DML" }],
    album: {
      name: "Playboy",
      images: [{ url: "/placeholder.svg", height: 300, width: 300 }],
    },
    preview_url: "https://p.scdn.co/mp3-preview/sample4",
    duration_ms: 210000,
  },
  {
    id: "5",
    name: "Ye",
    artists: [{ name: "Burna Boy" }],
    album: {
      name: "Outside",
      images: [{ url: "/placeholder.svg", height: 300, width: 300 }],
    },
    preview_url: "https://p.scdn.co/mp3-preview/sample5",
    duration_ms: 230000,
  },
];

// Generate quiz options (1 correct + 3 wrong answers)
export function generateOptions(
  correctTrack: SpotifyTrack,
  allTracks: SpotifyTrack[],
  optionCount: number = 4
): string[] {
  const correctAnswer = `${correctTrack.name} - ${correctTrack.artists[0].name}`;
  const wrongOptions = allTracks
    .filter((t) => t.id !== correctTrack.id)
    .sort(() => Math.random() - 0.5)
    .slice(0, optionCount - 1)
    .map((t) => `${t.name} - ${t.artists[0].name}`);

  return [correctAnswer, ...wrongOptions].sort(() => Math.random() - 0.5);
}

// Generate a random room code
export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Calculate points based on answer time
export function calculatePoints(
  isCorrect: boolean,
  answerTimeMs: number,
  maxTimeMs: number = 30000
): number {
  if (!isCorrect) return 0;
  
  // Base points for correct answer
  const basePoints = 100;
  
  // Bonus points for speed (up to 100 extra points)
  const timeBonus = Math.floor(
    ((maxTimeMs - answerTimeMs) / maxTimeMs) * 100
  );
  
  return basePoints + Math.max(0, timeBonus);
}
