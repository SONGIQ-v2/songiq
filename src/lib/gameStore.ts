import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";

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
  playerId: string | null;
  playerName: string;
  avatarIndex: number;
  isInitialized: boolean;
  
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

  // Sign-in modal — shared across pages so a "Sign in to save your
  // progress" hint anywhere in the app can open the same modal, not just
  // wherever Header happens to be rendered (e.g. the Daily Challenge page
  // has no Header at all).
  showSignInModal: boolean;

  // Actions
  initializeAuth: () => Promise<string | null>;
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
  openSignInModal: () => void;
  closeSignInModal: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  // Initial state
  playerId: null,
  playerName: "",
  avatarIndex: 1,
  isInitialized: false,
  
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

  showSignInModal: false,

  // Actions
  initializeAuth: async () => {
    // Check if already initialized
    if (get().isInitialized && get().playerId) {
      return get().playerId;
    }
    
    try {
      // First check for existing session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        set({ playerId: session.user.id, isInitialized: true });
        return session.user.id;
      }
      
      // No existing session, sign in anonymously
      const { data, error } = await supabase.auth.signInAnonymously();
      
      if (error) {
        console.error("Anonymous auth error:", error);
        return null;
      }
      
      const userId = data.user?.id ?? null;
      set({ playerId: userId, isInitialized: true });
      return userId;
    } catch (error) {
      console.error("Auth initialization error:", error);
      return null;
    }
  },
  
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

  openSignInModal: () => set({ showSignInModal: true }),
  closeSignInModal: () => set({ showSignInModal: false }),
}));
