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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      clients: {
        Row: {
          address: string | null
          city: string | null
          country: string
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          uid_number: string | null
          user_id: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          uid_number?: string | null
          user_id?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          uid_number?: string | null
          user_id?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          amount_net: number | null
          category_label: string
          created_at: string
          deductible_amount: number | null
          description: string
          e1a_kz: string
          expense_date: string
          id: string
          is_bewirtung: boolean
          km_driven: number | null
          receipt_url: string | null
          user_id: string
        }
        Insert: {
          amount: number
          amount_net?: number | null
          category_label: string
          created_at?: string
          deductible_amount?: number | null
          description?: string
          e1a_kz: string
          expense_date: string
          id?: string
          is_bewirtung?: boolean
          km_driven?: number | null
          receipt_url?: string | null
          user_id?: string
        }
        Update: {
          amount?: number
          amount_net?: number | null
          category_label?: string
          created_at?: string
          deductible_amount?: number | null
          description?: string
          e1a_kz?: string
          expense_date?: string
          id?: string
          is_bewirtung?: boolean
          km_driven?: number | null
          receipt_url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          client_id: string | null
          created_at: string
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string
          is_honorarnote: boolean
          line_items: Json
          notes: string | null
          paid_at: string | null
          status: string
          subtotal: number
          total: number
          user_id: string
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_date: string
          invoice_number: string
          is_honorarnote?: boolean
          line_items?: Json
          notes?: string | null
          paid_at?: string | null
          status?: string
          subtotal?: number
          total?: number
          user_id?: string
          vat_amount?: number
          vat_rate?: number
        }
        Update: {
          client_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          is_honorarnote?: boolean
          line_items?: Json
          notes?: string | null
          paid_at?: string | null
          status?: string
          subtotal?: number
          total?: number
          user_id?: string
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          business_name: string | null
          business_type: string | null
          city: string | null
          country: string
          created_at: string
          full_name: string | null
          iban: string | null
          id: string
          industry_code: string | null
          invoice_footer_text: string | null
          invoice_number_format: string
          is_kleinunternehmer: boolean
          onboarding_completed: boolean
          pausch_type: string | null
          profit_method: string
          stripe_customer_id: string | null
          subscription_status: string
          svs_exempt: boolean
          svs_registration_date: string | null
          trial_ends_at: string
          uid_number: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          business_name?: string | null
          business_type?: string | null
          city?: string | null
          country?: string
          created_at?: string
          full_name?: string | null
          iban?: string | null
          id: string
          industry_code?: string | null
          invoice_footer_text?: string | null
          invoice_number_format?: string
          is_kleinunternehmer?: boolean
          onboarding_completed?: boolean
          pausch_type?: string | null
          profit_method?: string
          stripe_customer_id?: string | null
          subscription_status?: string
          svs_exempt?: boolean
          svs_registration_date?: string | null
          trial_ends_at?: string
          uid_number?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          business_name?: string | null
          business_type?: string | null
          city?: string | null
          country?: string
          created_at?: string
          full_name?: string | null
          iban?: string | null
          id?: string
          industry_code?: string | null
          invoice_footer_text?: string | null
          invoice_number_format?: string
          is_kleinunternehmer?: boolean
          onboarding_completed?: boolean
          pausch_type?: string | null
          profit_method?: string
          stripe_customer_id?: string | null
          subscription_status?: string
          svs_exempt?: boolean
          svs_registration_date?: string | null
          trial_ends_at?: string
          uid_number?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      svs_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          payment_date: string
          quarter: string | null
          user_id: string
          year: number
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          notes?: string | null
          payment_date: string
          quarter?: string | null
          user_id?: string
          year: number
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string
          quarter?: string | null
          user_id?: string
          year?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
