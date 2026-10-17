// Fails the build when middleware is not registered.
//
// Next.js only picks up middleware from the project root or, when a src
// directory exists, from src/. A misplaced file is not an error: it is simply
// never loaded, so every private route silently serves unauthenticated. That
// shipped once already — the build, the type checker, the linter and the unit
// tests all stayed green while owner authentication was inert.
import { readdir, readFile } from 'node:fs/promises';
import { isBuiltin } from 'node:module';

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
// The personal runner shipped broken this way: it imported @next/env, a
// transitive dependency of next, and could not start at all.
//
// This checks the manifest, not resolution. Whether a package resolves here
// depends on the linker: a hoisted install, a root workspace dependency or an
// ancestor node_modules all make an undeclared import resolve cleanly, which
// is precisely the situation that hides the bug. Only a declaration survives
// installing this package on its own.
const appManifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const declared = new Set([
  ...Object.keys(appManifest.dependencies ?? {}),
  ...Object.keys(appManifest.devDependencies ?? {}),
  ...Object.keys(appManifest.optionalDependencies ?? {}),
  ...Object.keys(appManifest.peerDependencies ?? {}),
]);

// "@scope/name/sub" -> "@scope/name", "name/sub" -> "name"
const packageName = specifier =>
  specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/');

const scriptsDir = new URL('./', import.meta.url);
const undeclared = [];

for (const name of (await readdir(scriptsDir)).filter(f => f.endsWith('.mjs'))) {
  const source = await readFile(new URL(name, scriptsDir), 'utf8');
  for (const [, specifier] of source.matchAll(/^\s*import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) {
    if (specifier.startsWith('.') || isBuiltin(specifier)) continue;
    const pkg = packageName(specifier);
    if (!declared.has(pkg)) undeclared.push(`${name} imports '${specifier}' (package '${pkg}')`);
  }
}

if (undeclared.length) {
  console.error(
    'verify-build: a script imports a package this app does not declare.\n' +
    undeclared.map(u => `  ${u}`).join('\n') +
    '\n  Add it to dependencies. Resolving today only means something in the\n' +
    '  install tree happens to provide it, which an independent install will not.',
  );
  process.exit(1);
}

console.log('verify-build: every script import is declared');
