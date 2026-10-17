// Fails the build when middleware is not registered.
//
// Next.js only picks up middleware from the project root or, when a src
// directory exists, from src/. A misplaced file is not an error: it is simply
// never loaded, so every private route silently serves unauthenticated. That
// shipped once already — the build, the type checker, the linter and the unit
// tests all stayed green while owner authentication was inert.
import { readFile } from 'node:fs/promises';

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
