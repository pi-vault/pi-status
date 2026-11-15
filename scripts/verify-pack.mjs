// The packed file set must be exactly package.json plus the tracked files named by `files`.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoDir = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const report = JSON.parse(
  execFileSync("pnpm", ["pack", "--dry-run", "--json"], { cwd: repoDir, encoding: "utf8" }),
);
const packed = new Set(report.files.map((file) => file.path));
const tracked = execFileSync("git", ["ls-files", "--", ...pkg.files], {
  cwd: repoDir,
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);
const expected = new Set(["package.json", ...tracked]);
const missing = [...expected].filter((path) => !packed.has(path));
const unexpected = [...packed].filter((path) => !expected.has(path));
if (missing.length > 0 || unexpected.length > 0) {
  throw new Error(
    `Package contents differ from package.json files.\nMissing: ${missing.join(", ") || "none"}\nUnexpected: ${unexpected.join(", ") || "none"}`,
  );
}
console.log(`Package contents verified (${packed.size} files)`);
