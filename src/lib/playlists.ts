// Curated playlists for SongIQ
// Each playlist uses search terms to fetch tracks from Apple Music/iTunes

export interface Playlist {
  id: string;
  name: string;
  description: string;
  image: string; // Placeholder - will be fetched from first track or provided
  searchTerms: string[]; // Artists/songs to search for
}

// African music playlists with curated search terms
export const PLAYLISTS: Playlist[] = [
  {
    id: "afrobeats-chill",
    name: "Afrobeats & Chill",
    description: "Smooth Afrobeats vibes",
    image: "", // Will be fetched dynamically
    searchTerms: [
      "wizkid",
      "tems",
      "burna boy",
      "rema",
      "ayra starr",
      "ckay",
      "fireboy dml",
      "joeboy",
      "omah lay",
    ],
  },
  {
    id: "amapiano-hits",
    name: "Amapiano Hits",
    description: "South African piano vibes",
    image: "",
    searchTerms: [
      "kabza de small",
      "dj maphorisa",
      "focalistic",
      "uncle waffles",
      "young stunna",
    ],
  },
  {
    id: "naija-throwback",
    name: "Naija Throwback",
    description: "Classic Nigerian hits",
    image: "",
    searchTerms: [
      "2baba",
      "d'banj",
      "psquare",
      "timaya",
      "wande coal",
      "wizkid superstar",
    ],
  },
  {
    id: "afro-classics",
    name: "Afro Classics",
    description: "Legendary African sounds",
    image: "",
    searchTerms: [
      "fela kuti",
      "miriam makeba",
      "youssou ndour",
      "salif keita",
      "king sunny ade",
    ],
  },
  {
    id: "east-africa-vibes",
    name: "East Africa Vibes",
    description: "Bongo Flava & more",
    image: "",
    searchTerms: [
      "diamond platnumz",
      "harmonize",
      "rayvanny",
      "sauti sol",
      "nyashinski",
    ],
  },
  {
    id: "ghana-sounds",
    name: "Ghana Sounds",
    description: "Hiplife & Highlife hits",
    image: "",
    searchTerms: [
      "sarkodie",
      "shatta wale",
      "stonebwoy",
      "kuami eugene",
      "king promise",
    ],
  },
];

// Get a playlist by ID
export function getPlaylistById(id: string): Playlist | undefined {
  return PLAYLISTS.find((p) => p.id === id);
}

// Get all playlist IDs
export function getPlaylistIds(): string[] {
  return PLAYLISTS.map((p) => p.id);
}
