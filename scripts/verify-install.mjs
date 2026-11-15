// Install the packed tarball the way Pi does, then load it with Pi's real extension loader.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoDir = fileURLToPath(new URL("..", import.meta.url));
const loaderPath = "../node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js";
const expectedPackages = ["node_modules/@pi-vault/pi-status", "node_modules/@pi-vault/pi-usage"];
const tempDir = mkdtempSync(join(tmpdir(), "pi-status-verify-"));

try {
  const report = JSON.parse(
    execFileSync("pnpm", ["pack", "--pack-destination", tempDir, "--json"], {
      cwd: repoDir,
      encoding: "utf8",
    }),
  );
  const tarball = isAbsolute(report.filename) ? report.filename : join(tempDir, report.filename);
  const consumerDir = join(tempDir, "consumer");
  mkdirSync(consumerDir);
  writeFileSync(
    join(consumerDir, "package.json"),
    JSON.stringify({ name: "pi-status-install-check", private: true }),
  );
  // Same flags as Pi's npm install (packages/coding-agent/src/core/package-manager.ts).
  execFileSync(
    "npm",
    ["install", "--omit=dev", "--legacy-peer-deps", "--no-audit", "--no-fund", tarball],
    { cwd: consumerDir, stdio: ["ignore", "ignore", "inherit"] },
  );

  const lock = JSON.parse(readFileSync(join(consumerDir, "package-lock.json"), "utf8"));
  const installed = Object.keys(lock.packages)
    .filter((path) => path !== "")
    .sort();
  const unexpected = installed.filter((path) => !expectedPackages.includes(path));
  const missing = expectedPackages.filter((path) => !installed.includes(path));
  assert.deepEqual(
    { missing, unexpected },
    { missing: [], unexpected: [] },
    `Installed package set differs.\nMissing: ${missing.join(", ") || "none"}\nUnexpected: ${unexpected.join(", ") || "none"}`,
  );

  process.env.PI_CODING_AGENT_DIR = join(tempDir, "agent");
  // Pi's package index does not export the loader; this deep import may need updating on Pi upgrades.
  let loadExtensions;
  try {
    ({ loadExtensions } = await import(loaderPath));
  } catch (error) {
    throw new Error(
      `Cannot load Pi's extension loader from ${loaderPath}; update the deep import for this Pi version`,
      { cause: error },
    );
  }
  const packageDir = join(consumerDir, "node_modules", "@pi-vault", "pi-status");
  const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  const entries = manifest.pi.extensions.map((path) => join(packageDir, path));
  const result = await loadExtensions(entries, consumerDir);
  assert.deepEqual(result.errors, [], "Packed extension failed to load in Pi's extension loader");
  assert.equal(result.extensions.length, entries.length);
  assert.ok(
    result.extensions.some((extension) => extension.commands.has("statusline")),
    "pi-status did not register /statusline",
  );
  console.log("Package install verified (statusline command registered)");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
