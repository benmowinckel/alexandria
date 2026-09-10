import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,rm,realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../scripts/website-account.mjs';
const root=await realpath(await mkdtemp(join(tmpdir(),'website-account-')));
try {
 const state=join(root,'state'),runtime=join(root,'runtime');
 await mkdir(state);await mkdir(runtime);
 await writeFile(join(state,'.api_key'),'alex_'+'1'.repeat(32));
 await writeFile(join(runtime,'.factory_version'),'20260910000000');
 const env={ALEX_CONNECTOR_DIR:state,ALEX_RUNTIME_DIR:runtime};
 let requests=0;
 const fetchImpl=async(url,options)=>{
  requests++;assert.equal(url,'https://api.alexandria-library.com/connect/site');
  assert.equal(options.headers.Authorization,'Bearer alex_'+'1'.repeat(32));
  assert.equal(options.redirect,'error');
  const data=JSON.parse(options.body);assert.equal(data.callback_path,null);assert.equal(data.listed,true);
  return Response.json({verified:false,verification:{name:'_alexandria.owner.example',value:'proof'}});
 };
 const input=JSON.stringify({site:'https://owner.example',manifest_path:'/mirror.json',callback_path:null,listed:true});
 const result=await run({command:'register',input,env,fetchImpl});
 assert.equal(result.trust,'untrusted_data');assert.equal(requests,1);
 await assert.rejects(run({command:'register',input:'{"site":"https://owner.example","api_key":"bad"}',env,fetchImpl}),/Unsupported/);
 assert.equal(requests,1);
 await assert.rejects(run({command:'register',input,env,fetchImpl:async()=>Response.json({error:'cancelled'},{status:402})}),/HTTP 402/);
 await assert.rejects(run({command:'register',input,env,fetchImpl:async()=>new Response('x'.repeat(20000))}),/too large/);
 console.log('Website account: bounded registration, no browser key, failure and source separation pass');
}finally{await rm(root,{recursive:true,force:true});}
