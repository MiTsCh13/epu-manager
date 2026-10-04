import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from 'vite';

// Supabase-URL und Anon-Key aus .env.local – die Tests legen damit eigene Testnutzer an und löschen sie wieder
Object.assign(process.env, loadEnv('development', process.cwd(), ''));

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://localhost:5173', locale: 'de-AT', timezoneId: 'Europe/Vienna', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
