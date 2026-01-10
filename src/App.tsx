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
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
