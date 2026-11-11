// Bundles the functions and the @courtsync/shared workspace into lib/index.js.
// firebase-admin and firebase-functions stay external and are installed from package.json on deploy.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: 'lib/index.js',
  sourcemap: true,
  external: ['firebase-admin', 'firebase-functions', 'luxon', 'zod', '@google-cloud/secret-manager'],
  logLevel: 'info',
});
