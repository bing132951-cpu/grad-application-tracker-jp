import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const profiles = sqliteTable("profiles", {
  id: integer("id").primaryKey(),
  name: text("name").notNull().default(""),
  email: text("email").notNull().default(""),
  education: text("education").notNull().default(""),
  gpa: text("gpa").notNull().default(""),
  language: text("language").notNull().default(""),
  target: text("target").notNull().default(""),
  researchTopic: text("research_topic").notNull().default(""),
  ...timestamps,
});

export const schools = sqliteTable("schools", {
  id: text("id").primaryKey(),
  university: text("university").notNull(),
  nature: text("nature").notNull().default("国立"),
  graduateSchool: text("graduate_school").notNull(),
  major: text("major").notNull(),
  website: text("website").notNull().default(""),
  category: text("category").notNull().default("主申"),
  priority: text("priority").notNull().default("A"),
  fit: text("fit").notNull().default(""),
  note: text("note").notNull().default(""),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
}, (table) => [
  uniqueIndex("schools_program_unique").on(
    table.university,
    table.graduateSchool,
    table.major,
  ),
]);

export const exams = sqliteTable("exams", {
  id: text("id").primaryKey(),
  schoolId: text("school_id").notNull().references(() => schools.id),
  intakeYear: integer("intake_year").notNull(),
  round: text("round").notNull().default("一般選抜"),
  method: text("method").notNull().default("一般入試"),
  guidelinesUrl: text("guidelines_url").notNull().default(""),
  applicationStart: text("application_start").notNull().default(""),
  applicationEnd: text("application_end").notNull().default(""),
  examStart: text("exam_start").notNull().default(""),
  examEnd: text("exam_end").notNull().default(""),
  written: text("written").notNull().default(""),
  oral: text("oral").notNull().default(""),
  language: text("language").notNull().default(""),
  preContact: text("pre_contact").notNull().default(""),
  status: text("status").notNull().default("待确认"),
  officialSource: text("official_source").notNull().default(""),
  verifiedAt: text("verified_at").notNull().default(""),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
}, (table) => [
  uniqueIndex("exams_unique").on(
    table.schoolId,
    table.intakeYear,
    table.round,
  ),
]);

export const subjects = sqliteTable("subjects", {
  id: text("id").primaryKey(),
  examId: text("exam_id").notNull().references(() => exams.id),
  name: text("name").notNull(),
  requirement: text("requirement").notNull().default("必考"),
  mastery: text("mastery").notNull().default("未评估"),
  progress: text("progress").notNull().default("未开始"),
  pastQuestionsUrl: text("past_questions_url").notNull().default(""),
  referenceBook: text("reference_book").notNull().default(""),
  note: text("note").notNull().default(""),
  ...timestamps,
});

export const professors = sqliteTable("professors", {
  id: text("id").primaryKey(),
  university: text("university").notNull(),
  graduateSchool: text("graduate_school").notNull().default(""),
  lab: text("lab").notNull().default(""),
  name: text("name").notNull(),
  title: text("title").notNull().default("教授"),
  email: text("email").notNull().default(""),
  labUrl: text("lab_url").notNull().default(""),
  research: text("research").notNull().default(""),
  fit: text("fit").notNull().default(""),
  identity: text("identity").notNull().default(""),
  systemStatus: text("system_status").notNull().default(""),
  languageStatus: text("language_status").notNull().default(""),
  priority: text("priority").notNull().default("B"),
  risk: text("risk").notNull().default(""),
  gmailThreadId: text("gmail_thread_id").notNull().default(""),
  currentStatus: text("current_status").notNull().default("候选"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
}, (table) => [
  uniqueIndex("professors_unique").on(table.university, table.name),
]);

export const contactEvents = sqliteTable("contact_events", {
  id: text("id").primaryKey(),
  professorId: text("professor_id").notNull().references(() => professors.id),
  eventType: text("event_type").notNull(),
  eventDate: text("event_date").notNull(),
  occurredAt: text("occurred_at").notNull().default(""),
  direction: text("direction").notNull().default(""),
  subject: text("subject").notNull().default(""),
  summary: text("summary").notNull().default(""),
  attachments: text("attachments").notNull().default(""),
  gmailMessageId: text("gmail_message_id").notNull().default(""),
  gmailThreadId: text("gmail_thread_id").notNull().default(""),
  gmailUrl: text("gmail_url").notNull().default(""),
  source: text("source").notNull().default("Gmail"),
  statusAfter: text("status_after").notNull().default(""),
  nextActionDate: text("next_action_date").notNull().default(""),
  ...timestamps,
});

export const schoolScreenings = sqliteTable("school_screenings", {
  id: text("id").primaryKey(),
  region: text("region").notNull().default(""),
  university: text("university").notNull(),
  nature: text("nature").notNull().default("国立"),
  talentPath: text("talent_path").notNull().default(""),
  checkedOrganization: text("checked_organization").notNull().default(""),
  languageGate: text("language_gate").notNull().default(""),
  researchStudentScreening: text("research_student_screening").notNull().default(""),
  relatedFaculty: text("related_faculty").notNull().default(""),
  finalStatus: text("final_status").notNull().default("待确认"),
  conclusion: text("conclusion").notNull().default(""),
  officialSource: text("official_source").notNull().default(""),
  verifiedAt: text("verified_at").notNull().default(""),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
}, (table) => [
  uniqueIndex("school_screenings_university_unique").on(table.university),
]);

export const workEvents = sqliteTable("work_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  eventDate: text("event_date").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  relatedSchoolId: text("related_school_id").notNull().default(""),
  relatedProfessorId: text("related_professor_id").notNull().default(""),
  ...timestamps,
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  dueDate: text("due_date").notNull().default(""),
  status: text("status").notNull().default("待处理"),
  relatedSchoolId: text("related_school_id").notNull().default(""),
  relatedProfessorId: text("related_professor_id").notNull().default(""),
  note: text("note").notNull().default(""),
  ...timestamps,
});

export const backups = sqliteTable("backups", {
  id: text("id").primaryKey(),
  reason: text("reason").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
