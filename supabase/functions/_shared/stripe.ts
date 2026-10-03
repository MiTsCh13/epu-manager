// Gemeinsame Helfer für die Stripe-Edge-Functions (Deno)
import Stripe from 'npm:stripe@17.7.0';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2025-02-24.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

/** Service-Role-Client: umgeht RLS – nur serverseitig verwenden. */
export const admin: SupabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:5173';

/** Rücksprung-URL: erlaubt APP_URL und lokale Entwicklung, sonst APP_URL. */
export function appOrigin(req: Request): string {
  const origin = req.headers.get('origin') ?? '';
  return origin === APP_URL || /^http:\/\/localhost:\d+$/.test(origin) ? origin : APP_URL;
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/** Eingeloggten Nutzer aus dem Authorization-Header ermitteln. */
export async function getUser(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  return data.user ?? null;
}
