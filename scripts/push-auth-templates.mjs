// Auth-Mailvorlagen (supabase/templates/*.html) ins Supabase-Projekt übertragen – über die Management-API,
// damit nur Betreff und Inhalt der Mails geändert werden. `supabase config push` würde auch Site-URL, SMTP
// und Limits aus der (lokalen) config.toml mitschicken.
//
//   node scripts/push-auth-templates.mjs            → Vorschau (Dry-Run), schickt nichts
//   node scripts/push-auth-templates.mjs --apply    → überträgt die Vorlagen
//
// Braucht SUPABASE_ACCESS_TOKEN und VITE_SUPABASE_URL in .env.local.
import { readFileSync } from 'node:fs';

process.loadEnvFile('.env.local');

const TEMPLATES = {
  confirmation: 'Bitte bestätige deine E-Mail-Adresse für Klaro',
  recovery: 'Neues Passwort für Klaro festlegen',
  magic_link: 'Dein Anmeldelink für Klaro',
  email_change: 'Bitte bestätige deine neue E-Mail-Adresse für Klaro',
  invite: 'Du wurdest zu Klaro eingeladen',
  reauthentication: 'Dein Bestätigungscode für Klaro',
};

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.VITE_SUPABASE_URL?.match(/^https:\/\/([^.]+)\./)?.[1];
if (!token || !ref) throw new Error('SUPABASE_ACCESS_TOKEN oder VITE_SUPABASE_URL fehlt in .env.local');

const payload = {};
for (const [name, subject] of Object.entries(TEMPLATES)) {
  payload[`mailer_subjects_${name}`] = subject;
  payload[`mailer_templates_${name}_content`] = readFileSync(`supabase/templates/${name}.html`, 'utf8');
}

console.log(`Projekt ${ref} – folgende Felder werden gesetzt:`);
for (const [key, value] of Object.entries(payload)) {
  console.log(`  ${key}: ${key.includes('subjects') ? value : `${value.length} Zeichen HTML`}`);
}

if (!process.argv.includes('--apply')) {
  console.log('\nDry-Run – nichts übertragen. Mit --apply ausführen, um die Vorlagen einzuspielen.');
  process.exit(0);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});
if (!res.ok) throw new Error(`Übertragen fehlgeschlagen (HTTP ${res.status}): ${await res.text()}`);
console.log('\nVorlagen übertragen.');
