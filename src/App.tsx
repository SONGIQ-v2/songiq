import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import SoloPlay from "./pages/SoloPlay";
import Game from "./pages/Game";
import Multiplayer from "./pages/Multiplayer";
import RoomLobby from "./pages/RoomLobby";
import MultiplayerGame from "./pages/MultiplayerGame";
import NotFound from "./pages/NotFound";
import ChallengePage from "./pages/Challenge";
import Daily from "./pages/Daily";
import Admin from "./pages/Admin";
import Privacy from "./pages/Privacy";
import GuessTheSongGame from "./pages/landing/GuessTheSongGame";
import GuessTheArtistGame from "./pages/landing/GuessTheArtistGame";
import SongQuizOnline from "./pages/landing/SongQuizOnline";
import MusicQuizMultiplayer from "./pages/landing/MusicQuizMultiplayer";
import HeardleAlternative from "./pages/landing/HeardleAlternative";
import AfrobeatsQuiz from "./pages/landing/AfrobeatsQuiz";
import AmapianoQuiz from "./pages/landing/AmapianoQuiz";
import AfricanMusicQuiz from "./pages/landing/AfricanMusicQuiz";
import { FeedbackWidget } from "./components/FeedbackWidget";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/solo" element={<SoloPlay />} />
          <Route path="/solo/game" element={<Game />} />
          <Route path="/multiplayer" element={<Multiplayer />} />
          <Route path="/room/:code" element={<RoomLobby />} />
          <Route path="/room/:code/game" element={<MultiplayerGame />} />
          <Route path="/c/:code" element={<ChallengePage />} />
          <Route path="/daily" element={<Daily />} />
          <Route path="/anonymous" element={<Admin />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/guess-the-song-game" element={<GuessTheSongGame />} />
          <Route path="/guess-the-artist-game" element={<GuessTheArtistGame />} />
          <Route path="/song-quiz-online" element={<SongQuizOnline />} />
          <Route path="/music-quiz-multiplayer" element={<MusicQuizMultiplayer />} />
          <Route path="/heardle-alternative" element={<HeardleAlternative />} />
          <Route path="/afrobeats-quiz" element={<AfrobeatsQuiz />} />
          <Route path="/amapiano-quiz" element={<AmapianoQuiz />} />
          <Route path="/african-music-quiz" element={<AfricanMusicQuiz />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <FeedbackWidget />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
