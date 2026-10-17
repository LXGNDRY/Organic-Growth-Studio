import nextEnv from '@next/env';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

nextEnv.loadEnvConfig(process.cwd());
const required = ['APP_ACCESS_TOKEN', 'SESSION_SECRET', 'AUTOPILOT_TOKEN'];
const missing = required.filter(name => {
  const value = process.env[name];
  return !value || value.length < 32 || value.startsWith('replace-');
});
if (missing.length) {
  console.error('Set strong, unique values for ' + missing.join(', ') + ' in .env.local before starting.');
  process.exit(1);
}

const port = String(process.env.PORT || 3010);
const host = process.env.HOSTNAME || '127.0.0.1';
const production = process.env.APP_MODE === 'production';
if (production && !existsSync('.next/BUILD_ID')) {
  console.error('Build the production app first with pnpm build.');
  process.exit(1);
}
const base = (process.env.AUTOPILOT_BASE_URL || 'http://127.0.0.1:' + port).replace(/\/$/, '');
const args = ['node_modules/next/dist/bin/next', production ? 'start' : 'dev', '-H', host, '-p', port];
const server = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });
let stopping = false;
let ticking = false;
let unreachable = 0;
let sessionCookie = '';

async function stop() {
  if (stopping) return;
  stopping = true;
  server.kill('SIGTERM');
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', code => { if (!stopping) process.exit(code ?? 1); });

async function ownerCookie() {
  if (sessionCookie) return sessionCookie;
  const response = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: process.env.APP_ACCESS_TOKEN }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Owner sign-in returned HTTP ' + response.status);
  sessionCookie = response.headers.get('set-cookie')?.split(';', 1)[0] || '';
  if (!sessionCookie) throw new Error('Owner sign-in did not return a session cookie.');
  return sessionCookie;
}

console.log('Personal app starting at ' + base + '; the autopilot checks every 30 seconds.');
while (!stopping) {
  try {
    if (!ticking) {
      const cookie = await ownerCookie();
      const response = await fetch(base + '/api/agent', {
        headers: { cookie },
        signal: AbortSignal.timeout(3000),
      });
      unreachable = 0;
      if (response.status === 401) {
        sessionCookie = '';
      } else if (response.ok) {
        const state = await response.json();
        const due = state.config?.enabled && (!state.config.nextRunAt || Date.parse(state.config.nextRunAt) <= Date.now());
        if (due) {
          ticking = true;
          try {
            const result = await fetch(base + '/api/agent/tick', {
              method: 'POST',
              headers: { authorization: 'Bearer ' + process.env.AUTOPILOT_TOKEN },
              signal: AbortSignal.timeout(180000),
            });
            console.log('Autopilot cycle: ' + result.status + ' ' + await result.text());
          } finally {
            ticking = false;
          }
        }
      }
    }
  } catch (error) {
    if (!stopping) {
      unreachable += 1;
      console.log('Autopilot waiting for app: ' + (error instanceof Error ? error.message : 'connection error'));
      // The app can serve pages and pass health checks while the autopilot
      // points somewhere else - a stale AUTOPILOT_BASE_URL does exactly that.
      // Nothing then ticks, and the only symptom is a line that looks like
      // startup noise, so say plainly that the engine is not running.
      if (unreachable === 5 || unreachable % 60 === 0) {
        console.error(
          `Autopilot has not reached the app at ${base} for ${unreachable} attempts; no cycles are running. ` +
          'Check AUTOPILOT_BASE_URL and PORT agree with the port the app bound.',
        );
      }
    }
  }
  await delay(30_000);
}
