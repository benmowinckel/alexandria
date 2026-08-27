import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const api = (process.env.ALEXANDRIA_API_URL || "https://api.alexandria-library.com").replace(/\/$/, "");
const author = process.env.ALEXANDRIA_LIBRARY_AUTHOR || "benmowinckel";

const artifacts = [
  ["features", "public/docs/Features.md"],
  ["whitepaper", "public/docs/Whitepaper.md"],
  ["letter", "public/docs/letter.txt"],
];

const websiteContextNames = new Set(artifacts.map(([name]) => name));

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

const profileResponse = await fetch(`${api}/library/${author}`);
if (!profileResponse.ok) {
  console.error(`FAIL profile: public Library returned HTTP ${profileResponse.status}`);
  failed = true;
} else {
  const profile = await profileResponse.json();
  const files = Array.isArray(profile.files) ? profile.files : [];
  const works = files.filter((file) => file.category === "works").map((file) => file.name).sort();
  const websiteContext = files.filter((file) => websiteContextNames.has(file.name));
  const websiteContextHidden = Array.isArray(profile.profile?.hidden) && profile.profile.hidden.includes("other");

  if (works.length !== 1 || works[0] !== "droplets-of-grace") {
    console.error(`FAIL profile: works must contain only droplets-of-grace, got ${JSON.stringify(works)}`);
    failed = true;
  }
  if (websiteContext.length !== artifacts.length || websiteContext.some((file) => file.category !== "other")) {
    console.error("FAIL profile: website reader documents must stay in the hidden website-context section");
    failed = true;
  }
  if (!websiteContextHidden) {
    console.error("FAIL profile: the website-context section must stay hidden from the public profile");
    failed = true;
  }
  if (!failed) console.log("PASS profile: Droplets of Grace is the only visible work");
}

if (failed) process.exit(1);
