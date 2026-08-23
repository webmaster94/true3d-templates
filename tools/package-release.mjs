import {cp, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {basename, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifest = JSON.parse(await readFile(resolve(root, "module.json"), "utf8"));
const releaseRoot = resolve(root, "release");
const packageRoot = resolve(releaseRoot, manifest.id);
const zipName = `${manifest.id}-v${manifest.version}.zip`;
const included = ["module.json", "LICENSE", "README.md", "lang", "scripts", "styles"];

await rm(releaseRoot, {recursive: true, force: true});
await mkdir(packageRoot, {recursive: true});
for (const entry of included) {
  await cp(resolve(root, entry), resolve(packageRoot, basename(entry)), {recursive: true});
}

await writeFile(resolve(releaseRoot, "module.json"), `${JSON.stringify(manifest, null, 2)}\n`);
execFileSync("tar", ["-a", "-c", "-f", resolve(releaseRoot, zipName), "-C", releaseRoot, manifest.id], {
  stdio: "inherit"
});
console.log(`Created release/${zipName}`);
