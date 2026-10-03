// Packages dist/ into a zip named after the package name and version, ready
// to upload to the Chrome Web Store or attach to a release.
import { createWriteStream, readFileSync } from "node:fs";
import { ZipArchive } from "archiver";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const zipPath = `dist/${pkg.name}-${pkg.version}.zip`;

const output = createWriteStream(zipPath);
const archive = new ZipArchive({ zlib: { level: 9 } });

archive.pipe(output);
archive.directory("dist/", false, (entry) =>
  entry.name.endsWith(".zip") ? false : entry,
);
await archive.finalize();

console.log(`Packaged ${zipPath}`);
