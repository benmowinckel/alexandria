import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const api = (process.env.ALEXANDRIA_API_URL || "https://api.alexandria-library.com").replace(/\/$/, "");
const author = process.env.ALEXANDRIA_LIBRARY_AUTHOR || "benmowinckel";

const artifacts = [
  ["plainly", "public/docs/Plainly.md"],
  ["features", "public/docs/Features.md"],
  ["whitepaper", "public/docs/Whitepaper.md"],
  ["letter", "public/docs/letter.txt"],
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

let failed = false;

for (const [name, path] of artifacts) {
  const local = await readFile(new URL(`../${path}`, import.meta.url));
  const response = await fetch(`${api}/library/${author}/file/${name}?scope=public`);

  if (!response.ok) {
    console.error(`FAIL ${name}: public Library returned HTTP ${response.status}`);
    failed = true;
    continue;
  }

  const remote = Buffer.from(await response.arrayBuffer());
  const localHash = sha256(local);
  const remoteHash = sha256(remote);

  if (localHash !== remoteHash) {
    console.error(`FAIL ${name}: ${path} ${localHash} != Library ${remoteHash}`);
    failed = true;
    continue;
  }

  console.log(`PASS ${name}: ${localHash}`);
}

if (failed) process.exit(1);
