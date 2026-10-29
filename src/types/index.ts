import type { Database } from './database';

type Tables = Database['public']['Tables'];

// Datenbank-Zeilen
export type Profile = Tables['profiles']['Row'];
export type Client = Tables['clients']['Row'];
export type Invoice = Tables['invoices']['Row'];
export type Expense = Tables['expenses']['Row'];
export type SvsPayment = Tables['svs_payments']['Row'];
export type Asset = Tables['assets']['Row'];
export type Income = Tables['incomes']['Row'];
export type Product = Tables['products']['Row'];
export type ImportRecord = Tables['imports']['Row'];
export type RecurringExpense = Tables['recurring_expenses']['Row'];
export type InvoiceTemplate = Tables['invoice_templates']['Row'];
export type TaxYear = Tables['tax_years']['Row'];

export type ProfileUpdate = Tables['profiles']['Update'];
export type ClientInsert = Tables['clients']['Insert'];
export type InvoiceInsert = Tables['invoices']['Insert'];
export type ExpenseInsert = Tables['expenses']['Insert'];
export type SvsPaymentInsert = Tables['svs_payments']['Insert'];
export type AssetInsert = Tables['assets']['Insert'];
export type IncomeInsert = Tables['incomes']['Insert'];
export type RecurringExpenseInsert = Tables['recurring_expenses']['Insert'];
export type RecurringExpenseUpdate = Tables['recurring_expenses']['Update'];
export type TaxYearInsert = Tables['tax_years']['Insert'];

// Domänen-Enums (entsprechen den CHECK-Constraints in der DB)
export type ProfitMethod = 'pauschal' | 'euer';
export type PauschType = 'ku' | 'basis_15' | 'basis_6';
export type IndustryType = 'service' | 'trade';
export type BusinessType = 'gewerbetreibend' | 'neue_selbstaendige';
export type OtherIncomeKind = 'none' | 'employment' | 'pension';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
export type SubscriptionStatus = 'trial' | 'active' | 'expired';
export type InvoicePaymentMethod = 'transfer' | 'cash';
export type VatRate = 0 | 10 | 13 | 20;
export type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';
export type Vehicle = 'car' | 'motorbike' | 'bike';

export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  unit?: string; // z. B. „Std.“, „km“, „pauschal“ (optional)
}

export type AlertUrgency = 'info' | 'warning' | 'critical';

export interface AppAlert {
  id: string;
  urgency: AlertUrgency;
  message: string;
}
