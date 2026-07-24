import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const forbiddenNames = [
  /^\.env(?:\.|$)/,
  /^\.dev\.vars$/,
  /\.(?:pem|key|p12|pfx)$/i,
  /\.(?:zip|tar|tgz|gz)$/i,
];

const allowedFiles = new Set([".env.example"]);
const findings = [];

for (const path of tracked) {
  if (!allowedFiles.has(path) && forbiddenNames.some((pattern) => pattern.test(path))) {
    findings.push(`${path}: forbidden tracked configuration, key, or archive file`);
  }
}

const skipContent = new Set([
  "bun.lock",
  "package-lock.json",
  "src/integrations/supabase/types.ts",
  "scripts/check-repository-hygiene.mjs",
]);

const contentPatterns = [
  [
    "hardcoded Supabase service-role credential",
    new RegExp(
      ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_") +
        "\\s*[:=]\\s*[\\\"'][A-Za-z0-9._-]{16,}[\\\"']",
    ),
  ],
  ["private key material", new RegExp(["BEGIN", "PRIVATE", "KEY"].join(" "))],
  ["GitHub classic token", new RegExp("gh" + "p_[A-Za-z0-9]{30,}")],
  ["OpenAI-style secret", new RegExp("sk" + "-[A-Za-z0-9_-]{24,}")],
];

for (const path of tracked) {
  if (skipContent.has(path)) continue;
  const extension = extname(path).toLowerCase();
  if ([".ico", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf"].includes(extension)) continue;

  let content;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    continue;
  }
  for (const [label, pattern] of contentPatterns) {
    if (pattern.test(content)) findings.push(`${path}: possible ${label}`);
  }
}

if (findings.length) {
  console.error("Repository hygiene check failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Repository hygiene check passed for ${tracked.length} tracked files.`);
