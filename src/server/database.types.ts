export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      game_events: {
        Row: {
          created_at: string;
          event: NonNullable<Json>;
          game_id: string;
          seq: number;
        };
        Insert: {
          created_at?: string;
          event: NonNullable<Json>;
          game_id: string;
          seq: number;
        };
        Update: {
          created_at?: string;
          event?: NonNullable<Json>;
          game_id?: string;
          seq?: number;
        };
        Relationships: [
          {
            foreignKeyName: "game_events_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
        ];
      };
      game_results: {
        Row: {
          chips: number;
          created_at: string;
          game_id: string;
          player_id: string;
          points: number;
          rank: number;
          score: number;
          seat: number;
        };
        Insert: {
          chips: number;
          created_at?: string;
          game_id: string;
          player_id: string;
          points: number;
          rank: number;
          score: number;
          seat: number;
        };
        Update: {
          chips?: number;
          created_at?: string;
          game_id?: string;
          player_id?: string;
          points?: number;
          rank?: number;
          score?: number;
          seat?: number;
        };
        Relationships: [
          {
            foreignKeyName: "game_results_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "game_results_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      game_secrets: {
        Row: {
          game_id: string;
          state: NonNullable<Json>;
        };
        Insert: {
          game_id: string;
          state: NonNullable<Json>;
        };
        Update: {
          game_id?: string;
          state?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "game_secrets_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: true;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
        ];
      };
      game_views: {
        Row: {
          game_id: string;
          player_id: string;
          seat: number;
          updated_at: string;
          version: number;
          view: NonNullable<Json>;
        };
        Insert: {
          game_id: string;
          player_id: string;
          seat: number;
          updated_at?: string;
          version?: number;
          view: NonNullable<Json>;
        };
        Update: {
          game_id?: string;
          player_id?: string;
          seat?: number;
          updated_at?: string;
          version?: number;
          view?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "game_views_game_id_fkey";
            columns: ["game_id"];
            isOneToOne: false;
            referencedRelation: "games";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "game_views_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      games: {
        Row: {
          created_at: string;
          finished_at: string | null;
          id: string;
          player_ids: string[];
          room_id: string;
          status: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          finished_at?: string | null;
          id?: string;
          player_ids: string[];
          room_id: string;
          status?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          finished_at?: string | null;
          id?: string;
          player_ids?: string[];
          room_id?: string;
          status?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "games_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          approved: boolean;
          created_at: string;
          display_name: string | null;
          id: string;
          is_admin: boolean;
        };
        Insert: {
          approved?: boolean;
          created_at?: string;
          display_name?: string | null;
          id: string;
          is_admin?: boolean;
        };
        Update: {
          approved?: boolean;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          is_admin?: boolean;
        };
        Relationships: [];
      };
      room_members: {
        Row: {
          joined_at: string;
          rematch_ready: boolean;
          room_id: string;
          seat: number;
          user_id: string;
        };
        Insert: {
          joined_at?: string;
          rematch_ready?: boolean;
          room_id: string;
          seat: number;
          user_id: string;
        };
        Update: {
          joined_at?: string;
          rematch_ready?: boolean;
          room_id?: string;
          seat?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "room_members_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "room_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      rooms: {
        Row: {
          code: string;
          created_at: string;
          created_by: string;
          id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by: string;
          id?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rooms_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      active_room_of: { Args: { p_user: string }; Returns: string };
      create_room: { Args: { p_code: string; p_user: string }; Returns: Json };
      is_approved: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_game_player: {
        Args: { finished_only?: boolean; target_game: string };
        Returns: boolean;
      };
      is_room_member: { Args: { target_room: string }; Returns: boolean };
      join_room: { Args: { p_code: string; p_user: string }; Returns: Json };
      leave_room: {
        Args: { p_room: string; p_user: string };
        Returns: boolean;
      };
      lock_approved_profile: { Args: { p_user: string }; Returns: boolean };
      save_game: {
        Args: {
          p_events: Json;
          p_expected_version: number;
          p_game: string;
          p_results?: Json;
          p_state: Json;
          p_views: Json;
        };
        Returns: boolean;
      };
      set_rematch_ready: {
        Args: { p_room: string; p_user: string };
        Returns: Json;
      };
      start_game: {
        Args: {
          p_events: Json;
          p_expected_status: string;
          p_player_ids: string[];
          p_room: string;
          p_state: Json;
          p_views: Json;
        };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
