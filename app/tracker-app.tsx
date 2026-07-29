"use client";

import { FormEvent, Fragment, useEffect, useMemo, useState } from "react";

type Row = Record<string, string | number | boolean | null>;
type State = {
  profiles: Row[];
  schools: Row[];
  exams: Row[];
  subjects: Row[];
  professors: Row[];
  contactEvents: Row[];
  schoolScreenings: Row[];
  workEvents: Row[];
  tasks: Row[];
  backups: Row[];
};

type Tab = "overview" | "schools" | "professors" | "screenings" | "activities" | "settings";
type ProfessorSection = "current" | "candidate" | "history";
type Editor =
  | { kind: "school"; record?: Row }
  | { kind: "professor"; record?: Row }
  | { kind: "contact"; professor: Row }
  | { kind: "work" }
  | { kind: "task" }
  | { kind: "profile"; record?: Row }
  | null;

const emptyState: State = {
  profiles: [],
  schools: [],
  exams: [],
  subjects: [],
  professors: [],
  contactEvents: [],
  schoolScreenings: [],
  workEvents: [],
  tasks: [],
  backups: [],
};

const navItems: { id: Tab; label: string; symbol: string }[] = [
  { id: "overview", label: "申请总览", symbol: "⌂" },
  { id: "schools", label: "学校与入试", symbol: "校" },
  { id: "professors", label: "教授与套磁", symbol: "人" },
  { id: "screenings", label: "全国筛选档案", symbol: "全" },
  { id: "activities", label: "工作记录", symbol: "记" },
  { id: "settings", label: "设置与数据", symbol: "设" },
];

const today = () => new Date().toISOString().slice(0, 10);
const uuid = () => crypto.randomUUID();
const text = (value: unknown) => String(value ?? "");
const active = (row: Row) => !Boolean(row.archived);

async function api(body: unknown) {
  const response = await fetch("/api/state", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(result.error || "保存失败。");
  return result;
}

function formatDate(value: unknown) {
  const raw = text(value);
  if (!raw) return "待确定";
  return raw.replaceAll("-", ".");
}

function formatDateTime(value: unknown) {
  const raw = text(value);
  if (!raw) return "待确定";
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!match) return formatDate(raw);
  return `${match[1]}.${match[2]}.${match[3]}${match[4] ? ` ${match[4]}:${match[5]}` : ""}`;
}

function statusClass(value: unknown) {
  const status = text(value);
  if (/排除|拒绝|不可|满员/.test(status)) return "danger";
  if (/等待|待确认|条件|暂缓|候选/.test(status)) return "warning";
  if (/回复|完成|通过|主申|已发送/.test(status)) return "success";
  return "neutral";
}

export function TrackerApp() {
  const [state, setState] = useState<State>(emptyState);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [professorSection, setProfessorSection] = useState<ProfessorSection>("current");
  const [showAllScreenings, setShowAllScreenings] = useState(false);
  const [expanded, setExpanded] = useState("");
  const [editor, setEditor] = useState<Editor>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      const result = (await response.json()) as State & { error?: string };
      if (!response.ok) throw new Error(result.error || "读取数据失败。");
      setState({ ...emptyState, ...result });
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取数据失败。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial data is intentionally loaded from the local API after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, []);

  const professors = state.professors.filter(active);
  const schools = state.schools.filter(active);
  const browsableSchools = showArchived ? state.schools : schools;
  const hasContact = (professor: Row) =>
    state.contactEvents.some((event) => event.professor_id === professor.id);
  const professorPool =
    professorSection === "history"
      ? state.professors.filter((professor) => !active(professor))
      : state.professors.filter(
          (professor) =>
            active(professor) &&
            (professorSection === "current" ? hasContact(professor) : !hasContact(professor)),
        );
  const filteredProfessors = professorPool.filter((professor) =>
    [professor.name, professor.university, professor.research, professor.current_status]
      .map(text)
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const filteredSchools = browsableSchools.filter((school) => {
    const matchesQuery = [school.university, school.graduate_school, school.major]
      .map(text)
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase());
    const examYears = state.exams
      .filter((exam) => exam.school_id === school.id && active(exam))
      .map((exam) => text(exam.intake_year));
    return matchesQuery && (year === "all" || examYears.includes(year));
  });
  const visibleScreeningStatuses = /有可申请候选|N2结果待确认|2027制度待确认/;
  const filteredScreenings = state.schoolScreenings.filter((screening) => {
    const matchesQuery = [screening.university, screening.checked_organization, screening.related_faculty, screening.final_status]
      .map(text)
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase());
    return matchesQuery && (showAllScreenings || visibleScreeningStatuses.test(text(screening.final_status)));
  });

  const metrics = useMemo(() => {
    const contacted = new Set(
      state.contactEvents
        .filter((event) => text(event.direction) === "发出")
        .map((event) => text(event.professor_id)),
    ).size;
    const replied = new Set(
      state.contactEvents
        .filter((event) => text(event.direction) === "收到" && text(event.event_type) === "教授回复")
        .map((event) => text(event.professor_id)),
    ).size;
    const waiting = professors.filter((p) => /等待回复/.test(text(p.current_status))).length;
    const weakSubjects = state.subjects.filter((s) => /未评估|待评估|薄弱|零基础/.test(text(s.mastery))).length;
    return { contacted, replied, waiting, weakSubjects };
  }, [professors, state.contactEvents, state.subjects]);

  const upcoming = useMemo(() => {
    const rows: { date: string; title: string; type: string }[] = [];
    state.tasks
      .filter((task) => task.status !== "完成" && task.due_date)
      .forEach((task) => rows.push({ date: text(task.due_date), title: text(task.title), type: "待办" }));
    state.exams
      .filter(active)
      .forEach((exam) => {
        if (exam.application_end) {
          const school = schools.find((item) => item.id === exam.school_id);
          rows.push({
            date: text(exam.application_end),
            title: `${text(school?.university)} 出愿截止`,
            type: `${text(exam.intake_year)}入学`,
          });
        }
      });
    state.contactEvents.forEach((event) => {
      const alreadyTracked = state.tasks.some(
        (task) =>
          task.related_professor_id === event.professor_id &&
          task.due_date === event.next_action_date &&
          task.status !== "完成",
      );
      if (event.next_action_date && !alreadyTracked) {
        const professor = professors.find((item) => item.id === event.professor_id);
        rows.push({
          date: text(event.next_action_date),
          title: `${text(professor?.name)}教授：下一行动`,
          type: "联系",
        });
      }
    });
    return rows
      .filter((row) => row.date >= today())
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8);
  }, [state.tasks, state.exams, state.contactEvents, schools, professors]);

  const recentActivity = useMemo(() => {
    const contacts = state.contactEvents.map((event) => {
      const professor = state.professors.find((item) => item.id === event.professor_id);
      return {
        id: text(event.id),
        date: text(event.occurred_at || event.event_date),
        type: "教授联系",
        title: `${text(professor?.name)}教授 · ${text(event.event_type)}`,
        summary: text(event.summary),
      };
    });
    const work = state.workEvents
      .filter((event) => text(event.event_type) !== "教授联系")
      .map((event) => ({
        id: text(event.id),
        date: text(event.event_date),
        type: text(event.event_type),
        title: text(event.title),
        summary: text(event.summary),
      }));
    return [...contacts, ...work].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 80);
  }, [state.contactEvents, state.workEvents, state.professors]);

  const handleSaved = async (message: string) => {
    setEditor(null);
    setNotice(message);
    await reload();
    window.setTimeout(() => setNotice(""), 2600);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">院</span>
          <div>
            <strong>大学院申请看板</strong>
            <small>Graduate Tracker</small>
          </div>
        </div>
        <nav aria-label="主要导航">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "nav-item active" : "nav-item"}
              onClick={() => setTab(item.id)}
            >
              <span>{item.symbol}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="privacy-dot" />
          <div>
            <strong>仅保存在本机</strong>
            <p>未连接邮箱，也不会自动发送邮件。</p>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">2027 / 2028 日本大学院申请</p>
            <h1>{navItems.find((item) => item.id === tab)?.label}</h1>
          </div>
          <div className="top-actions">
            {(tab === "schools" || tab === "professors" || tab === "screenings") && (
              <>
                <label className="search">
                  <span>⌕</span>
                  <input
                    aria-label="搜索"
                    placeholder="搜索学校、教授或研究方向"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                {tab === "schools" && <label className="archive-toggle">
                  <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
                  显示历史/排除
                </label>}
              </>
            )}
            <button className="button ghost" onClick={reload}>刷新</button>
            {tab !== "screenings" && <button
              className="button primary"
              onClick={() =>
                setEditor(
                  tab === "schools"
                    ? { kind: "school" }
                    : tab === "professors"
                      ? { kind: "professor" }
                      : { kind: "work" },
                )
              }
            >
              ＋ 新增记录
            </button>}
          </div>
        </header>

        {error && <div className="alert error">{error}</div>}
        {notice && <div className="alert success">{notice}</div>}
        {loading ? (
          <div className="loading">正在整理申请记录…</div>
        ) : (
          <>
            {tab === "overview" && (
              <Overview
                profile={state.profiles[0]}
                schools={schools}
                metrics={metrics}
                upcoming={upcoming}
                activity={recentActivity.slice(0, 6)}
                tasks={state.tasks}
                onEditProfile={() => setEditor({ kind: "profile", record: state.profiles[0] })}
                onAddTask={() => setEditor({ kind: "task" })}
              />
            )}
            {tab === "schools" && (
              <Schools
                schools={filteredSchools}
                exams={state.exams}
                subjects={state.subjects}
                year={year}
                setYear={setYear}
                expanded={expanded}
                setExpanded={setExpanded}
                onEdit={(record) => setEditor({ kind: "school", record })}
                onSubjectSaved={handleSaved}
              />
            )}
            {tab === "professors" && (
              <Professors
                professors={filteredProfessors}
                events={state.contactEvents}
                section={professorSection}
                setSection={setProfessorSection}
                expanded={expanded}
                setExpanded={setExpanded}
                onEdit={(record) => setEditor({ kind: "professor", record })}
                onEvent={(professor) => setEditor({ kind: "contact", professor })}
              />
            )}
            {tab === "screenings" && (
              <Screenings
                rows={filteredScreenings}
                total={state.schoolScreenings.length}
                showAll={showAllScreenings}
                setShowAll={setShowAllScreenings}
              />
            )}
            {tab === "activities" && (
              <Activities
                activity={recentActivity}
                onAdd={() => setEditor({ kind: "work" })}
              />
            )}
            {tab === "settings" && (
              <Settings
                state={state}
                onEditProfile={() => setEditor({ kind: "profile", record: state.profiles[0] })}
                onImported={handleSaved}
              />
            )}
          </>
        )}
      </main>

      {editor && (
        <EditorPanel
          editor={editor}
          state={state}
          onClose={() => setEditor(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

function Overview({
  profile,
  schools,
  metrics,
  upcoming,
  activity,
  tasks,
  onEditProfile,
  onAddTask,
}: {
  profile?: Row;
  schools: Row[];
  metrics: { contacted: number; replied: number; waiting: number; weakSubjects: number };
  upcoming: { date: string; title: string; type: string }[];
  activity: { id: string; date: string; type: string; title: string; summary: string }[];
  tasks: Row[];
  onEditProfile: () => void;
  onAddTask: () => void;
}) {
  const cards = [
    ["目标项目", schools.filter((s) => s.category !== "私立保底").length, "国公立主申与条件候选"],
    ["累计已联系", metrics.contacted, `${metrics.replied} 位收到过明确回复`],
    ["等待回复", metrics.waiting, "按下一行动日期跟进"],
    ["薄弱科目", metrics.weakSubjects, "未评估、薄弱或零基础"],
  ];
  return (
    <div className="page-stack">
      <section className="hero">
        <div>
          <p className="eyebrow">CURRENT OBJECTIVE</p>
          <h2>{text(profile?.target) || "设定你的申请目标"}</h2>
          <p>{text(profile?.research_topic) || "填写研究主题后，首页会持续显示申请核心。"}</p>
        </div>
        <button className="button light" onClick={onEditProfile}>编辑个人目标</button>
      </section>

      <section className="metric-grid">
        {cards.map(([label, value, note]) => (
          <article className="metric-card" key={String(label)}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">NEXT</p>
              <h3>接下来要做什么</h3>
            </div>
            <button className="text-button" onClick={onAddTask}>＋ 添加待办</button>
          </div>
          <div className="timeline">
            {upcoming.length ? upcoming.map((item) => (
              <div className="timeline-item" key={`${item.date}-${item.title}`}>
                <time>{formatDate(item.date)}</time>
                <div><strong>{item.title}</strong><span>{item.type}</span></div>
              </div>
            )) : <Empty text="还没有带日期的待办或考试安排。" />}
          </div>
        </div>
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">RECENT</p>
              <h3>最近完成的工作</h3>
            </div>
          </div>
          <div className="activity-list">
            {activity.length ? activity.map((item) => (
              <div className="activity-row" key={item.id}>
                <span className="activity-icon">{item.type.slice(0, 1)}</span>
                <div><strong>{item.title}</strong><p>{item.summary || "没有补充说明"}</p></div>
                <time>{formatDate(item.date)}</time>
              </div>
            )) : <Empty text="新增教授联系或工作记录后，会自动出现在这里。" />}
          </div>
        </div>
      </section>

      {tasks.some((task) => task.status !== "完成") && (
        <section className="panel">
          <div className="panel-heading"><h3>待办清单</h3></div>
          <div className="chip-list">
            {tasks.filter((task) => task.status !== "完成").map((task) => (
              <span className="task-chip" key={text(task.id)}>
                {text(task.title)} · {formatDate(task.due_date)}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Schools({
  schools,
  exams,
  subjects,
  year,
  setYear,
  expanded,
  setExpanded,
  onEdit,
  onSubjectSaved,
}: {
  schools: Row[];
  exams: Row[];
  subjects: Row[];
  year: string;
  setYear: (year: string) => void;
  expanded: string;
  setExpanded: (id: string) => void;
  onEdit: (record: Row) => void;
  onSubjectSaved: (message: string) => Promise<void>;
}) {
  return (
    <div className="page-stack">
      <div className="filterbar">
        {["all", "2027", "2028"].map((item) => (
          <button
            key={item}
            className={year === item ? "filter active" : "filter"}
            onClick={() => setYear(item)}
          >
            {item === "all" ? "全部年度" : `${item}年4月`}
          </button>
        ))}
        <span className="result-count">{schools.length} 个目标专攻</span>
      </div>
      <div className="table-card">
        <div className="table-scroll">
          <table>
            <thead><tr><th>目标学校</th><th>研究科・専攻</th><th>分类</th><th>优先级</th><th>最近出愿</th><th>状态</th><th /></tr></thead>
            <tbody>
              {schools.map((school) => {
                const schoolExams = exams.filter((exam) => exam.school_id === school.id && active(exam));
                const closest = schoolExams.filter((exam) => exam.application_end).sort((a, b) => text(a.application_end).localeCompare(text(b.application_end)))[0];
                return (
                  <Fragment key={text(school.id)}>
                    <tr>
                      <td><strong>{text(school.university)}</strong><small>{text(school.nature)}</small></td>
                      <td>{text(school.graduate_school)}<small>{text(school.major)}</small></td>
                      <td><Badge value={school.category} /></td>
                      <td><span className="priority">{text(school.priority)}</span></td>
                      <td>{formatDate(closest?.application_end)}</td>
                      <td><Badge value={closest?.status || "待补充考试"} /></td>
                      <td className="row-actions">
                        <button onClick={() => onEdit(school)}>编辑</button>
                        <button onClick={() => setExpanded(expanded === school.id ? "" : text(school.id))}>
                          {expanded === school.id ? "收起" : "详情"}
                        </button>
                      </td>
                    </tr>
                    {expanded === school.id && (
                      <tr className="detail-row" key={`${text(school.id)}-detail`}>
                        <td colSpan={7}>
                          <SchoolDetails school={school} exams={schoolExams} subjects={subjects} onSaved={onSubjectSaved} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {!schools.length && <Empty text="没有符合筛选条件的学校。点击“新增记录”开始。" />}
        </div>
      </div>
    </div>
  );
}

function SchoolDetails({ school, exams, subjects, onSaved }: { school: Row; exams: Row[]; subjects: Row[]; onSaved: (message: string) => Promise<void> }) {
  const saveSubject = async (subject: Row) => {
    await api({ action: "upsert", entity: "subject", record: subject });
    await onSaved("科目进度已保存。");
  };
  return (
    <div className="detail-grid">
      <div className="detail-summary">
        <h4>{text(school.fit) || "尚未填写适合度说明"}</h4>
        <p>{text(school.note) || "没有补充备注。"}</p>
        {school.website && <a href={text(school.website)} target="_blank" rel="noreferrer">打开专攻官网 ↗</a>}
      </div>
      {exams.length ? exams.sort((a, b) => Number(a.intake_year) - Number(b.intake_year)).map((exam) => {
        const examSubjects = subjects.filter((subject) => subject.exam_id === exam.id);
        return (
          <article className="exam-card" key={text(exam.id)}>
            <div className="exam-heading">
              <div><strong>{text(exam.intake_year)}年4月</strong><span>{text(exam.round)}</span></div>
              <Badge value={exam.status} />
            </div>
            <dl>
              <div><dt>出愿</dt><dd>{formatDate(exam.application_start)} — {formatDate(exam.application_end)}</dd></div>
              <div><dt>考试</dt><dd>{formatDate(exam.exam_start)} — {formatDate(exam.exam_end)}</dd></div>
              <div><dt>笔试</dt><dd>{text(exam.written) || "待补充"}</dd></div>
              <div><dt>口试</dt><dd>{text(exam.oral) || "待补充"}</dd></div>
              <div><dt>语言</dt><dd>{text(exam.language) || "待补充"}</dd></div>
            </dl>
            <div className="subject-list">
              {examSubjects.map((subject) => (
                <SubjectRow key={text(subject.id)} subject={subject} onSave={saveSubject} />
              ))}
              {!examSubjects.length && <small>尚未添加考试科目。</small>}
            </div>
            <div className="source-row">
              {exam.guidelines_url && <a href={text(exam.guidelines_url)} target="_blank" rel="noreferrer">募集要项 ↗</a>}
              <span>核查：{formatDate(exam.verified_at)}</span>
            </div>
          </article>
        );
      }) : <Empty text="这所学校还没有年度考试记录。" />}
    </div>
  );
}

function SubjectRow({ subject, onSave }: { subject: Row; onSave: (subject: Row) => void }) {
  const [draft, setDraft] = useState(subject);
  return (
    <div className="subject-row">
      <div><strong>{text(subject.name)}</strong><span>{text(subject.requirement)}</span></div>
      <select value={text(draft.mastery)} onChange={(e) => setDraft({ ...draft, mastery: e.target.value })}>
        {["未评估", "零基础", "薄弱", "一般", "掌握"].map((item) => <option key={item}>{item}</option>)}
      </select>
      <select value={text(draft.progress)} onChange={(e) => setDraft({ ...draft, progress: e.target.value })}>
        {["未开始", "进行中", "已完成"].map((item) => <option key={item}>{item}</option>)}
      </select>
      <button onClick={() => onSave(draft)}>保存</button>
    </div>
  );
}

function Professors({
  professors,
  events,
  section,
  setSection,
  expanded,
  setExpanded,
  onEdit,
  onEvent,
}: {
  professors: Row[];
  events: Row[];
  section: ProfessorSection;
  setSection: (section: ProfessorSection) => void;
  expanded: string;
  setExpanded: (id: string) => void;
  onEdit: (record: Row) => void;
  onEvent: (record: Row) => void;
}) {
  const labels: Record<ProfessorSection, string> = {
    current: "当前申请",
    candidate: "尚未联系候选",
    history: "历史联系与排除",
  };
  return (
    <div className="page-stack">
      <div className="filterbar">
        {(Object.keys(labels) as ProfessorSection[]).map((item) => (
          <button
            key={item}
            className={section === item ? "filter active" : "filter"}
            onClick={() => setSection(item)}
          >
            {labels[item]}
          </button>
        ))}
        <span className="result-count">{professors.length} 位教授</span>
      </div>
      <div className="table-card">
      <div className="table-scroll">
        <table>
          <thead><tr><th>教授</th><th>大学・研究室</th><th>研究方向</th><th>优先级</th><th>当前状态</th><th>下一行动</th><th /></tr></thead>
          <tbody>
            {professors.map((professor) => {
              const professorEvents = events
                .filter((event) => event.professor_id === professor.id)
                .sort((a, b) => text(b.occurred_at || b.event_date).localeCompare(text(a.occurred_at || a.event_date)));
              const next = professorEvents.find((event) => event.next_action_date);
              return (
                <Fragment key={text(professor.id)}>
                  <tr>
                    <td><strong>{text(professor.name)} {text(professor.title)}</strong><small>{text(professor.email) || "邮箱待补充"}</small></td>
                    <td>{text(professor.university)}<small>{text(professor.lab)}</small></td>
                    <td className="research-cell">{text(professor.research) || "待补充"}</td>
                    <td><span className="priority">{text(professor.priority)}</span></td>
                    <td><Badge value={professor.current_status} /></td>
                    <td>{formatDate(next?.next_action_date)}</td>
                    <td className="row-actions">
                      <button onClick={() => onEvent(professor)}>记联系</button>
                      <button onClick={() => onEdit(professor)}>编辑</button>
                      <button onClick={() => setExpanded(expanded === professor.id ? "" : text(professor.id))}>时间线</button>
                    </td>
                  </tr>
                  {expanded === professor.id && (
                    <tr className="detail-row" key={`${text(professor.id)}-detail`}>
                      <td colSpan={7}>
                        <ProfessorDetails professor={professor} events={professorEvents} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!professors.length && <Empty text="还没有教授记录。点击“新增记录”开始。" />}
      </div>
      </div>
    </div>
  );
}

function ProfessorDetails({ professor, events }: { professor: Row; events: Row[] }) {
  return (
    <div className="professor-detail">
      <div className="professor-facts">
        <h4>与研究计划的联系</h4><p>{text(professor.fit) || "待补充"}</p>
        <h4>正确申请身份</h4><p>{text(professor.identity) || "待确认"}</p>
        <h4>制度与语言</h4><p>{text(professor.system_status) || "待确认"} · {text(professor.language_status) || "待确认"}</p>
        <h4>主要风险</h4><p>{text(professor.risk) || "无特别记录"}</p>
        {professor.lab_url && <a href={text(professor.lab_url)} target="_blank" rel="noreferrer">研究室主页 ↗</a>}
        {professor.gmail_thread_id && <a href={`https://mail.google.com/mail/u/0/#all/${text(professor.gmail_thread_id)}`} target="_blank" rel="noreferrer">打开Gmail线程 ↗</a>}
      </div>
      <div className="contact-timeline">
        <h4>完整联系时间线</h4>
        {events.length ? events.map((event) => (
          <div className="contact-event" key={text(event.id)}>
            <time>{formatDateTime(event.occurred_at || event.event_date)}</time>
            <span className="timeline-dot" />
            <div>
              <strong>{text(event.event_type)} · {text(event.direction) || "手动"}</strong>
              {event.subject && <p className="event-subject">{text(event.subject)}</p>}
              <p>{text(event.summary) || "没有摘要"}</p>
              {event.attachments && <small>附件：{text(event.attachments)}</small>}
              {event.status_after && <Badge value={event.status_after} />}
              {event.gmail_url && <a href={text(event.gmail_url)} target="_blank" rel="noreferrer">打开这封邮件 ↗</a>}
            </div>
          </div>
        )) : <Empty text="尚未联系。首次发送后在这里添加事件。" />}
      </div>
    </div>
  );
}

function Screenings({
  rows,
  total,
  showAll,
  setShowAll,
}: {
  rows: Row[];
  total: number;
  showAll: boolean;
  setShowAll: (value: boolean) => void;
}) {
  return (
    <div className="page-stack">
      <div className="section-intro">
        <div>
          <h2>全国国公立高度人才加分校筛选档案</h2>
          <p>日常默认只显示可申请、N2待确认和制度待确认学校；排除记录仍完整保留。</p>
        </div>
        <label className="archive-toggle">
          <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
          显示全部74校
        </label>
      </div>
      <div className="filterbar">
        <span className="result-count">当前显示 {rows.length}／{total} 所</span>
      </div>
      <div className="table-card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>大学</th><th>区域・性质</th><th>最终状态</th><th>相关组织与教师</th><th>语言／制度</th><th>结论</th><th>依据</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={text(row.id)}>
                  <td><strong>{text(row.university)}</strong><small>{text(row.talent_path)}</small></td>
                  <td>{text(row.region)}<small>{text(row.nature)}</small></td>
                  <td><Badge value={row.final_status} /></td>
                  <td>{text(row.checked_organization) || "待补充"}<small>{text(row.related_faculty)}</small></td>
                  <td>{text(row.language_gate) || "待确认"}<small>{text(row.research_student_screening)}</small></td>
                  <td className="research-cell">{text(row.conclusion) || "待补充"}</td>
                  <td>
                    {row.official_source
                      ? <a href={text(row.official_source).split(/\s+/)[0]} target="_blank" rel="noreferrer">官方资料 ↗</a>
                      : "待补充"}
                    <small>核查：{formatDate(row.verified_at)}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <Empty text="没有符合当前筛选条件的学校。" />}
        </div>
      </div>
    </div>
  );
}

function Activities({ activity, onAdd }: { activity: { id: string; date: string; type: string; title: string; summary: string }[]; onAdd: () => void }) {
  return (
    <div className="page-stack">
      <div className="section-intro">
        <div><h2>申请工作的完整记录</h2><p>教授联系、制度核查、材料准备、研究计划和考试复习按日期汇总。</p></div>
        <button className="button primary" onClick={onAdd}>＋ 记录一项工作</button>
      </div>
      <div className="panel activity-feed">
        {activity.length ? activity.map((item) => (
          <div className="feed-row" key={item.id}>
            <time>{formatDate(item.date)}</time>
            <span className="feed-line" />
            <div><Badge value={item.type} /><h3>{item.title}</h3><p>{item.summary || "没有补充说明"}</p></div>
          </div>
        )) : <Empty text="还没有工作记录。" />}
      </div>
    </div>
  );
}

function Settings({ state, onEditProfile, onImported }: { state: State; onEditProfile: () => void; onImported: (message: string) => Promise<void> }) {
  const importFile = async (file?: File) => {
    if (!file) return;
    const payload = JSON.parse(await file.text());
    const response = await fetch("/api/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(result.error || "导入失败。");
    await onImported("备份已导入。");
  };
  const restoreBackup = async (backup: Row) => {
    if (!window.confirm(`恢复“${text(backup.reason)}”之前的状态吗？当前数据会先自动备份。`)) return;
    await api({ action: "restoreBackup", backupId: backup.id });
    await onImported("备份已恢复。");
  };
  return (
    <div className="settings-grid">
      <section className="panel setting-card">
        <span className="setting-icon">我</span>
        <h3>申请人档案</h3>
        <p>{text(state.profiles[0]?.name) || "尚未设置姓名"} · {text(state.profiles[0]?.target) || "尚未设置目标"}</p>
        <button className="button ghost" onClick={onEditProfile}>编辑档案</button>
      </section>
      <section className="panel setting-card">
        <span className="setting-icon">存</span>
        <h3>完整个人备份</h3>
        <p>包含本机的学校、教授、联系摘要、工作记录和待办。</p>
        <a className="button ghost" href="/api/export?mode=full">导出JSON备份</a>
      </section>
      <section className="panel setting-card">
        <span className="setting-icon">空</span>
        <h3>空白共享模板</h3>
        <p>不包含姓名、邮箱、回复、Gmail线程或个人附件。</p>
        <a className="button ghost" href="/api/export?mode=template">导出空白模板</a>
      </section>
      <section className="panel setting-card">
        <span className="setting-icon">入</span>
        <h3>恢复或导入</h3>
        <p>导入前会自动保留当前数据备份。</p>
        <label className="button ghost file-button">
          选择JSON文件
          <input type="file" accept="application/json" onChange={(event) => importFile(event.target.files?.[0]).catch((e) => alert(e.message))} />
        </label>
      </section>
      <section className="panel backup-list">
        <div className="panel-heading"><h3>最近自动备份</h3><span>{state.backups.length} 条</span></div>
        {state.backups.slice(0, 8).map((backup) => (
          <div className="backup-row" key={text(backup.id)}>
            <span><strong>{text(backup.reason)}</strong><time>{text(backup.created_at)}</time></span>
            <button className="text-button" onClick={() => restoreBackup(backup).catch((e) => alert(e.message))}>恢复</button>
          </div>
        ))}
        {!state.backups.length && <Empty text="第一次修改数据后会自动产生备份。" />}
      </section>
    </div>
  );
}

function EditorPanel({ editor, state, onClose, onSaved }: { editor: NonNullable<Editor>; state: State; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const form = new FormData(event.currentTarget);
      const values = Object.fromEntries(form.entries()) as Record<string, string>;
      if (editor.kind === "school") {
        const schoolId = text(editor.record?.id) || uuid();
        await api({
          action: "upsert",
          entity: "school",
          record: {
            id: schoolId,
            university: values.university,
            nature: values.nature,
            graduate_school: values.graduate_school,
            major: values.major,
            website: values.website,
            category: values.category,
            priority: values.priority,
            fit: values.fit,
            note: values.note,
            archived: 0,
          },
        });
        if (values.intake_year) {
          const existing = state.exams.find(
            (exam) => exam.school_id === schoolId && text(exam.intake_year) === values.intake_year && text(exam.round) === values.round,
          );
          const examId = text(existing?.id) || uuid();
          await api({
            action: "upsert",
            entity: "exam",
            record: {
              id: examId,
              school_id: schoolId,
              intake_year: Number(values.intake_year),
              round: values.round,
              method: values.method,
              guidelines_url: values.guidelines_url,
              application_start: values.application_start,
              application_end: values.application_end,
              exam_start: values.exam_start,
              exam_end: values.exam_end,
              written: values.written,
              oral: values.oral,
              language: values.language,
              pre_contact: values.pre_contact,
              status: values.exam_status,
              official_source: values.official_source,
              verified_at: values.verified_at,
              archived: 0,
            },
          });
          const names = values.subjects.split(/[、,，]/).map((item) => item.trim()).filter(Boolean);
          for (const name of names) {
            await api({
              action: "upsert",
              entity: "subject",
              record: {
                id: uuid(),
                exam_id: examId,
                name,
                requirement: "必考",
                mastery: "未评估",
                progress: "未开始",
                past_questions_url: "",
                reference_book: "",
                note: "",
              },
            });
          }
        }
        await onSaved("学校与考试记录已保存。");
      } else if (editor.kind === "professor") {
        await api({
          action: "upsert",
          entity: "professor",
          record: {
            id: text(editor.record?.id) || uuid(),
            university: values.university,
            graduate_school: values.graduate_school,
            lab: values.lab,
            name: values.name,
            title: values.title,
            email: values.email,
            lab_url: values.lab_url,
            research: values.research,
            fit: values.fit,
            identity: values.identity,
            system_status: values.system_status,
            language_status: values.language_status,
            priority: values.priority,
            risk: values.risk,
            gmail_thread_id: values.gmail_thread_id,
            current_status: values.current_status,
            archived: 0,
          },
        });
        await onSaved("教授档案已保存。");
      } else if (editor.kind === "contact") {
        await api({ action: "contactEvent", professorId: editor.professor.id, event: values });
        await onSaved("联系事件已加入时间线。");
      } else if (editor.kind === "work") {
        await api({ action: "workEvent", workEvent: values });
        await onSaved("工作记录已保存。");
      } else if (editor.kind === "task") {
        await api({
          action: "upsert",
          entity: "task",
          record: {
            id: uuid(),
            title: values.title,
            due_date: values.due_date,
            status: values.status,
            related_school_id: values.related_school_id,
            related_professor_id: values.related_professor_id,
            note: values.note,
          },
        });
        await onSaved("待办已保存。");
      } else if (editor.kind === "profile") {
        await api({
          action: "upsert",
          entity: "profile",
          record: {
            id: 1,
            name: values.name,
            email: values.email,
            education: values.education,
            gpa: values.gpa,
            language: values.language,
            target: values.target,
            research_topic: values.research_topic,
          },
        });
        await onSaved("申请人档案已保存。");
      }
    } catch (caught) {
      alert(caught instanceof Error ? caught.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="editor-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="editor-panel" aria-label="编辑记录">
        <div className="editor-heading">
          <div><p className="eyebrow">EDIT RECORD</p><h2>{editorTitle(editor)}</h2></div>
          <button aria-label="关闭" onClick={onClose}>×</button>
        </div>
        <form onSubmit={submit}>
          {editor.kind === "school" && <SchoolForm record={editor.record} exams={state.exams} />}
          {editor.kind === "professor" && <ProfessorForm record={editor.record} />}
          {editor.kind === "contact" && <ContactForm professor={editor.professor} />}
          {editor.kind === "work" && <WorkForm schools={state.schools} professors={state.professors} />}
          {editor.kind === "task" && <TaskForm schools={state.schools} professors={state.professors} />}
          {editor.kind === "profile" && <ProfileForm record={editor.record} />}
          <div className="form-actions">
            <button type="button" className="button ghost" onClick={onClose}>取消</button>
            <button className="button primary" disabled={saving}>{saving ? "保存中…" : "保存记录"}</button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function SchoolForm({ record, exams }: { record?: Row; exams: Row[] }) {
  const exam = exams.find((item) => item.school_id === record?.id);
  return (
    <>
      <FormSection title="学校与专攻">
        <Field label="大学" name="university" defaultValue={text(record?.university)} required />
        <Select label="性质" name="nature" defaultValue={text(record?.nature) || "国立"} options={["国立", "公立", "私立"]} />
        <Field label="研究科" name="graduate_school" defaultValue={text(record?.graduate_school)} required />
        <Field label="専攻" name="major" defaultValue={text(record?.major)} required />
        <Field label="专攻网址" name="website" defaultValue={text(record?.website)} type="url" />
        <Select label="分类" name="category" defaultValue={text(record?.category) || "主申"} options={["主申", "条件候选", "私立保底", "冲刺"]} />
        <Select label="优先级" name="priority" defaultValue={text(record?.priority) || "A"} options={["S", "A", "B", "C"]} />
        <TextArea label="适合度说明" name="fit" defaultValue={text(record?.fit)} />
        <TextArea label="备注" name="note" defaultValue={text(record?.note)} />
      </FormSection>
      <FormSection title="年度考试记录">
        <Select label="入学年度" name="intake_year" defaultValue={text(exam?.intake_year) || "2027"} options={["2027", "2028"]} />
        <Field label="选拔批次" name="round" defaultValue={text(exam?.round) || "一般選抜"} />
        <Field label="入试方式" name="method" defaultValue={text(exam?.method) || "一般入試"} />
        <Field label="募集要项" name="guidelines_url" defaultValue={text(exam?.guidelines_url)} type="url" />
        <Field label="出愿开始" name="application_start" defaultValue={text(exam?.application_start)} type="date" />
        <Field label="出愿截止" name="application_end" defaultValue={text(exam?.application_end)} type="date" />
        <Field label="考试开始" name="exam_start" defaultValue={text(exam?.exam_start)} type="date" />
        <Field label="考试结束" name="exam_end" defaultValue={text(exam?.exam_end)} type="date" />
        <TextArea label="笔试" name="written" defaultValue={text(exam?.written)} />
        <TextArea label="口试" name="oral" defaultValue={text(exam?.oral)} />
        <Field label="语言要求" name="language" defaultValue={text(exam?.language)} />
        <Field label="教授内诺" name="pre_contact" defaultValue={text(exam?.pre_contact)} />
        <Select label="状态" name="exam_status" defaultValue={text(exam?.status) || "待确认"} options={["已核实", "待确认", "2028待公布", "已结束"]} />
        <Field label="官方来源" name="official_source" defaultValue={text(exam?.official_source)} type="url" />
        <Field label="核查日期" name="verified_at" defaultValue={text(exam?.verified_at)} type="date" />
        <Field label="考试科目（逗号分隔）" name="subjects" defaultValue="" placeholder="線形代数, 微積分, アルゴリズム" />
      </FormSection>
    </>
  );
}

function ProfessorForm({ record }: { record?: Row }) {
  return (
    <FormSection title="教授与研究室">
      <Field label="大学" name="university" defaultValue={text(record?.university)} required />
      <Field label="研究科／正确身份" name="graduate_school" defaultValue={text(record?.graduate_school)} />
      <Field label="研究室" name="lab" defaultValue={text(record?.lab)} />
      <Field label="教授姓名" name="name" defaultValue={text(record?.name)} required />
      <Field label="职称" name="title" defaultValue={text(record?.title) || "教授"} />
      <Field label="官方邮箱" name="email" defaultValue={text(record?.email)} type="email" />
      <Field label="研究室主页" name="lab_url" defaultValue={text(record?.lab_url)} type="url" />
      <TextArea label="研究方向" name="research" defaultValue={text(record?.research)} />
      <TextArea label="与研究计划的联系" name="fit" defaultValue={text(record?.fit)} />
      <Field label="正确申请身份" name="identity" defaultValue={text(record?.identity)} />
      <TextArea label="研究生制度" name="system_status" defaultValue={text(record?.system_status)} />
      <Field label="语言条件" name="language_status" defaultValue={text(record?.language_status)} />
      <Select label="优先级" name="priority" defaultValue={text(record?.priority) || "B"} options={["S", "A", "B", "排除", "已联系"]} />
      <TextArea label="主要风险" name="risk" defaultValue={text(record?.risk)} />
      <Field label="Gmail线程ID" name="gmail_thread_id" defaultValue={text(record?.gmail_thread_id)} />
      <Select label="当前状态" name="current_status" defaultValue={text(record?.current_status) || "候选"} options={["候选", "草稿暂缓", "已发送", "等待回复", "条件性等待", "已回复", "排除", "不再联系"]} />
    </FormSection>
  );
}

function ContactForm({ professor }: { professor: Row }) {
  return (
    <FormSection title={`${text(professor.name)}教授的联系事件`}>
      <Select label="事件类型" name="event_type" defaultValue="教授回复" options={["首次联系", "追信", "申请人回复", "发送更新材料", "教授回复", "退信", "草稿", "暂停", "排除决定"]} />
      <Select label="方向" name="direction" defaultValue="收到" options={["发出", "收到", "草稿", "人工决定"]} />
      <Field label="日期" name="event_date" defaultValue={today()} type="date" required />
      <Field label="邮件主题" name="subject" defaultValue="" />
      <TextArea label="准确摘要" name="summary" defaultValue="" required />
      <Field label="附件" name="attachments" defaultValue="" placeholder="研究計画書.pdf；履歴書.pdf" />
      <Select label="事件后状态" name="status_after" defaultValue="等待回复" options={["已发送", "等待回复", "条件性等待", "已回复", "草稿暂缓", "排除", "不再联系"]} />
      <Field label="下一行动日期" name="next_action_date" defaultValue="" type="date" />
    </FormSection>
  );
}

function WorkForm({ schools, professors }: { schools: Row[]; professors: Row[] }) {
  return (
    <FormSection title="记录一项申请工作">
      <Select label="类型" name="event_type" defaultValue="制度核查" options={["制度核查", "材料准备", "研究计划", "考试复习", "语言考试", "其他"]} />
      <Field label="日期" name="event_date" defaultValue={today()} type="date" required />
      <Field label="标题" name="title" defaultValue="" required />
      <TextArea label="完成内容或结论" name="summary" defaultValue="" />
      <SelectRows label="关联学校" name="related_school_id" rows={schools} render={(row) => text(row.university)} />
      <SelectRows label="关联教授" name="related_professor_id" rows={professors} render={(row) => `${text(row.name)} · ${text(row.university)}`} />
    </FormSection>
  );
}

function TaskForm({ schools, professors }: { schools: Row[]; professors: Row[] }) {
  return (
    <FormSection title="添加下一行动">
      <Field label="待办内容" name="title" defaultValue="" required />
      <Field label="截止日期" name="due_date" defaultValue="" type="date" />
      <Select label="状态" name="status" defaultValue="待处理" options={["待处理", "进行中", "完成"]} />
      <SelectRows label="关联学校" name="related_school_id" rows={schools} render={(row) => text(row.university)} />
      <SelectRows label="关联教授" name="related_professor_id" rows={professors} render={(row) => `${text(row.name)} · ${text(row.university)}`} />
      <TextArea label="备注" name="note" defaultValue="" />
    </FormSection>
  );
}

function ProfileForm({ record }: { record?: Row }) {
  return (
    <FormSection title="申请人档案">
      <Field label="姓名" name="name" defaultValue={text(record?.name)} />
      <Field label="邮箱" name="email" defaultValue={text(record?.email)} type="email" />
      <TextArea label="学历与经历" name="education" defaultValue={text(record?.education)} />
      <Field label="GPA" name="gpa" defaultValue={text(record?.gpa)} />
      <TextArea label="语言成绩" name="language" defaultValue={text(record?.language)} />
      <Field label="申请目标" name="target" defaultValue={text(record?.target)} />
      <TextArea label="研究主题" name="research_topic" defaultValue={text(record?.research_topic)} />
    </FormSection>
  );
}

function editorTitle(editor: NonNullable<Editor>) {
  if (editor.kind === "school") return editor.record ? "编辑学校与考试" : "新增学校与考试";
  if (editor.kind === "professor") return editor.record ? "编辑教授档案" : "新增教授档案";
  if (editor.kind === "contact") return "添加联系事件";
  if (editor.kind === "work") return "添加工作记录";
  if (editor.kind === "task") return "添加待办";
  return "编辑申请人档案";
}

function Badge({ value }: { value: unknown }) {
  return <span className={`badge ${statusClass(value)}`}>{text(value) || "未设置"}</span>;
}

function Empty({ text: message }: { text: string }) {
  return <div className="empty"><span>○</span><p>{message}</p></div>;
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset className="form-section"><legend>{title}</legend>{children}</fieldset>;
}

function Field({ label, name, defaultValue, type = "text", required = false, placeholder = "" }: { label: string; name: string; defaultValue: string; type?: string; required?: boolean; placeholder?: string }) {
  return <label className="field"><span>{label}{required && " *"}</span><input name={name} type={type} defaultValue={defaultValue} required={required} placeholder={placeholder} /></label>;
}

function TextArea({ label, name, defaultValue, required = false }: { label: string; name: string; defaultValue: string; required?: boolean }) {
  return <label className="field full"><span>{label}{required && " *"}</span><textarea name={name} defaultValue={defaultValue} required={required} rows={3} /></label>;
}

function Select({ label, name, defaultValue, options }: { label: string; name: string; defaultValue: string; options: string[] }) {
  return <label className="field"><span>{label}</span><select name={name} defaultValue={defaultValue}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function SelectRows({ label, name, rows, render }: { label: string; name: string; rows: Row[]; render: (row: Row) => string }) {
  return <label className="field"><span>{label}</span><select name={name} defaultValue=""><option value="">不关联</option>{rows.filter(active).map((row) => <option key={text(row.id)} value={text(row.id)}>{render(row)}</option>)}</select></label>;
}
