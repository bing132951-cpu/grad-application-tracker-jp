import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";

const file = process.argv.slice(2).find((argument) => argument !== "--");
const endpoint = process.env.TRACKER_URL || "http://127.0.0.1:3000";

if (!file) {
  console.error("用法：pnpm import:professors -- /绝对路径/教授台账.csv");
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

async function post(body) {
  const response = await fetch(`${endpoint}/api/state`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "导入失败");
  return result;
}

function stableId(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function dateOnly(value) {
  const match = String(value || "").match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] || "";
}

const source = await readFile(file, "utf8");
const rows = parseCsv(source);
let imported = 0;

for (const row of rows) {
  if (!row["大学"] || !row["教授"]) continue;
  const professorId = stableId(`${row["大学"]}\u0000${row["教授"]}`);
  await post({
    action: "upsert",
    entity: "professor",
    record: {
      id: professorId,
      university: row["大学"],
      graduate_school: row["研究科/正确研究生身份"] || "",
      lab: row["研究室"] || "",
      name: row["教授"],
      title: row["职称"] || "教授",
      email: row["官方邮箱/渠道"] || "",
      lab_url: "",
      research: row["核心研究方向"] || "",
      fit: [row["RQ1"], row["RQ2"], row["RQ3"]].filter(Boolean).join("；"),
      identity: row["研究科/正确研究生身份"] || "",
      system_status: row["制度状态"] || row["2027年4月"] || "",
      language_status: row["语言状态"] || "",
      priority: row["优先级"] || "B",
      risk: row["备注"] || "",
      gmail_thread_id: row["Gmail线程ID"] || "",
      current_status: row["当前状态"] || "候选",
      archived: row["是否排除"] === "是" ? 1 : 0,
    },
  });
  const hasReply =
    Boolean(row["回复原意摘要"]) &&
    !["等待回复", "尚未发送", "待回复", "待核"].includes(row["回复分类"] || "") &&
    !/^(截至.*未收到回复|待回复|待核)$/.test(row["回复原意摘要"] || "");
  if (row["首次发送日期"]) {
    await post({
      action: "contactEvent",
      professorId,
      event: {
        id: randomUUID(),
        event_type: "首次联系",
        event_date: dateOnly(row["首次发送日期"]),
        summary: "已发送首次联系邮件。",
        attachments: row["发送附件"] || "",
        status_after: hasReply ? "已联系" : row["当前状态"] || "等待回复",
        next_action_date: dateOnly(row["下一行动日期"]),
      },
    });
  }
  if (hasReply) {
    await post({
      action: "contactEvent",
      professorId,
      event: {
        id: randomUUID(),
        event_type: "教授回复",
        event_date: dateOnly(row["最后核查日期"] || row["首次发送日期"]),
        summary: row["回复原意摘要"],
        attachments: "",
        status_after: row["当前状态"] || row["回复分类"] || "已回复",
        next_action_date: dateOnly(row["下一行动日期"]),
      },
    });
  }
  imported += 1;
}

console.log(`已导入 ${imported} 位教授。`);
