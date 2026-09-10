/** Build the optional chat as a single locally hosted script. Never downloads
 * dependencies or writes into the owner's pages. */
import { build } from '../../server/node_modules/esbuild/lib/main.js';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const outfile = process.argv[2];
if (!outfile) throw new Error('Usage: node integration/website-connector/build-browser.mjs /absolute/output/mirror.js');
await build({ entryPoints: [fileURLToPath(new URL('browser.tsx', import.meta.url))], outfile: resolve(outfile), bundle: true,
  format: 'iife', platform: 'browser', target: ['es2020'], jsx: 'automatic', minify: true,
  define: { 'process.env.NODE_ENV': '"production"' }, legalComments: 'external', sourcemap: false });
