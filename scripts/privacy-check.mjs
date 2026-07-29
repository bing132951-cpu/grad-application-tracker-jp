import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const forbidden = [
  /bing132951(?:-cpu)?@/i,
  /gmail_thread_id["':,\s]+[0-9a-f]{12,}/i,
  /研究計画書_WEI_XUKAI/i,
  /履歴書_WEI_XUKAI/i,
  /魏旭凯|魏旭凱|WEI XUKAI/,
];
const findings = [];

for (const file of tracked) {
  if (file === "scripts/privacy-check.mjs") continue;
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const pattern of forbidden) {
    if (pattern.test(content)) findings.push(`${file}: ${pattern}`);
  }
}

if (findings.length) {
  console.error("隐私检查失败：\n" + findings.join("\n"));
  process.exit(1);
}
console.log(`隐私检查通过：已检查 ${tracked.length} 个 Git 文件。`);
