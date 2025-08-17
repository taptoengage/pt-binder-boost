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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      client_service_rates: {
        Row: {
          client_id: string
          created_at: string
          id: string
          rate: number
          service_type_id: string
          trainer_id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          rate: number
          service_type_id: string
          trainer_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          rate?: number
          service_type_id?: string
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_service_rates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_service_rates_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_service_rates_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      client_subscriptions: {
        Row: {
          billing_amount: number | null
          billing_cycle: string
          client_id: string
          created_at: string
          end_date: string | null
          id: string
          payment_frequency: string
          start_date: string
          status: Database["public"]["Enums"]["client_subscription_status_enum"]
          trainer_id: string
          updated_at: string
        }
        Insert: {
          billing_amount?: number | null
          billing_cycle: string
          client_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          payment_frequency: string
          start_date: string
          status?: Database["public"]["Enums"]["client_subscription_status_enum"]
          trainer_id: string
          updated_at?: string
        }
        Update: {
          billing_amount?: number | null
          billing_cycle?: string
          client_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          payment_frequency?: string
          start_date?: string
          status?: Database["public"]["Enums"]["client_subscription_status_enum"]
          trainer_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          created_at: string
          default_session_rate: number
          email: string
          first_name: string
          id: string
          last_name: string
          name: string
          phone_number: string
          physical_activity_readiness: string | null
          rough_goals: string | null
          trainer_id: string
          training_age: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          default_session_rate?: number
          email: string
          first_name?: string
          id?: string
          last_name?: string
          name: string
          phone_number: string
          physical_activity_readiness?: string | null
          rough_goals?: string | null
          trainer_id: string
          training_age?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          default_session_rate?: number
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          name?: string
          phone_number?: string
          physical_activity_readiness?: string | null
          rough_goals?: string | null
          trainer_id?: string
          training_age?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          client_id: string
          client_subscription_id: string | null
          created_at: string
          date_paid: string | null
          due_date: string
          id: string
          receipt_number: string | null
          service_type_id: string
          session_pack_id: string | null
          status: string
          trainer_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          client_id: string
          client_subscription_id?: string | null
          created_at?: string
          date_paid?: string | null
          due_date: string
          id?: string
          receipt_number?: string | null
          service_type_id: string
          session_pack_id?: string | null
          status: string
          trainer_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          client_id?: string
          client_subscription_id?: string | null
          created_at?: string
          date_paid?: string | null
          due_date?: string
          id?: string
          receipt_number?: string | null
          service_type_id?: string
          session_pack_id?: string | null
          status?: string
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_payment_client_subscription"
            columns: ["client_subscription_id"]
            isOneToOne: false
            referencedRelation: "client_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_payment_session_pack"
            columns: ["session_pack_id"]
            isOneToOne: false
            referencedRelation: "session_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      service_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          trainer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          trainer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_types_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      session_packs: {
        Row: {
          amount_paid: number
          client_id: string
          created_at: string
          expiry_date: string | null
          id: string
          payment_id: string | null
          purchase_date: string
          service_type_id: string
          sessions_remaining: number
          status: string
          total_sessions: number
          trainer_id: string
          updated_at: string
        }
        Insert: {
          amount_paid: number
          client_id: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          payment_id?: string | null
          purchase_date?: string
          service_type_id: string
          sessions_remaining: number
          status?: string
          total_sessions: number
          trainer_id: string
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          client_id?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          payment_id?: string | null
          purchase_date?: string
          service_type_id?: string
          sessions_remaining?: number
          status?: string
          total_sessions?: number
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_packs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_packs_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_packs_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_packs_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          cancellation_reason: string | null
          client_id: string
          created_at: string
          credit_id_consumed: string | null
          id: string
          is_from_credit: boolean
          notes: string | null
          service_type_id: string
          session_date: string
          session_pack_id: string | null
          status: string
          subscription_id: string | null
          trainer_id: string
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          client_id: string
          created_at?: string
          credit_id_consumed?: string | null
          id?: string
          is_from_credit?: boolean
          notes?: string | null
          service_type_id: string
          session_date: string
          session_pack_id?: string | null
          status: string
          subscription_id?: string | null
          trainer_id: string
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          client_id?: string
          created_at?: string
          credit_id_consumed?: string | null
          id?: string
          is_from_credit?: boolean
          notes?: string | null
          service_type_id?: string
          session_date?: string
          session_pack_id?: string | null
          status?: string
          subscription_id?: string | null
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_credit_id_consumed_fkey"
            columns: ["credit_id_consumed"]
            isOneToOne: false
            referencedRelation: "subscription_session_credits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_session_pack_id_fkey"
            columns: ["session_pack_id"]
            isOneToOne: false
            referencedRelation: "session_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "client_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_billing_periods: {
        Row: {
          amount_due: number
          client_subscription_id: string
          created_at: string | null
          id: string
          payment_id: string | null
          period_end_date: string
          period_start_date: string
          status: string
          updated_at: string | null
        }
        Insert: {
          amount_due: number
          client_subscription_id: string
          created_at?: string | null
          id?: string
          payment_id?: string | null
          period_end_date: string
          period_start_date: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          amount_due?: number
          client_subscription_id?: string
          created_at?: string | null
          id?: string
          payment_id?: string | null
          period_end_date?: string
          period_start_date?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_billing_periods_client_subscription_id_fkey"
            columns: ["client_subscription_id"]
            isOneToOne: false
            referencedRelation: "client_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_billing_periods_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_service_allocations: {
        Row: {
          cost_per_session: number
          created_at: string
          id: string
          period_type: string
          quantity_per_period: number
          service_type_id: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          cost_per_session: number
          created_at?: string
          id?: string
          period_type: string
          quantity_per_period: number
          service_type_id: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          cost_per_session?: number
          created_at?: string
          id?: string
          period_type?: string
          quantity_per_period?: number
          service_type_id?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_subscription_service_allocations_service_type"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_service_allocations_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "client_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_session_credits: {
        Row: {
          created_at: string
          credit_amount: number
          credit_reason: string | null
          credit_value: number
          expires_at: string | null
          id: string
          originating_session_id: string | null
          service_type_id: string
          status: Database["public"]["Enums"]["session_credit_status_enum"]
          subscription_id: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          credit_amount?: number
          credit_reason?: string | null
          credit_value: number
          expires_at?: string | null
          id?: string
          originating_session_id?: string | null
          service_type_id: string
          status?: Database["public"]["Enums"]["session_credit_status_enum"]
          subscription_id: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          credit_amount?: number
          credit_reason?: string | null
          credit_value?: number
          expires_at?: string | null
          id?: string
          originating_session_id?: string | null
          service_type_id?: string
          status?: Database["public"]["Enums"]["session_credit_status_enum"]
          subscription_id?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_session_credits_originating_session_id_fkey"
            columns: ["originating_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_session_credits_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_session_credits_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "client_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_availability_exceptions: {
        Row: {
          created_at: string | null
          end_time: string | null
          exception_date: string
          exception_type: string
          id: string
          is_available: boolean
          notes: string | null
          start_time: string | null
          trainer_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          end_time?: string | null
          exception_date: string
          exception_type: string
          id?: string
          is_available: boolean
          notes?: string | null
          start_time?: string | null
          trainer_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          end_time?: string | null
          exception_date?: string
          exception_type?: string
          id?: string
          is_available?: boolean
          notes?: string | null
          start_time?: string | null
          trainer_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trainer_availability_exceptions_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainer_availability_templates: {
        Row: {
          created_at: string | null
          day_of_week: string
          end_time: string
          id: string
          start_time: string
          trainer_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          day_of_week: string
          end_time: string
          id?: string
          start_time: string
          trainer_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          day_of_week?: string
          end_time?: string
          id?: string
          start_time?: string
          trainer_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trainer_availability_templates_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainers: {
        Row: {
          business_name: string
          contact_email: string
          created_at: string | null
          facebook_id: string | null
          first_name: string
          id: string
          instagram_handle: string | null
          last_name: string
          phone: string | null
          trainerize_id: string | null
          updated_at: string | null
          wechat_id: string | null
          whatsapp_id: string | null
        }
        Insert: {
          business_name: string
          contact_email: string
          created_at?: string | null
          facebook_id?: string | null
          first_name?: string
          id?: string
          instagram_handle?: string | null
          last_name?: string
          phone?: string | null
          trainerize_id?: string | null
          updated_at?: string | null
          wechat_id?: string | null
          whatsapp_id?: string | null
        }
        Update: {
          business_name?: string
          contact_email?: string
          created_at?: string | null
          facebook_id?: string | null
          first_name?: string
          id?: string
          instagram_handle?: string | null
          last_name?: string
          phone?: string | null
          trainerize_id?: string | null
          updated_at?: string | null
          wechat_id?: string | null
          whatsapp_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      decrement_pack_sessions: {
        Args: {
          expected_remaining: number
          pack_id: string
          trainer_id: string
        }
        Returns: boolean
      }
      increment_pack_sessions: {
        Args: { inc?: number; pack_id: string; trainer_id: string }
        Returns: boolean
      }
      validate_pack_integrity: {
        Args: Record<PropertyKey, never>
        Returns: {
          actual_used_sessions: number
          calculated_remaining: number
          has_integrity_issue: boolean
          pack_id: string
          sessions_remaining: number
          total_sessions: number
        }[]
      }
    }
    Enums: {
      client_subscription_status_enum:
        | "active"
        | "paused"
        | "ended"
        | "cancelled"
      session_credit_status_enum:
        | "available"
        | "used_for_session"
        | "applied_to_payment"
        | "expired"
        | "forfeited"
        | "refunded"
      session_status_enum:
        | "scheduled"
        | "completed"
        | "cancelled_early"
        | "cancelled_late"
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
    Enums: {
      client_subscription_status_enum: [
        "active",
        "paused",
        "ended",
        "cancelled",
      ],
      session_credit_status_enum: [
        "available",
        "used_for_session",
        "applied_to_payment",
        "expired",
        "forfeited",
        "refunded",
      ],
      session_status_enum: [
        "scheduled",
        "completed",
        "cancelled_early",
        "cancelled_late",
      ],
    },
  },
} as const
