import { createBackup, ensureSchema, getD1, snapshot } from "../../../db";

const privateKeys = new Set([
  "name",
  "email",
  "gmail_thread_id",
  "summary",
  "attachments",
  "payload_json",
]);

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !privateKeys.has(key))
        .map(([key, child]) => [key, sanitize(child)]),
    );
  }
  return value;
}

export async function GET(request: Request) {
  const db = await ensureSchema(getD1());
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "full";
  const data = await snapshot(db);
  const body =
    mode === "template"
      ? {
          format: "grad-application-tracker-jp",
          version: 1,
          exportedAt: new Date().toISOString(),
          data: sanitize({
            profiles: [],
            schools: [],
            exams: [],
            subjects: [],
            professors: [],
            contactEvents: [],
            workEvents: [],
            tasks: [],
          }),
        }
      : {
          format: "grad-application-tracker-jp",
          version: 1,
          exportedAt: new Date().toISOString(),
          data,
        };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="grad-tracker-${mode}.json"`,
    },
  });
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      format?: string;
      data?: Record<string, unknown[]>;
    };
    if (payload.format !== "grad-application-tracker-jp" || !payload.data) {
      throw new Error("这不是有效的申请看板备份文件。");
    }
    const db = await ensureSchema(getD1());
    await createBackup(db, "导入备份前自动保存");
    const order = [
      "subjects",
      "contact_events",
      "work_events",
      "tasks",
      "exams",
      "professors",
      "schools",
      "profiles",
    ];
    await db.batch(order.map((table) => db.prepare(`DELETE FROM ${table}`)));

    const map: Record<string, string> = {
      profiles: "profiles",
      schools: "schools",
      exams: "exams",
      subjects: "subjects",
      professors: "professors",
      contactEvents: "contact_events",
      workEvents: "work_events",
      tasks: "tasks",
    };
    for (const [key, rows] of Object.entries(payload.data)) {
      const table = map[key];
      if (!table || !Array.isArray(rows)) continue;
      for (const row of rows as Record<string, unknown>[]) {
        const columns = Object.keys(row).filter((column) => /^[a-z_]+$/.test(column));
        if (!columns.length) continue;
        const sql = `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`;
        await db.prepare(sql).bind(...columns.map((column) => row[column] ?? "")).run();
      }
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "导入失败。" },
      { status: 400 },
    );
  }
}
