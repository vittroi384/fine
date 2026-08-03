export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      app_config: {
        Row: {
          key: string
          value: Json
        }
        Insert: {
          key: string
          value: Json
        }
        Update: {
          key?: string
          value?: Json
        }
        Relationships: []
      }
      checkins: {
        Row: {
          checkin_date: string
          client_exif: Json | null
          id: string
          photo_path: string
          season_id: string
          status: Database["public"]["Enums"]["checkin_status"]
          taken_at: string
          user_id: string
          week_no: number
        }
        Insert: {
          checkin_date: string
          client_exif?: Json | null
          id?: string
          photo_path: string
          season_id: string
          status?: Database["public"]["Enums"]["checkin_status"]
          taken_at?: string
          user_id: string
          week_no: number
        }
        Update: {
          checkin_date?: string
          client_exif?: Json | null
          id?: string
          photo_path?: string
          season_id?: string
          status?: Database["public"]["Enums"]["checkin_status"]
          taken_at?: string
          user_id?: string
          week_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "checkins_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_votes: {
        Row: {
          created_at: string
          dispute_id: string
          vote: boolean
          voter_id: string
        }
        Insert: {
          created_at?: string
          dispute_id: string
          vote: boolean
          voter_id: string
        }
        Update: {
          created_at?: string
          dispute_id?: string
          vote?: boolean
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_votes_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          checkin_id: string
          created_at: string
          deadline: string
          id: string
          outcome: Database["public"]["Enums"]["checkin_status"] | null
          raised_by: string
          reason: string
          resolved: boolean
        }
        Insert: {
          checkin_id: string
          created_at?: string
          deadline?: string
          id?: string
          outcome?: Database["public"]["Enums"]["checkin_status"] | null
          raised_by: string
          reason: string
          resolved?: boolean
        }
        Update: {
          checkin_id?: string
          created_at?: string
          deadline?: string
          id?: string
          outcome?: Database["public"]["Enums"]["checkin_status"] | null
          raised_by?: string
          reason?: string
          resolved?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "disputes_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: true
            referencedRelation: "checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          group_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          group_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          id: string
          invite_code: string
          name: string
          owner_id: string
          timezone: string
        }
        Insert: {
          created_at?: string
          id?: string
          invite_code?: string
          name: string
          owner_id: string
          timezone?: string
        }
        Update: {
          created_at?: string
          id?: string
          invite_code?: string
          name?: string
          owner_id?: string
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      passes: {
        Row: {
          id: string
          season_id: string
          used_at: string
          user_id: string
          week_no: number
        }
        Insert: {
          id?: string
          season_id: string
          used_at?: string
          user_id: string
          week_no: number
        }
        Update: {
          id?: string
          season_id?: string
          used_at?: string
          user_id?: string
          week_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "passes_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "passes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      penalty_ledger: {
        Row: {
          amount: number
          confirmed_by_owner: boolean
          created_at: string
          id: string
          missed_count: number
          season_id: string
          settled: boolean
          settled_at: string | null
          user_id: string
          week_no: number
        }
        Insert: {
          amount: number
          confirmed_by_owner?: boolean
          created_at?: string
          id?: string
          missed_count: number
          season_id: string
          settled?: boolean
          settled_at?: string | null
          user_id: string
          week_no: number
        }
        Update: {
          amount?: number
          confirmed_by_owner?: boolean
          created_at?: string
          id?: string
          missed_count?: number
          season_id?: string
          settled?: boolean
          settled_at?: string | null
          user_id?: string
          week_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "penalty_ledger_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "penalty_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          is_adult: boolean
          nickname: string
          push_token: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          is_adult?: boolean
          nickname?: string
          push_token?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          is_adult?: boolean
          nickname?: string
          push_token?: string | null
        }
        Relationships: []
      }
      seasons: {
        Row: {
          created_at: string
          end_date: string | null
          group_id: string
          id: string
          paid: boolean
          pass_quota: number
          penalty_amount: number
          rule_type: Database["public"]["Enums"]["rule_type"]
          rules: Json
          start_date: string
          status: Database["public"]["Enums"]["season_status"]
          target_count: number
          title: string
          weeks: number
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          group_id: string
          id?: string
          paid?: boolean
          pass_quota?: number
          penalty_amount?: number
          rule_type?: Database["public"]["Enums"]["rule_type"]
          rules?: Json
          start_date: string
          status?: Database["public"]["Enums"]["season_status"]
          target_count: number
          title?: string
          weeks?: number
        }
        Update: {
          created_at?: string
          end_date?: string | null
          group_id?: string
          id?: string
          paid?: boolean
          pass_quota?: number
          penalty_amount?: number
          rule_type?: Database["public"]["Enums"]["rule_type"]
          rules?: Json
          start_date?: string
          status?: Database["public"]["Enums"]["season_status"]
          target_count?: number
          title?: string
          weeks?: number
        }
        Relationships: [
          {
            foreignKeyName: "seasons_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          id: string
          product_id: string
          rc_event_id: string | null
          season_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          rc_event_id?: string | null
          season_id?: string | null
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          rc_event_id?: string | null
          season_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cfg_int: { Args: { fallback: number; k: string }; Returns: number }
      confirm_settled: { Args: { ledger_id: string }; Returns: undefined }
      get_remind_targets: {
        Args: never
        Returns: {
          group_name: string
          penalty: number
          push_token: string
          user_id: string
        }[]
      }
      is_group_member: { Args: { gid: string }; Returns: boolean }
      is_season_member: { Args: { sid: string }; Returns: boolean }
      join_group: { Args: { code: string }; Returns: string }
      kst_today: { Args: never; Returns: string }
      local_today: { Args: { tz: string }; Returns: string }
      mark_settled: {
        Args: { ledger_id: string; val: boolean }
        Returns: undefined
      }
      redeem_season_pass: { Args: { sid: string }; Returns: undefined }
      resolve_open_disputes: { Args: never; Returns: number }
      settle_due_weeks: { Args: never; Returns: number }
      start_season: { Args: { sid: string }; Returns: string }
      track_event: { Args: { name: string; props?: Json }; Returns: undefined }
      use_pass: { Args: { sid: string; wk: number }; Returns: undefined }
    }
    Enums: {
      checkin_status: "valid" | "disputed" | "rejected"
      rule_type: "weekly_count" | "daily"
      season_status: "draft" | "active" | "closed"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      checkin_status: ["valid", "disputed", "rejected"],
      rule_type: ["weekly_count", "daily"],
      season_status: ["draft", "active", "closed"],
    },
  },
} as const


// 수동 별칭 (gen-types 재생성 시 이 블록을 유지할 것)
export type RuleType = Database["public"]["Enums"]["rule_type"];
export type SeasonStatus = Database["public"]["Enums"]["season_status"];
export type CheckinStatus = Database["public"]["Enums"]["checkin_status"];
