import { create } from "zustand";

export interface Player {
  id: string;
  name: string;
  avatarIndex: number;
  score: number;
  isHost: boolean;
  isReady: boolean;
}

export interface GameRound {
  roundNumber: number;
  trackId: string;
  trackName: string;
  artistName: string;
  previewUrl: string;
  options: string[];
  startedAt: Date;
}

export interface GameState {
  // Player info
  playerId: string;
  playerName: string;
  avatarIndex: number;
  
  // Room info
  roomId: string | null;
  roomCode: string | null;
  isHost: boolean;
  
  // Game state
  players: Player[];
  currentRound: GameRound | null;
  roundNumber: number;
  totalRounds: number;
  gameStatus: "idle" | "waiting" | "playing" | "finished";
  category: string;
  
  // Solo game state
  soloScore: number;
  soloRound: number;
  
  // Actions
  setPlayer: (name: string, avatarIndex: number) => void;
  setRoom: (roomId: string, roomCode: string, isHost: boolean) => void;
  setPlayers: (players: Player[]) => void;
  setCurrentRound: (round: GameRound | null) => void;
  setGameStatus: (status: GameState["gameStatus"]) => void;
  updateScore: (playerId: string, score: number) => void;
  setSoloScore: (score: number) => void;
  addSoloPoints: (points: number) => void;
  setSoloRound: (round: number) => void;
  setCategory: (category: string) => void;
  resetSoloGame: () => void;
  reset: () => void;
}

// Generate a unique player ID
const generatePlayerId = () => {
  return `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export const useGameStore = create<GameState>((set) => ({
  // Initial state
  playerId: generatePlayerId(),
  playerName: "",
  avatarIndex: 1,
  
  roomId: null,
  roomCode: null,
  isHost: false,
  
  players: [],
  currentRound: null,
  roundNumber: 0,
  totalRounds: 10,
  gameStatus: "idle",
  category: "afrobeats",
  
  soloScore: 0,
  soloRound: 0,
  
  // Actions
  setPlayer: (name, avatarIndex) =>
    set({ playerName: name, avatarIndex }),
  
  setRoom: (roomId, roomCode, isHost) =>
    set({ roomId, roomCode, isHost, gameStatus: "waiting" }),
  
  setPlayers: (players) => set({ players }),
  
  setCurrentRound: (round) => set({ currentRound: round }),
  
  setGameStatus: (status) => set({ gameStatus: status }),
  
  updateScore: (playerId, score) =>
    set((state) => ({
      players: state.players.map((p) =>
        p.id === playerId ? { ...p, score: p.score + score } : p
      ),
    })),
  
  setSoloScore: (score) => set({ soloScore: score }),
  
  addSoloPoints: (points) => set((state) => ({ soloScore: state.soloScore + points })),
  
  setSoloRound: (round) => set({ soloRound: round }),
  
  setCategory: (category) => set({ category }),
  
  resetSoloGame: () => set({ soloScore: 0, soloRound: 0 }),
  
  reset: () =>
    set({
      roomId: null,
      roomCode: null,
      isHost: false,
      players: [],
      currentRound: null,
      roundNumber: 0,
      gameStatus: "idle",
      soloScore: 0,
      soloRound: 0,
    }),
}));
