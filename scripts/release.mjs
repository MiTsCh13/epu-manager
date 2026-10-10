// Release auf Produktion (klaro.zesawa.com): erst Datenbank und Edge Functions, dann Frontend.
// Die Reihenfolge ist wichtig – das neue Frontend erwartet die neuen Spalten schon.
//
//   npm run release              → prüft, zeigt den Dry-Run der Migrationen und fragt vor jedem Schritt
//
// Ablauf:
//   1. Arbeitsbaum sauber, Branch main, nichts Ungepushtes von anderen
//   2. Unit-Tests, Typen + Build
//   3. Migrationen: Dry-Run → Rückfrage → einspielen
//   4. Edge Functions hochladen
//   5. git push → Vercel baut und veröffentlicht
//
// Braucht in .env.local: SUPABASE_PROD_DB_PASSWORD, SUPABASE_PROD_ACCESS_TOKEN.
import { execSync, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

process.loadEnvFile('.env.local');

const PROD_REF = 'zrokseyitjsaohnxdxbe';
const POOLER = 'aws-0-eu-west-1.pooler.supabase.com:5432'; // Projekt liegt in Irland; direkte Verbindung nur per IPv6
const { SUPABASE_PROD_DB_PASSWORD: dbPassword, SUPABASE_PROD_ACCESS_TOKEN: token } = process.env;
if (!dbPassword || !token) throw new Error('SUPABASE_PROD_DB_PASSWORD oder SUPABASE_PROD_ACCESS_TOKEN fehlt in .env.local');

const dbUrl = `postgresql://postgres.${PROD_REF}:${encodeURIComponent(dbPassword)}@${POOLER}/postgres`;
const env = { ...process.env, SUPABASE_ACCESS_TOKEN: token }; // Supabase-CLI mit dem Schlüssel fürs Produktionsprojekt

const rl = createInterface({ input: process.stdin, output: process.stdout });
const out = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

/** Befehl ausführen, Ausgabe direkt zeigen; bei Fehler abbrechen. Das DB-Passwort taucht nie in der Ausgabe auf. */
function run(label, cmd, args) {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', env });
  if (r.status !== 0) {
    console.error(`\n✗ ${label} fehlgeschlagen – Release abgebrochen.`);
    process.exit(1);
  }
}

async function confirm(question) {
  const answer = (await rl.question(`\n${question} [j/N] `)).trim().toLowerCase();
  if (answer !== 'j' && answer !== 'ja') {
    console.log('Abgebrochen.');
    process.exit(0);
  }
}

// 1. Git-Stand
if (out('git rev-parse --abbrev-ref HEAD') !== 'main') throw new Error('Release nur von main.');
if (out('git status --porcelain')) throw new Error('Es gibt uncommittete Änderungen – erst committen.');
execSync('git fetch origin main', { stdio: 'ignore' });
if (out('git rev-list --count HEAD..origin/main') !== '0') throw new Error('origin/main hat neuere Commits – erst „git pull“.');
const pending = out('git log --oneline origin/main..HEAD');
console.log(pending ? `Neu in diesem Release:\n${pending}` : 'Keine neuen Commits – es werden nur Datenbank und Functions abgeglichen.');

// 2. Prüfen
run('Unit-Tests', 'npm', ['run', 'test']);
run('Typen + Build', 'npm', ['run', 'build']);

// 3. Migrationen
run('Migrationen auf Produktion (Dry-Run)', 'npx', ['supabase', 'db', 'push', '--dry-run', '--db-url', dbUrl]);
await confirm('Diese Migrationen auf Produktion einspielen?');
run('Migrationen einspielen', 'npx', ['supabase', 'db', 'push', '--db-url', dbUrl, '--yes']);

// 4. Edge Functions
run('Edge Functions hochladen', 'npx', ['supabase', 'functions', 'deploy', '--project-ref', PROD_REF, '--use-api']);

// 5. Frontend
if (pending) {
  await confirm('Jetzt pushen? Vercel veröffentlicht dann auf klaro.zesawa.com.');
  run('git push', 'git', ['push', 'origin', 'main']);
  console.log('\n✓ Fertig. Vercel baut jetzt – Status unter vercel.com (Deployments).');
} else {
  console.log('\n✓ Fertig.');
}
rl.close();
