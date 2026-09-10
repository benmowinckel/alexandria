#!/usr/bin/env node
// Signed distribution is derived from the reviewed portable source, never edited.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const paths=['integration/website-connector/handler.mjs','integration/website-connector/node.mjs',
  'integration/website-connector/static-mirror.mjs','integration/website-connector/README.md',
  'shared/mirror-context.mjs'];
let changed=false;
for(const path of paths) {
  const source=await readFile(resolve(root,path));
  const target=resolve(root,'factory/website',path);
  const current=await readFile(target).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(current?.equals(source))continue;
  if(process.argv.includes('--check')){console.error('Stale signed website package: '+path);changed=true;continue;}
  await mkdir(dirname(target),{recursive:true});await writeFile(target,source);
}
if(changed)process.exitCode=1;
