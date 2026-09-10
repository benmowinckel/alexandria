#!/usr/bin/env bash
# Run only from an independently reviewed, immutable signed release checkout.
# Prepares the optional account client. No loop, website edits or network calls.
set -euo pipefail
umask 077
SOURCE="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
RUNTIME="${ALEX_RUNTIME_DIR:-$HOME/.local/share/alexandria-connector}"
STATE="${ALEX_CONNECTOR_DIR:-$HOME/.config/alexandria/connector}"
fail() { echo "connector setup failed: $1" >&2; exit 1; }
command -v node >/dev/null || fail 'Node is required for the local account client'
command -v ssh-keygen >/dev/null || fail 'SSH signature verification is unavailable'
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cat > "$work/allowed_signers" <<'SIGNER'
alexandria-payload-signing ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAABBBETzcr+XjCojo7y6s+JU8UwqkOtzIv3h9kEQI/ef9/nuGolyXvLF8WXkoEDwFc3zkXxTbZ+TVWI5Uq0fgMxHvjM= alexandria-touchid
SIGNER
ssh-keygen -Y verify -f "$work/allowed_signers" -I alexandria-payload-signing -n alexandria \
  -s "$SOURCE/manifest.txt.sig" < "$SOURCE/manifest.txt" >/dev/null 2>&1 || fail 'release signature is invalid'
# The installed-file receipt is distinct from verify-fetch's latest accepted
# release cache. Fetching a newer helper must not erase proof of older files
# that are still installed. Both signed versions contribute to rollback refusal.
for receipt in .connector_manifest .canon_manifest; do
  if [ -e "$RUNTIME/$receipt" ] || [ -e "$RUNTIME/$receipt.sig" ]; then
    [ -f "$RUNTIME/$receipt" ] && [ -f "$RUNTIME/$receipt.sig" ] || fail 'existing signed receipt is incomplete'
    ssh-keygen -Y verify -f "$work/allowed_signers" -I alexandria-payload-signing -n alexandria \
      -s "$RUNTIME/$receipt.sig" < "$RUNTIME/$receipt" >/dev/null 2>&1 || fail 'existing signed receipt is not authentic'
  fi
done
# Validate every needed byte and destination before the first persistent write.
node - "$SOURCE" "$RUNTIME" "$STATE" "$work" <<'NODE'
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const [source, runtime, state, work] = process.argv.slice(2);
const manifest = fs.readFileSync(path.join(source,'manifest.txt'),'utf8');
const version = /^# alexandria-factory-version (\d+)$/m.exec(manifest)?.[1];
if (!version) throw Error('Signed release has no version');
const files = ['scripts/setup-connector.sh','scripts/verify-fetch.sh','scripts/connect-account.sh',
  'scripts/website-account.mjs','scripts/person-context.mjs','canon/connector.md','connect.md'];
function noLinks(target) {
  for(let p=path.resolve(target);;p=path.dirname(p)) {
    try { if(fs.lstatSync(p).isSymbolicLink()) throw Error('Linked installation path refused: '+p); }
    catch(error) { if(error.code!=='ENOENT') throw error; }
    if(path.dirname(p)===p) break;
  }
}
for(const dir of [runtime,state]) noLinks(dir);
for(const name of ['allowed_signers','.connector_manifest','.connector_manifest.sig','.canon_manifest','.canon_manifest.sig','.factory_version','.connector_complete']) noLinks(path.join(runtime,name));
function optional(name) {
  try { return fs.readFileSync(path.join(runtime,name),'utf8'); }
  catch(error) { if(error.code==='ENOENT') return ''; throw error; }
}
const oldManifest=optional('.connector_manifest');
const fetchedManifest=optional('.canon_manifest');
const versions=[version];
for(const prior of [oldManifest,fetchedManifest]) {
  if(!prior) continue;
  const priorVersion=/^# alexandria-factory-version (\d+)$/m.exec(prior)?.[1];
  if(!priorVersion) throw Error('Existing signed receipt has no version');
  versions.push(priorVersion);
}
const fetchedVersion=optional('.factory_version').trim();
if(fetchedVersion) {
  if(!/^\d+$/.test(fetchedVersion)) throw Error('Existing client version is invalid');
  versions.push(fetchedVersion);
}
const highestVersion=versions.reduce((highest,item)=>BigInt(item)>highest?BigInt(item):highest,0n);
if(BigInt(version)<highestVersion) throw Error('Signed release rollback refused');
const owned=[];
for(const file of files) {
  const original=path.join(source,file); noLinks(original);
  const bytes=fs.readFileSync(original);
  const hash=crypto.createHash('sha256').update(bytes).digest('hex');
  if(!manifest.split('\n').includes(hash+'  factory/'+file)) throw Error('Unsigned or changed file: '+file);
  const target=file==='connect.md'?path.join(state,'.connect'):path.join(runtime,file);
  noLinks(target);
  if(fs.existsSync(target)) {
    const oldHash=crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
    if(oldHash!==hash && !oldManifest.split('\n').includes(oldHash+'  factory/'+file)) throw Error('Local edit preserved: '+target);
  }
  owned.push([target,bytes]);
}
if(fs.existsSync(path.join(runtime,'allowed_signers')) && !fs.readFileSync(path.join(runtime,'allowed_signers')).equals(fs.readFileSync(path.join(work,'allowed_signers')))) throw Error('Existing trust root differs');
for(const [target,bytes] of owned) { fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700}); fs.writeFileSync(target,bytes,{mode:0o600}); }
fs.mkdirSync(runtime,{recursive:true,mode:0o700});
for(const [from,to] of [[path.join(work,'allowed_signers'),'allowed_signers'],[path.join(source,'manifest.txt'),'.connector_manifest'],[path.join(source,'manifest.txt.sig'),'.connector_manifest.sig'],[path.join(source,'manifest.txt'),'.canon_manifest'],[path.join(source,'manifest.txt.sig'),'.canon_manifest.sig']]) fs.copyFileSync(from,path.join(runtime,to));
fs.writeFileSync(path.join(runtime,'.factory_version'),version+'\n',{mode:0o600});
fs.writeFileSync(path.join(runtime,'.connector_complete'),'verified account client only\n',{mode:0o600});
NODE
echo 'the optional connector client is ready; no account or website is connected.'
echo "your ai should read $STATE/.connect before you paste a fresh connection code."
echo 'your website, private system and existing instructions are unchanged.'
