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
  screening: {
    table: "school_screenings",
    columns: ["id", "region", "university", "nature", "talent_path", "checked_organization", "language_gate", "research_student_screening", "related_faculty", "final_status", "conclusion", "official_source", "verified_at", "archived"],
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
  if (entity === "screening" && !record.university) {
    throw new Error("全国筛选记录必须填写大学名称。");
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
      events?: Record<string, string>[];
      professorStatuses?: Record<string, string>;
      screenings?: Record<string, RecordValue>[];
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
           (id, professor_id, event_type, event_date, occurred_at, direction, subject, summary, attachments,
            gmail_message_id, gmail_thread_id, gmail_url, source, status_after, next_action_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          eventId,
          payload.professorId,
          payload.event.event_type,
          payload.event.event_date,
          payload.event.occurred_at ?? payload.event.event_date,
          payload.event.direction ?? "手动",
          payload.event.subject ?? "",
          payload.event.summary ?? "",
          payload.event.attachments ?? "",
          payload.event.gmail_message_id ?? "",
          payload.event.gmail_thread_id ?? "",
          payload.event.gmail_url ?? "",
          payload.event.source ?? "手动记录",
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

    if (payload.action === "rebuildContactEvents" && payload.events && payload.professorStatuses) {
      const professorIds = new Set(
        (await db.prepare("SELECT id FROM professors").all<{ id: string }>()).results?.map((row) => row.id) ?? [],
      );
      const seenMessages = new Set<string>();
      for (const event of payload.events) {
        if (!event.id || !event.professor_id || !professorIds.has(event.professor_id)) {
          throw new Error("联系事件包含未知教授或缺少ID。");
        }
        validateDate(event.event_date, "event_date");
        validateDate(event.next_action_date, "next_action_date");
        if (event.gmail_message_id) {
          if (seenMessages.has(event.gmail_message_id)) throw new Error("Gmail消息ID重复。");
          seenMessages.add(event.gmail_message_id);
        }
      }
      await createBackup(db, "Gmail真实时间线重建前");
      const statements = [
        db.prepare("DELETE FROM contact_events"),
        db.prepare("DELETE FROM work_events WHERE event_type='教授联系'"),
      ];
      for (const event of payload.events) {
        statements.push(
          db.prepare(
            `INSERT INTO contact_events
             (id, professor_id, event_type, event_date, occurred_at, direction, subject, summary, attachments,
              gmail_message_id, gmail_thread_id, gmail_url, source, status_after, next_action_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).bind(
            event.id,
            event.professor_id,
            event.event_type,
            event.event_date,
            event.occurred_at ?? event.event_date,
            event.direction ?? "",
            event.subject ?? "",
            event.summary ?? "",
            event.attachments ?? "",
            event.gmail_message_id ?? "",
            event.gmail_thread_id ?? "",
            event.gmail_url ?? "",
            event.source ?? "Gmail",
            event.status_after ?? "",
            event.next_action_date ?? "",
          ),
        );
      }
      for (const [professorId, status] of Object.entries(payload.professorStatuses)) {
        if (!professorIds.has(professorId)) continue;
        statements.push(
          db.prepare("UPDATE professors SET current_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status, professorId),
        );
      }
      await db.batch(statements);
      return Response.json({ ok: true, count: payload.events.length });
    }

    if (payload.action === "replaceScreenings" && payload.screenings) {
      const universities = new Set<string>();
      for (const row of payload.screenings) {
        if (!row.id || !row.university) throw new Error("全国筛选记录缺少大学或ID。");
        if (universities.has(String(row.university))) throw new Error("全国筛选记录包含重复大学。");
        universities.add(String(row.university));
        validateDate(row.verified_at, "verified_at");
      }
      await createBackup(db, "导入全国筛选档案前");
      const statements = [db.prepare("DELETE FROM school_screenings")];
      for (const row of payload.screenings) {
        statements.push(
          db.prepare(
            `INSERT INTO school_screenings
             (id, region, university, nature, talent_path, checked_organization, language_gate,
              research_student_screening, related_faculty, final_status, conclusion, official_source,
              verified_at, archived)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).bind(
            row.id,
            row.region ?? "",
            row.university,
            row.nature ?? "",
            row.talent_path ?? "",
            row.checked_organization ?? "",
            row.language_gate ?? "",
            row.research_student_screening ?? "",
            row.related_faculty ?? "",
            row.final_status ?? "待确认",
            row.conclusion ?? "",
            row.official_source ?? "",
            row.verified_at ?? "",
            row.archived ?? 0,
          ),
        );
      }
      await db.batch(statements);
      return Response.json({ ok: true, count: payload.screenings.length });
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
        schoolScreenings: "school_screenings",
        workEvents: "work_events",
        tasks: "tasks",
      };
      const deletionOrder = [
        "subjects",
        "contact_events",
        "school_screenings",
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
