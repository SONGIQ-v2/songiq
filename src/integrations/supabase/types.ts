export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      challenge_attempts: {
        Row: {
          challenge_code: string
          correct_count: number
          created_at: string
          id: string
          player_id: string
          player_name: string
          score: number
        }
        Insert: {
          challenge_code: string
          correct_count?: number
          created_at?: string
          id?: string
          player_id: string
          player_name?: string
          score?: number
        }
        Update: {
          challenge_code?: string
          correct_count?: number
          created_at?: string
          id?: string
          player_id?: string
          player_name?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "challenge_attempts_challenge_code_fkey"
            columns: ["challenge_code"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["code"]
          },
        ]
      }
      challenges: {
        Row: {
          category_name: string
          code: string
          created_at: string
          creator_id: string | null
          creator_name: string
          creator_score: number
          id: string
          plan: Json
          time_per_round: number
        }
        Insert: {
          category_name?: string
          code: string
          created_at?: string
          creator_id?: string | null
          creator_name?: string
          creator_score?: number
          id?: string
          plan: Json
          time_per_round?: number
        }
        Update: {
          category_name?: string
          code?: string
          created_at?: string
          creator_id?: string | null
          creator_name?: string
          creator_score?: number
          id?: string
          plan?: Json
          time_per_round?: number
        }
        Relationships: []
      }
      client_logs: {
        Row: {
          context: Json
          created_at: string
          event: string | null
          id: string
          level: string
          message: string
          player_id: string | null
          room_code: string | null
          room_id: string | null
          stack: string | null
          url: string | null
          user_agent: string | null
        }
        Insert: {
          context?: Json
          created_at?: string
          event?: string | null
          id?: string
          level?: string
          message: string
          player_id?: string | null
          room_code?: string | null
          room_id?: string | null
          stack?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Update: {
          context?: Json
          created_at?: string
          event?: string | null
          id?: string
          level?: string
          message?: string
          player_id?: string | null
          room_code?: string | null
          room_id?: string | null
          stack?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      game_history: {
        Row: {
          answers: Json
          archived_at: string
          category: string
          created_at: string
          finished_at: string | null
          host_id: string
          host_name: string
          id: string
          players: Json
          reason: string
          room_code: string
          room_id: string
          rounds: Json
          rounds_played: number
          started_at: string | null
          status: string
          time_per_round: number
          total_rounds: number
        }
        Insert: {
          answers?: Json
          archived_at?: string
          category: string
          created_at: string
          finished_at?: string | null
          host_id: string
          host_name: string
          id?: string
          players?: Json
          reason: string
          room_code: string
          room_id: string
          rounds?: Json
          rounds_played: number
          started_at?: string | null
          status: string
          time_per_round: number
          total_rounds: number
        }
        Update: {
          answers?: Json
          archived_at?: string
          category?: string
          created_at?: string
          finished_at?: string | null
          host_id?: string
          host_name?: string
          id?: string
          players?: Json
          reason?: string
          room_code?: string
          room_id?: string
          rounds?: Json
          rounds_played?: number
          started_at?: string | null
          status?: string
          time_per_round?: number
          total_rounds?: number
        }
        Relationships: []
      }
      game_rooms: {
        Row: {
          category: string
          created_at: string
          current_round: number
          finished_at: string | null
          host_id: string
          host_name: string
          id: string
          max_players: number
          room_code: string
          started_at: string | null
          status: string
          time_per_round: number
          total_rounds: number
        }
        Insert: {
          category?: string
          created_at?: string
          current_round?: number
          finished_at?: string | null
          host_id: string
          host_name: string
          id?: string
          max_players?: number
          room_code: string
          started_at?: string | null
          status?: string
          time_per_round?: number
          total_rounds?: number
        }
        Update: {
          category?: string
          created_at?: string
          current_round?: number
          finished_at?: string | null
          host_id?: string
          host_name?: string
          id?: string
          max_players?: number
          room_code?: string
          started_at?: string | null
          status?: string
          time_per_round?: number
          total_rounds?: number
        }
        Relationships: []
      }
      game_rounds: {
        Row: {
          artist_name: string
          artwork_url: string | null
          ended_at: string | null
          id: string
          options: Json
          preview_url: string
          question_type: string
          room_id: string
          round_number: number
          started_at: string
          track_id: string
          track_name: string
        }
        Insert: {
          artist_name: string
          artwork_url?: string | null
          ended_at?: string | null
          id?: string
          options: Json
          preview_url: string
          question_type?: string
          room_id: string
          round_number: number
          started_at?: string
          track_id: string
          track_name: string
        }
        Update: {
          artist_name?: string
          artwork_url?: string | null
          ended_at?: string | null
          id?: string
          options?: Json
          preview_url?: string
          question_type?: string
          room_id?: string
          round_number?: number
          started_at?: string
          track_id?: string
          track_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_rounds_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "game_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      player_answers: {
        Row: {
          answer: string
          answered_at: string
          id: string
          is_correct: boolean
          player_id: string
          points_earned: number
          room_id: string
          round_id: string
        }
        Insert: {
          answer: string
          answered_at?: string
          id?: string
          is_correct?: boolean
          player_id: string
          points_earned?: number
          room_id: string
          round_id: string
        }
        Update: {
          answer?: string
          answered_at?: string
          id?: string
          is_correct?: boolean
          player_id?: string
          points_earned?: number
          room_id?: string
          round_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_answers_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "game_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_answers_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "game_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_answers_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "game_rounds_public"
            referencedColumns: ["id"]
          },
        ]
      }
      playlist_cache: {
        Row: {
          image_url: string
          playlist_name: string
          search_terms: Json
          tracks: Json
          updated_at: string
        }
        Insert: {
          image_url?: string
          playlist_name: string
          search_terms?: Json
          tracks?: Json
          updated_at?: string
        }
        Update: {
          image_url?: string
          playlist_name?: string
          search_terms?: Json
          tracks?: Json
          updated_at?: string
        }
        Relationships: []
      }
      room_players: {
        Row: {
          avatar_index: number
          id: string
          is_host: boolean
          is_ready: boolean
          joined_at: string
          player_id: string
          player_name: string
          room_id: string
          score: number
        }
        Insert: {
          avatar_index?: number
          id?: string
          is_host?: boolean
          is_ready?: boolean
          joined_at?: string
          player_id: string
          player_name: string
          room_id: string
          score?: number
        }
        Update: {
          avatar_index?: number
          id?: string
          is_host?: boolean
          is_ready?: boolean
          joined_at?: string
          player_id?: string
          player_name?: string
          room_id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "room_players_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "game_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_tracks: {
        Row: {
          created_at: string
          plan: Json
          room_id: string
        }
        Insert: {
          created_at?: string
          plan?: Json
          room_id: string
        }
        Update: {
          created_at?: string
          plan?: Json
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_tracks_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "game_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      user_feedback: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      game_rounds_public: {
        Row: {
          artist_name: string | null
          artwork_url: string | null
          ended_at: string | null
          id: string | null
          options: Json | null
          preview_url: string | null
          question_type: string | null
          room_id: string | null
          round_number: number | null
          started_at: string | null
          track_id: string | null
          track_name: string | null
        }
        Insert: {
          artist_name?: never
          artwork_url?: string | null
          ended_at?: string | null
          id?: string | null
          options?: Json | null
          preview_url?: string | null
          question_type?: string | null
          room_id?: string | null
          round_number?: number | null
          started_at?: string | null
          track_id?: string | null
          track_name?: never
        }
        Update: {
          artist_name?: never
          artwork_url?: string | null
          ended_at?: string | null
          id?: string | null
          options?: Json | null
          preview_url?: string | null
          question_type?: string | null
          room_id?: string | null
          round_number?: number | null
          started_at?: string | null
          track_id?: string | null
          track_name?: never
        }
        Relationships: [
          {
            foreignKeyName: "game_rounds_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "game_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      advance_game_round: { Args: { _room_id: string }; Returns: Json }
      normalize_quiz_answer: { Args: { _value: string }; Returns: string }
      server_time_ms: { Args: never; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
