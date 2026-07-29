import { readFile, writeFile } from "node:fs/promises";

const output = process.argv.slice(2).find((argument) => argument !== "--");
const endpoint = process.env.TRACKER_URL || "http://127.0.0.1:38765";
const preserveFile = process.env.PRESERVE_CSV || output;

if (!output) {
  console.error("用法：pnpm export:professors -- /绝对路径/候选教授与联系台账_2027.csv");
  process.exit(1);
}

const response = await fetch(`${endpoint}/api/state`);
if (!response.ok) throw new Error("无法读取本地看板。");
const state = await response.json();

const headers = [
  "教授", "大学", "性质", "职称", "研究科/正确研究生身份", "研究室", "核心研究方向",
  "优先级", "申请层级", "匹配分", "计划书修改量", "建议版本", "RQ1", "RQ2", "RQ3",
  "制度状态", "语言状态", "2027年4月", "官方邮箱/渠道", "首次发送日期", "发送附件",
  "回复原意摘要", "回复分类", "是否需要追信", "下一行动日期", "当前状态", "是否排除",
  "教授态度", "推进分组", "A/B匹配", "可行申请路线", "Gmail线程ID", "联系事件数",
  "最后联系时间", "最后核查日期", "备注",
];

function csv(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function parseCsv(source) {
  const rows = [];
  let row = [], field = "", quoted = false;
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
  if (field || row.length) rows.push([...row, field]);
  const names = (rows.shift() || []).map((value) => value.replace(/^\uFEFF/, ""));
  return rows.map((values) => Object.fromEntries(names.map((name, index) => [name, values[index] || ""])));
}

let preserved = new Map();
try {
  const oldRows = parseCsv(await readFile(preserveFile, "utf8"));
  preserved = new Map(oldRows.map((row) => [`${row["大学"]}\0${row["教授"]}`, row]));
} catch {
  // A first-time export has nothing to preserve.
}

const rows = state.professors.map((professor) => {
  const old = preserved.get(`${professor.university}\0${professor.name}`) || {};
  const events = state.contactEvents
    .filter((event) => event.professor_id === professor.id)
    .sort((a, b) => String(a.occurred_at || a.event_date).localeCompare(String(b.occurred_at || b.event_date)));
  const first =
    events.find((event) => event.direction === "发出" && event.event_type === "首次联系") ||
    events.find((event) => event.direction === "发出");
  const replies = events.filter((event) => event.direction === "收到" && event.event_type === "教授回复");
  const latestReply = replies.at(-1);
  const latest = events.at(-1);
  const next = [...events].reverse().find((event) => event.next_action_date);
  const routes = state.applicationRoutes
    .filter((route) => route.professor_id === professor.id && Number(route.archived) !== 1)
    .sort((a, b) => String(a.intake).localeCompare(String(b.intake)));
  const routeNext = routes.map((route) => route.next_action_date).filter(Boolean).sort()[0];
  const routeSummary = routes
    .map((route) => `${route.intake} ${route.route_type}：${route.route_status}`)
    .join("；");
  const bounceOnly = !latestReply && events.some((event) => event.event_type === "退信");
  const archived = Number(professor.archived) === 1;
  const fitParts = String(professor.fit || "").split("；");
  return [
    professor.name,
    professor.university,
    old["性质"] || "",
    professor.title,
    professor.graduate_school,
    professor.lab,
    professor.research,
    professor.priority,
    old["申请层级"] || (archived ? "历史联系/排除" : "当前候选"),
    old["匹配分"] || "",
    old["计划书修改量"] || "",
    old["建议版本"] || "",
    old["RQ1"] || fitParts[0] || "",
    old["RQ2"] || fitParts[1] || "",
    old["RQ3"] || fitParts[2] || "",
    professor.system_status,
    professor.language_status,
    professor.current_status,
    professor.email,
    first?.occurred_at || "",
    first?.attachments || "",
    latestReply?.summary || (bounceOnly ? "邮件未送达，未收到教授本人回复。" : ""),
    latestReply ? latestReply.status_after : bounceOnly ? "邮件退回" : first ? "等待回复" : "尚未发送",
    (routeNext || next?.next_action_date) ? "是" : "否",
    routeNext || next?.next_action_date || "",
    professor.current_status,
    archived ? "是" : "否",
    professor.professor_stance,
    professor.pipeline_stage,
    professor.match_grade,
    routeSummary,
    latest?.gmail_thread_id || professor.gmail_thread_id || "",
    events.length,
    latest?.occurred_at || "",
    professor.research_verified_at || "2026-07-29",
    professor.risk,
  ];
});

await writeFile(output, `\uFEFF${headers.map(csv).join(",")}\n${rows.map((row) => row.map(csv).join(",")).join("\n")}\n`, "utf8");
console.log(`已导出 ${rows.length} 位教授到 ${output}`);
