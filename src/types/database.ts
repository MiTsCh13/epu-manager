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
      assets: {
        Row: {
          amount: number
          amount_net: number | null
          category_label: string
          cost: number | null
          created_at: string
          description: string
          id: string
          import_id: string | null
          purchase_date: string
          receipt_url: string | null
          useful_life_years: number
          user_id: string
        }
        Insert: {
          amount: number
          amount_net?: number | null
          category_label: string
          cost?: number | null
          created_at?: string
          description?: string
          id?: string
          import_id?: string | null
          purchase_date: string
          receipt_url?: string | null
          useful_life_years: number
          user_id?: string
        }
        Update: {
          amount?: number
          amount_net?: number | null
          category_label?: string
          cost?: number | null
          created_at?: string
          description?: string
          id?: string
          import_id?: string | null
          purchase_date?: string
          receipt_url?: string | null
          useful_life_years?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
        ]
      }
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
          phone: string | null
          template_id: string | null
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
          phone?: string | null
          template_id?: string | null
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
          phone?: string | null
          template_id?: string | null
          uid_number?: string | null
          user_id?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_template_fkey"
            columns: ["template_id", "user_id"]
            isOneToOne: false
            referencedRelation: "invoice_templates"
            referencedColumns: ["id", "user_id"]
          },
        ]
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
          import_id: string | null
          is_bewirtung: boolean
          km_driven: number | null
          nights: number | null
          receipt_url: string | null
          recurring_id: string | null
          reimbursed: boolean
          trip_hours: number | null
          user_id: string
          vehicle: string | null
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
          import_id?: string | null
          is_bewirtung?: boolean
          km_driven?: number | null
          nights?: number | null
          receipt_url?: string | null
          recurring_id?: string | null
          reimbursed?: boolean
          trip_hours?: number | null
          user_id?: string
          vehicle?: string | null
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
          import_id?: string | null
          is_bewirtung?: boolean
          km_driven?: number | null
          nights?: number | null
          receipt_url?: string | null
          recurring_id?: string | null
          reimbursed?: boolean
          trip_hours?: number | null
          user_id?: string
          vehicle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_recurring_id_fkey"
            columns: ["recurring_id", "user_id"]
            isOneToOne: false
            referencedRelation: "recurring_expenses"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      imports: {
        Row: {
          created_at: string
          id: string
          source_name: string
          summary: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          source_name?: string
          summary?: Json
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          source_name?: string
          summary?: Json
          user_id?: string
        }
        Relationships: []
      }
      incomes: {
        Row: {
          amount: number
          amount_net: number | null
          created_at: string
          description: string
          id: string
          import_id: string | null
          income_date: string
          reference: string | null
          user_id: string
        }
        Insert: {
          amount: number
          amount_net?: number | null
          created_at?: string
          description?: string
          id?: string
          import_id?: string | null
          income_date: string
          reference?: string | null
          user_id?: string
        }
        Update: {
          amount?: number
          amount_net?: number | null
          created_at?: string
          description?: string
          id?: string
          import_id?: string | null
          income_date?: string
          reference?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incomes_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_templates: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          settings: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          settings?: Json
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          settings?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          client_id: string | null
          client_snapshot: Json | null
          created_at: string
          due_date: string | null
          footer_text: string | null
          id: string
          intro_text: string | null
          invoice_date: string
          invoice_number: string
          is_honorarnote: boolean
          issuer_snapshot: Json | null
          line_items: Json
          notes: string | null
          paid_at: string | null
          payment_method: string
          service_date_from: string | null
          service_date_to: string | null
          status: string
          subtotal: number
          template_id: string | null
          template_snapshot: Json | null
          total: number
          user_id: string
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          client_id?: string | null
          client_snapshot?: Json | null
          created_at?: string
          due_date?: string | null
          footer_text?: string | null
          id?: string
          intro_text?: string | null
          invoice_date: string
          invoice_number: string
          is_honorarnote?: boolean
          issuer_snapshot?: Json | null
          line_items?: Json
          notes?: string | null
          paid_at?: string | null
          payment_method?: string
          service_date_from?: string | null
          service_date_to?: string | null
          status?: string
          subtotal?: number
          template_id?: string | null
          template_snapshot?: Json | null
          total?: number
          user_id?: string
          vat_amount?: number
          vat_rate?: number
        }
        Update: {
          client_id?: string | null
          client_snapshot?: Json | null
          created_at?: string
          due_date?: string | null
          footer_text?: string | null
          id?: string
          intro_text?: string | null
          invoice_date?: string
          invoice_number?: string
          is_honorarnote?: boolean
          issuer_snapshot?: Json | null
          line_items?: Json
          notes?: string | null
          paid_at?: string | null
          payment_method?: string
          service_date_from?: string | null
          service_date_to?: string | null
          status?: string
          subtotal?: number
          template_id?: string | null
          template_snapshot?: Json | null
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
          {
            foreignKeyName: "invoices_template_fkey"
            columns: ["template_id", "user_id"]
            isOneToOne: false
            referencedRelation: "invoice_templates"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_holder: string | null
          address: string | null
          assessed_through_year: number | null
          business_name: string | null
          business_type: string | null
          city: string | null
          country: string
          created_at: string
          est_prepayment_quarterly: number | null
          full_name: string | null
          home_office: boolean | null
          iban: string | null
          id: string
          industry_code: string | null
          invoice_footer_text: string | null
          invoice_number_format: string
          is_kleinunternehmer: boolean
          onboarding_completed: boolean
          other_income_amount: number | null
          other_income_kind: string | null
          pausch_type: string | null
          profit_method: string
          revenue_estimate: number | null
          revenue_estimate_year: number | null
          stripe_customer_id: string | null
          subscription_cancel_at_period_end: boolean
          subscription_renews_at: string | null
          subscription_status: string
          svs_exempt: boolean
          svs_quarterly_prescription: number | null
          svs_registration_date: string | null
          trial_ends_at: string
          uid_number: string | null
          zip_code: string | null
        }
        Insert: {
          account_holder?: string | null
          address?: string | null
          assessed_through_year?: number | null
          business_name?: string | null
          business_type?: string | null
          city?: string | null
          country?: string
          created_at?: string
          est_prepayment_quarterly?: number | null
          full_name?: string | null
          home_office?: boolean | null
          iban?: string | null
          id: string
          industry_code?: string | null
          invoice_footer_text?: string | null
          invoice_number_format?: string
          is_kleinunternehmer?: boolean
          onboarding_completed?: boolean
          other_income_amount?: number | null
          other_income_kind?: string | null
          pausch_type?: string | null
          profit_method?: string
          revenue_estimate?: number | null
          revenue_estimate_year?: number | null
          stripe_customer_id?: string | null
          subscription_cancel_at_period_end?: boolean
          subscription_renews_at?: string | null
          subscription_status?: string
          svs_exempt?: boolean
          svs_quarterly_prescription?: number | null
          svs_registration_date?: string | null
          trial_ends_at?: string
          uid_number?: string | null
          zip_code?: string | null
        }
        Update: {
          account_holder?: string | null
          address?: string | null
          assessed_through_year?: number | null
          business_name?: string | null
          business_type?: string | null
          city?: string | null
          country?: string
          created_at?: string
          est_prepayment_quarterly?: number | null
          full_name?: string | null
          home_office?: boolean | null
          iban?: string | null
          id?: string
          industry_code?: string | null
          invoice_footer_text?: string | null
          invoice_number_format?: string
          is_kleinunternehmer?: boolean
          onboarding_completed?: boolean
          other_income_amount?: number | null
          other_income_kind?: string | null
          pausch_type?: string | null
          profit_method?: string
          revenue_estimate?: number | null
          revenue_estimate_year?: number | null
          stripe_customer_id?: string | null
          subscription_cancel_at_period_end?: boolean
          subscription_renews_at?: string | null
          subscription_status?: string
          svs_exempt?: boolean
          svs_quarterly_prescription?: number | null
          svs_registration_date?: string | null
          trial_ends_at?: string
          uid_number?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      receipt_scans: {
        Row: {
          created_at: string
          id: string
          input_tokens: number
          kind: string
          model: string
          output_tokens: number
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          input_tokens?: number
          kind?: string
          model: string
          output_tokens?: number
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          input_tokens?: number
          kind?: string
          model?: string
          output_tokens?: number
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      recurring_expenses: {
        Row: {
          amount: number
          amount_net: number | null
          auto_book: boolean
          category_label: string
          created_at: string
          deductible_amount: number
          description: string
          e1a_kz: string
          end_date: string | null
          id: string
          interval_months: number
          is_bewirtung: boolean
          next_date: string
          paused: boolean
          reimbursed: boolean
          start_date: string
          user_id: string
        }
        Insert: {
          amount: number
          amount_net?: number | null
          auto_book?: boolean
          category_label: string
          created_at?: string
          deductible_amount: number
          description?: string
          e1a_kz: string
          end_date?: string | null
          id?: string
          interval_months: number
          is_bewirtung?: boolean
          next_date: string
          paused?: boolean
          reimbursed?: boolean
          start_date: string
          user_id?: string
        }
        Update: {
          amount?: number
          amount_net?: number | null
          auto_book?: boolean
          category_label?: string
          created_at?: string
          deductible_amount?: number
          description?: string
          e1a_kz?: string
          end_date?: string | null
          id?: string
          interval_months?: number
          is_bewirtung?: boolean
          next_date?: string
          paused?: boolean
          reimbursed?: boolean
          start_date?: string
          user_id?: string
        }
        Relationships: []
      }
      svs_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          import_id: string | null
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
          import_id?: string | null
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
          import_id?: string | null
          notes?: string | null
          payment_date?: string
          quarter?: string | null
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "svs_payments_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      book_recurring: {
        Args: {
          p_dates: string[]
          p_expected: string
          p_id: string
          p_next: string
        }
        Returns: string
      }
      delete_recurring: {
        Args: { p_id: string; p_with_bookings: boolean }
        Returns: {
          receipt_url: string
        }[]
      }
      delete_user_data: { Args: { p_user: string }; Returns: undefined }
      has_active_access: { Args: { p_user: string }; Returns: boolean }
      set_default_template: { Args: { p_id: string }; Returns: undefined }
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
