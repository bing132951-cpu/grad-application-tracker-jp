import { createBackup, ensureSchema, getD1, snapshot } from "../../../db";

type RecordValue = string | number | boolean | null | undefined;

const tableConfig = {
  profile: {
    table: "profiles",
    columns: ["id", "name", "email", "education", "gpa", "language", "target", "research_topic"],
  },
  school: {
    table: "schools",
    columns: ["id", "university", "nature", "graduate_school", "major", "website", "category", "priority", "fit", "note", "archived"],
  },
  exam: {
    table: "exams",
    columns: ["id", "school_id", "intake_year", "round", "method", "guidelines_url", "application_start", "application_end", "exam_start", "exam_end", "written", "oral", "language", "pre_contact", "status", "official_source", "verified_at", "archived"],
  },
  subject: {
    table: "subjects",
    columns: ["id", "exam_id", "name", "requirement", "mastery", "progress", "past_questions_url", "reference_book", "note"],
  },
  professor: {
    table: "professors",
    columns: ["id", "university", "graduate_school", "lab", "name", "title", "email", "lab_url", "research", "fit", "identity", "system_status", "language_status", "priority", "risk", "gmail_thread_id", "current_status", "archived"],
  },
  task: {
    table: "tasks",
    columns: ["id", "title", "due_date", "status", "related_school_id", "related_professor_id", "note"],
  },
} as const;

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "发生未知错误。";
}

function validateDate(value: unknown, field: string) {
  if (!value) return;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field}必须使用 YYYY-MM-DD 格式。`);
  }
}

function validateEntity(entity: keyof typeof tableConfig, record: Record<string, RecordValue>) {
  if (!record.id) throw new Error("记录缺少唯一ID。");
  if (entity === "school" && (!record.university || !record.graduate_school || !record.major)) {
    throw new Error("学校、研究科和专攻为必填项。");
  }
  if (entity === "professor" && (!record.university || !record.name)) {
    throw new Error("大学和教授姓名为必填项。");
  }
  if (entity === "exam") {
    if (![2027, 2028].includes(Number(record.intake_year))) {
      throw new Error("当前看板仅维护2027或2028入学年度。");
    }
    ["application_start", "application_end", "exam_start", "exam_end", "verified_at"].forEach(
      (field) => validateDate(record[field], field),
    );
  }
  if (entity === "task") validateDate(record.due_date, "due_date");
}

export async function GET() {
  try {
    const db = await ensureSchema(getD1());
    const state = await snapshot(db);
    const backups = await db
      .prepare("SELECT id, reason, created_at FROM backups ORDER BY created_at DESC LIMIT 20")
      .all();
    return Response.json({ ...state, backups: backups.results ?? [] });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      action?: string;
      entity?: keyof typeof tableConfig;
      record?: Record<string, RecordValue>;
      professorId?: string;
      event?: Record<string, string>;
      workEvent?: Record<string, string>;
      reason?: string;
      backupId?: string;
    };
    const db = await ensureSchema(getD1());

    if (payload.action === "upsert" && payload.entity && payload.record) {
      validateEntity(payload.entity, payload.record);
      await createBackup(db, `修改${payload.entity}`);
      const config = tableConfig[payload.entity];
      const values = config.columns.map((column) => payload.record?.[column] ?? "");
      const placeholders = config.columns.map(() => "?").join(", ");
      const updates = config.columns
        .filter((column) => column !== "id")
        .map((column) => `${column}=excluded.${column}`)
        .concat("updated_at=CURRENT_TIMESTAMP")
        .join(", ");
      await db
        .prepare(
          `INSERT INTO ${config.table} (${config.columns.join(", ")}) VALUES (${placeholders})
           ON CONFLICT(id) DO UPDATE SET ${updates}`,
        )
        .bind(...values)
        .run();
      return Response.json({ ok: true });
    }

    if (payload.action === "contactEvent" && payload.professorId && payload.event) {
      validateDate(payload.event.event_date, "event_date");
      validateDate(payload.event.next_action_date, "next_action_date");
      if (!payload.event.event_type) throw new Error("联系事件类型不能为空。");
      await createBackup(db, "新增教授联系事件");
      const eventId = payload.event.id || crypto.randomUUID();
      await db.batch([
        db.prepare(
          `INSERT INTO contact_events
           (id, professor_id, event_type, event_date, summary, attachments, status_after, next_action_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          eventId,
          payload.professorId,
          payload.event.event_type,
          payload.event.event_date,
          payload.event.summary ?? "",
          payload.event.attachments ?? "",
          payload.event.status_after ?? "",
          payload.event.next_action_date ?? "",
        ),
        db.prepare(
          "UPDATE professors SET current_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).bind(payload.event.status_after || "已记录事件", payload.professorId),
        db.prepare(
          `INSERT INTO work_events
           (id, event_type, event_date, title, summary, related_professor_id)
           VALUES (?, '教授联系', ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          payload.event.event_date,
          payload.event.event_type,
          payload.event.summary ?? "",
          payload.professorId,
        ),
      ]);
      return Response.json({ ok: true, id: eventId });
    }

    if (payload.action === "workEvent" && payload.workEvent) {
      validateDate(payload.workEvent.event_date, "event_date");
      if (!payload.workEvent.title) throw new Error("工作记录标题不能为空。");
      await createBackup(db, "新增工作记录");
      const id = payload.workEvent.id || crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO work_events
           (id, event_type, event_date, title, summary, related_school_id, related_professor_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          payload.workEvent.event_type ?? "其他",
          payload.workEvent.event_date,
          payload.workEvent.title,
          payload.workEvent.summary ?? "",
          payload.workEvent.related_school_id ?? "",
          payload.workEvent.related_professor_id ?? "",
        )
        .run();
      return Response.json({ ok: true, id });
    }

    if (payload.action === "archive" && payload.entity && payload.record?.id) {
      const config = tableConfig[payload.entity];
      if (!config.columns.includes("archived" as never)) {
        throw new Error("此类记录不支持归档。");
      }
      await createBackup(db, `归档${payload.entity}`);
      await db
        .prepare(`UPDATE ${config.table} SET archived=1, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(payload.record.id)
        .run();
      return Response.json({ ok: true });
    }

    if (payload.action === "restoreBackup" && payload.backupId) {
      const backup = await db
        .prepare("SELECT payload_json FROM backups WHERE id=?")
        .bind(payload.backupId)
        .first<{ payload_json: string }>();
      if (!backup?.payload_json) throw new Error("找不到这份备份。");
      const restored = JSON.parse(backup.payload_json) as Record<string, Record<string, RecordValue>[]>;
      await createBackup(db, "恢复旧备份前自动保存");
      const tableMap: Record<string, string> = {
        profiles: "profiles",
        schools: "schools",
        exams: "exams",
        subjects: "subjects",
        professors: "professors",
        contactEvents: "contact_events",
        workEvents: "work_events",
        tasks: "tasks",
      };
      const deletionOrder = [
        "subjects",
        "contact_events",
        "work_events",
        "tasks",
        "exams",
        "professors",
        "schools",
        "profiles",
      ];
      await db.batch(deletionOrder.map((table) => db.prepare(`DELETE FROM ${table}`)));
      for (const [key, rows] of Object.entries(restored)) {
        const table = tableMap[key];
        if (!table || !Array.isArray(rows)) continue;
        for (const row of rows) {
          const columns = Object.keys(row).filter((column) => /^[a-z_]+$/.test(column));
          if (!columns.length) continue;
          await db
            .prepare(
              `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
            )
            .bind(...columns.map((column) => row[column] ?? ""))
            .run();
        }
      }
      return Response.json({ ok: true });
    }

    throw new Error("无法识别的操作。");
  } catch (error) {
    const message = errorMessage(error);
    const status = /UNIQUE constraint failed/.test(message) ? 409 : 400;
    return Response.json({ error: message }, { status });
  }
}
