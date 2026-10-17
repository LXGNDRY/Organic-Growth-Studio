// Boots the built app and checks that the auth boundary actually holds.
//
// The manifest check in verify-build.mjs proves middleware is registered. It
// cannot prove the boundary is right: a wrong matcher, a path added to the
// public list by mistake, or a broken session check all leave it registered
// and still open. Only a running server answers that, so this starts one.
//
// Owner authentication was inert for weeks behind green lint, types, tests
// and build, because none of them start the app.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.SMOKE_PORT ?? 3099);
const base = `http://127.0.0.1:${PORT}`;
const token = randomBytes(32).toString('base64url');
const dataDir = mkdtempSync(join(tmpdir(), 'ogs-smoke-'));

const server = spawn('node_modules/.bin/next', ['start', '-p', String(PORT)], {
  env: {
    ...process.env,
    APP_ACCESS_TOKEN: token,
    SESSION_SECRET: randomBytes(32).toString('base64url'),
    AUTOPILOT_TOKEN: randomBytes(32).toString('base64url'),
    DATA_DIR: dataDir,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverOutput = '';
server.stdout.on('data', c => { serverOutput += c; });
server.stderr.on('data', c => { serverOutput += c; });

const stop = () => {
  server.kill('SIGTERM');
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ }
};

const failures = [];
const check = (name, actual, expected) => {
  const ok = actual === expected;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}: ${actual}${ok ? '' : ` (expected ${expected})`}`);
  if (!ok) failures.push(name);
};

try {
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (server.exitCode !== null) throw new Error(`server exited early:\n${serverOutput}`);
    try {
      const probe = await fetch(`${base}/api/health`);
      if (probe.ok) break;
    } catch { /* not listening yet */ }
    if (Date.now() > deadline) throw new Error(`server never became ready:\n${serverOutput}`);
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('smoke: auth boundary');
  check('GET /api/health is public', (await fetch(`${base}/api/health`)).status, 200);
  check('GET /login is public', (await fetch(`${base}/login`)).status, 200);

  for (const path of ['/api/projects', '/api/agent', '/api/analyze']) {
    check(`GET ${path} rejects anonymous`, (await fetch(`${base}${path}`)).status, 401);
  }

  const dashboard = await fetch(`${base}/`, { redirect: 'manual' });
  check('GET / redirects anonymous to sign-in', dashboard.status, 307);
  check(
    'GET / redirect target is /login',
    new URL(dashboard.headers.get('location'), base).pathname,
    '/login',
  );

  const post = (body) => fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  check('sign-in rejects a wrong token', (await post({ token: 'wrong' })).status, 401);

  const signedIn = await post({ token });
  check('sign-in accepts the owner token', signedIn.status, 200);

  const cookie = (signedIn.headers.getSetCookie?.() ?? [])
    .map(c => c.split(';')[0])
    .join('; ');
  check('sign-in sets a session cookie', cookie.includes('ogs_session=') , true);

  const authed = await fetch(`${base}/api/projects`, { headers: { cookie } });
  check('GET /api/projects accepts the session', authed.status, 200);
} catch (error) {
  console.error(`smoke: ${error.message}`);
  failures.push('harness');
} finally {
  stop();
}

if (failures.length) {
  console.error(`\nsmoke: ${failures.length} check(s) failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nsmoke: auth boundary holds');
