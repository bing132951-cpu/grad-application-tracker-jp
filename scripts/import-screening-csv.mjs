import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const file = process.argv.slice(2).find((argument) => argument !== "--");
const endpoint = process.env.TRACKER_URL || "http://127.0.0.1:38765";

if (!file) {
  console.error("用法：pnpm import:screenings -- /绝对路径/全国覆盖矩阵.csv");
  process.exit(1);
}

function parseCsv(source) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted && char === '"' && source[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const headers = rows.shift()?.map((value) => value.replace(/^\uFEFF/, "")) ?? [];
  return rows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
  );
}

function stableId(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

async function post(body) {
  const response = await fetch(`${endpoint}/api/state`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "导入失败");
}

const rows = parseCsv(await readFile(file, "utf8"));
const screenings = rows
  .filter((row) => row["大学"])
  .map((row) => ({
      id: stableId(row["大学"]),
      region: row["区域"] || "",
      university: row["大学"],
      nature: row["性质"] || "",
      talent_path: row["高度人才认定路径"] || "",
      checked_organization: row["已核查相关研究科/组织"] || "",
      language_gate:
        row["语言硬门槛"] ||
        Object.entries(row).find(([header]) => header.startsWith("语言硬门槛"))?.[1] ||
        "",
      research_student_screening: row["研究生制度初筛"] || "",
      related_faculty: row["发现的相关教师"] || "",
      final_status: row["最终状态"] || "待确认",
      conclusion: row["结论摘要"] || "",
      official_source: row["主要官方依据"] || "",
      verified_at: row["核查日"] || "",
      archived: 0,
  }));

await post({ action: "replaceScreenings", screenings });

console.log(`已导入 ${screenings.length} 所学校的筛选档案。`);
