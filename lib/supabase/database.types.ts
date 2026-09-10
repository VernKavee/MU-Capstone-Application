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
      consents: {
        Row: {
          granted_at: string
          kind: string
          user_id: string
          version: number
        }
        Insert: {
          granted_at?: string
          kind: string
          user_id: string
          version: number
        }
        Update: {
          granted_at?: string
          kind?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      exercises: {
        Row: {
          engine_key: string
          guide_text: string
          guide_video_url: string | null
          id: string
          name: string
          rule_based_logic: Json
          sort_order: number
          thumbnail_url: string | null
        }
        Insert: {
          engine_key: string
          guide_text: string
          guide_video_url?: string | null
          id: string
          name: string
          rule_based_logic: Json
          sort_order: number
          thumbnail_url?: string | null
        }
        Update: {
          engine_key?: string
          guide_text?: string
          guide_video_url?: string | null
          id?: string
          name?: string
          rule_based_logic?: Json
          sort_order?: number
          thumbnail_url?: string | null
        }
        Relationships: []
      }
      expert_motions: {
        Row: {
          exercise_id: string
          motion_data: string
          updated_at: string
        }
        Insert: {
          exercise_id: string
          motion_data: string
          updated_at?: string
        }
        Update: {
          exercise_id?: string
          motion_data?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expert_motions_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: true
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          exercise_id: string
          id: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          exercise_id: string
          id?: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          exercise_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age: number
          created_at: string
          display_name: string
          gender: string
          height_cm: number
          medical_history: string
          updated_at: string
          user_id: string
          weight_kg: number
        }
        Insert: {
          age: number
          created_at?: string
          display_name: string
          gender: string
          height_cm: number
          medical_history: string
          updated_at?: string
          user_id: string
          weight_kg: number
        }
        Update: {
          age?: number
          created_at?: string
          display_name?: string
          gender?: string
          height_cm?: number
          medical_history?: string
          updated_at?: string
          user_id?: string
          weight_kg?: number
        }
        Relationships: []
      }
      sets: {
        Row: {
          attempts: Json
          created_at: string
          ended_at: string
          ended_by: string
          engine_report: Json
          engine_version: string
          id: string
          keypoints_url: string | null
          kind: string
          llm_feedback: string | null
          repair_declined: boolean
          set_no: number
          similarity: Json | null
          started_at: string
          totals: Json
          video_url: string | null
          workout_id: string
        }
        Insert: {
          attempts: Json
          created_at?: string
          ended_at: string
          ended_by: string
          engine_report: Json
          engine_version: string
          id?: string
          keypoints_url?: string | null
          kind: string
          llm_feedback?: string | null
          repair_declined?: boolean
          set_no: number
          similarity?: Json | null
          started_at: string
          totals: Json
          video_url?: string | null
          workout_id: string
        }
        Update: {
          attempts?: Json
          created_at?: string
          ended_at?: string
          ended_by?: string
          engine_report?: Json
          engine_version?: string
          id?: string
          keypoints_url?: string | null
          kind?: string
          llm_feedback?: string | null
          repair_declined?: boolean
          set_no?: number
          similarity?: Json | null
          started_at?: string
          totals?: Json
          video_url?: string | null
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sets_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workouts: {
        Row: {
          ended_at: string | null
          exercise_id: string
          id: string
          rest_seconds: number
          started_at: string
          target_reps: number
          target_sets: number
          user_id: string
        }
        Insert: {
          ended_at?: string | null
          exercise_id: string
          id?: string
          rest_seconds: number
          started_at?: string
          target_reps: number
          target_sets: number
          user_id: string
        }
        Update: {
          ended_at?: string | null
          exercise_id?: string
          id?: string
          rest_seconds?: number
          started_at?: string
          target_reps?: number
          target_sets?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workouts_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      exercise_logic_valid: { Args: { logic: Json }; Returns: boolean }
      owns_workout: { Args: { workout: string }; Returns: boolean }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
    Enums: {},
  },
} as const

