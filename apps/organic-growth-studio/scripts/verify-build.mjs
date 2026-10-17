// Fails the build when middleware is not registered.
//
// Next.js only picks up middleware from the project root or, when a src
// directory exists, from src/. A misplaced file is not an error: it is simply
// never loaded, so every private route silently serves unauthenticated. That
// shipped once already — the build, the type checker, the linter and the unit
// tests all stayed green while owner authentication was inert.
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const manifestPath = new URL('../.next/server/middleware-manifest.json', import.meta.url);

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch (error) {
  console.error(`verify-build: could not read ${manifestPath.pathname}: ${error.message}`);
  process.exit(1);
}

const entries = Object.keys(manifest.middleware ?? {});
if (entries.length === 0) {
  console.error(
    'verify-build: no middleware is registered in the build.\n' +
    '  Owner authentication runs in middleware, so an unregistered middleware\n' +
    '  means every private route is open.\n' +
    '  Check that src/middleware.ts exists and compiles.',
  );
  process.exit(1);
}

console.log(`verify-build: middleware registered (${entries.join(', ')})`);

// Scripts in scripts/ are never imported by the build, so a bare import of a
// package this app does not declare fails only when someone runs the script.
// pnpm does not link transitive dependencies, so "it works on my machine"
// means a hoisted node_modules, not a correct manifest. The personal runner
// shipped broken this way: it imported @next/env, a transitive dependency of
// next, and could not start at all.
const require = createRequire(import.meta.url);
const scriptsDir = new URL('./', import.meta.url);
const unresolved = [];

for (const name of (await readdir(scriptsDir)).filter(f => f.endsWith('.mjs'))) {
  const source = await readFile(new URL(name, scriptsDir), 'utf8');
  for (const [, specifier] of source.matchAll(/^\s*import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) {
    if (specifier.startsWith('.') || specifier.startsWith('node:')) continue;
    try {
      require.resolve(specifier);
    } catch {
      unresolved.push(`${name} imports '${specifier}'`);
    }
  }
}

if (unresolved.length) {
  console.error(
    'verify-build: a script imports a package this app does not declare.\n' +
    unresolved.map(u => `  ${u}`).join('\n') +
    '\n  Add it to dependencies; a transitive copy is not guaranteed to be linked.',
  );
  process.exit(1);
}

console.log('verify-build: script imports all resolve');
