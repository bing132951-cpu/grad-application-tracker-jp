import { env } from "cloudflare:workers";

export function getD1(): D1Database {
  if (!env.DB) {
    throw new Error("本地数据库尚未连接，请通过一键启动脚本运行应用。");
  }
  return env.DB;
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    education TEXT NOT NULL DEFAULT '',
    gpa TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT '',
    target TEXT NOT NULL DEFAULT '',
    research_topic TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS schools (
    id TEXT PRIMARY KEY,
    university TEXT NOT NULL,
    nature TEXT NOT NULL DEFAULT '国立',
    graduate_school TEXT NOT NULL,
    major TEXT NOT NULL,
    website TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '主申',
    priority TEXT NOT NULL DEFAULT 'A',
    fit TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(university, graduate_school, major)
  )`,
  `CREATE TABLE IF NOT EXISTS exams (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    intake_year INTEGER NOT NULL,
    round TEXT NOT NULL DEFAULT '一般選抜',
    method TEXT NOT NULL DEFAULT '一般入試',
    guidelines_url TEXT NOT NULL DEFAULT '',
    application_start TEXT NOT NULL DEFAULT '',
    application_end TEXT NOT NULL DEFAULT '',
    exam_start TEXT NOT NULL DEFAULT '',
    exam_end TEXT NOT NULL DEFAULT '',
    written TEXT NOT NULL DEFAULT '',
    oral TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT '',
    pre_contact TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '待确认',
    official_source TEXT NOT NULL DEFAULT '',
    verified_at TEXT NOT NULL DEFAULT '',
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(school_id, intake_year, round)
  )`,
  `CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL,
    name TEXT NOT NULL,
    requirement TEXT NOT NULL DEFAULT '必考',
    mastery TEXT NOT NULL DEFAULT '未评估',
    progress TEXT NOT NULL DEFAULT '未开始',
    past_questions_url TEXT NOT NULL DEFAULT '',
    reference_book TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS professors (
    id TEXT PRIMARY KEY,
    university TEXT NOT NULL,
    graduate_school TEXT NOT NULL DEFAULT '',
    lab TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '教授',
    email TEXT NOT NULL DEFAULT '',
    lab_url TEXT NOT NULL DEFAULT '',
    research TEXT NOT NULL DEFAULT '',
    fit TEXT NOT NULL DEFAULT '',
    identity TEXT NOT NULL DEFAULT '',
    system_status TEXT NOT NULL DEFAULT '',
    language_status TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'B',
    risk TEXT NOT NULL DEFAULT '',
    gmail_thread_id TEXT NOT NULL DEFAULT '',
    current_status TEXT NOT NULL DEFAULT '候选',
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(university, name)
  )`,
  `CREATE TABLE IF NOT EXISTS contact_events (
    id TEXT PRIMARY KEY,
    professor_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_date TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    attachments TEXT NOT NULL DEFAULT '',
    status_after TEXT NOT NULL DEFAULT '',
    next_action_date TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS work_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    event_date TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    related_school_id TEXT NOT NULL DEFAULT '',
    related_professor_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    due_date TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '待处理',
    related_school_id TEXT NOT NULL DEFAULT '',
    related_professor_id TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS backups (
    id TEXT PRIMARY KEY,
    reason TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
];

let initialized = false;

export async function ensureSchema(db = getD1()) {
  if (initialized) return db;
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
  initialized = true;
  return db;
}

export async function allRows<T>(db: D1Database, table: string) {
  const result = await db.prepare(`SELECT * FROM ${table}`).all<T>();
  return result.results ?? [];
}

export async function snapshot(db: D1Database) {
  const [profiles, schools, exams, subjects, professors, contactEvents, workEvents, tasks] =
    await Promise.all([
      allRows(db, "profiles"),
      allRows(db, "schools"),
      allRows(db, "exams"),
      allRows(db, "subjects"),
      allRows(db, "professors"),
      allRows(db, "contact_events"),
      allRows(db, "work_events"),
      allRows(db, "tasks"),
    ]);
  return { profiles, schools, exams, subjects, professors, contactEvents, workEvents, tasks };
}

export async function createBackup(db: D1Database, reason: string) {
  const payload = JSON.stringify(await snapshot(db));
  await db
    .prepare("INSERT INTO backups (id, reason, payload_json) VALUES (?, ?, ?)")
    .bind(crypto.randomUUID(), reason, payload)
    .run();
}
