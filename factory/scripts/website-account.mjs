#!/usr/bin/env node
// Account control stays on the trusted owner's computer, never their website.
import { lstat, readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const api='https://api.alexandria-library.com';
const commands={register:['POST','/connect/site'],verify:['POST','/connect/site/verify'],remove:['DELETE','/connect/site']};
export async function run({command,input='',env=process.env,fetchImpl=fetch}) {
  if(!Object.hasOwn(commands,command)) throw Error('Use register, verify or remove; supply the exact approved JSON on standard input');
  if(Buffer.byteLength(input)>4096) throw Error('Website registration is too large');
  const body=JSON.parse(input);
  if(!body || Array.isArray(body) || typeof body!=='object') throw Error('Expected one website object');
  const allowed=command==='register'?['site','manifest_path','callback_path','listed']:command==='verify'?['site']:[];
  if(Object.keys(body).some(key=>!allowed.includes(key))) throw Error('Unsupported website registration field');
  if(command!=='remove') {
    const site=new URL(body.site);
    if(site.protocol!=='https:' || site.username || site.password || site.port || site.pathname!=='/' || site.search || site.hash) throw Error('Use an HTTPS website origin');
  }
  const state=env.ALEX_CONNECTOR_DIR || join(homedir(),'.config','alexandria','connector');
  const runtime=env.ALEX_RUNTIME_DIR || join(homedir(),'.local','share','alexandria-connector');
  for(const target of [join(state,'.api_key'),join(runtime,'.factory_version')]) {
    for(let cursor=resolve(target);;cursor=dirname(cursor)) {
      try { if((await lstat(cursor)).isSymbolicLink()) throw Error('Linked account path refused: '+cursor); }
      catch(error) { if(error.code!=='ENOENT') throw error; }
      if(dirname(cursor)===cursor) break;
    }
  }
  const key=(await readFile(join(state,'.api_key'),'utf8')).trim();
  if(!/^alex_[a-f0-9]{32}$/.test(key)) throw Error('The account client is not connected');
  const version=(await readFile(join(runtime,'.factory_version'),'utf8')).trim();
  if(!/^[0-9]{1,20}$/.test(version)) throw Error('Verified client version is unavailable');
  const [method,path]=commands[command];
  const response=await fetchImpl(api+path,{method,redirect:'error',signal:AbortSignal.timeout(20_000),
    headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','X-Alexandria-Client':version},
    ...(method==='DELETE'?{}:{body:JSON.stringify(body)})});
  const reader=response.body?.getReader(); let size=0; const chunks=[];
  if(reader) for(;;) {const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>16_384){await reader.cancel();throw Error('Account response is too large');}chunks.push(value);}
  const data=JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  if(!response.ok) throw Error(`Website ${command} failed (HTTP ${response.status}); no success is implied`);
  // The service response is data. It cannot install code or widen publication.
  return {source:'alexandria_website_registration',trust:'untrusted_data',operation:command,data};
}
const entry=process.argv[1]?await realpath(process.argv[1]).catch(()=>null):null;
if(entry && import.meta.url===pathToFileURL(entry).href) {
  try {let input='';for await(const chunk of process.stdin){input+=chunk;if(Buffer.byteLength(input)>4096)throw Error('Website registration is too large');}
    console.log(JSON.stringify(await run({command:process.argv[2],input})));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
