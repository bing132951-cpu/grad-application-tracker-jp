import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("application source exposes the core record views", async () => {
  const [page, layout, app, api, schema] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/tracker-app.tsx", root), "utf8"),
    readFile(new URL("app/api/state/route.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
  ]);

  assert.match(page, /TrackerApp/);
  assert.match(layout, /大学院申请记录看板/);
  for (const label of ["申请总览", "学校与入试", "教授与套磁", "工作记录", "设置与数据"]) {
    assert.match(app, new RegExp(label));
  }
  assert.match(app, /完整联系时间线/);
  assert.match(app, /显示历史\/排除/);
  assert.match(app, /恢复旧备份|restoreBackup/);
  assert.match(app, /未连接邮箱/);
  assert.match(app, /替代入学路线/);
  assert.match(app, /完整联系时间线/);
  assert.match(app, /feed-day/);
  assert.match(api, /isUniversityClosure/);
  assert.match(api, /isFirst \? 14 : 30/);
  assert.match(schema, /application_routes/);
});

test("public example is an empty privacy-safe template", async () => {
  const template = JSON.parse(await readFile(new URL("examples/template.json", root), "utf8"));
  assert.equal(template.format, "grad-application-tracker-jp");
  for (const rows of Object.values(template.data)) assert.deepEqual(rows, []);
  const serialized = JSON.stringify(template);
  assert.doesNotMatch(serialized, /@gmail|gmail_thread|WEI|魏/);
});
