// Syncs the version in package.json into public/manifest.json so the two
// never drift apart. Run as part of "npm run build".
import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const manifestPath = "public/manifest.json";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

if (manifest.version !== pkg.version) {
  manifest.version = pkg.version;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Synced manifest.json version to ${pkg.version}`);
}
