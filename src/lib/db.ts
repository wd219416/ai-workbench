import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { isSensitiveKey, encField, decField } from "./crypto-field";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "workbench.db");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export function uploadDir() {
  ensureDirs();
  return UPLOAD_DIR;
}

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(pw, salt, 32).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash));
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS business_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_line_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS content_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_line_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS spec_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_line_id INTEGER NOT NULL,
  channel_id INTEGER,
  name TEXT NOT NULL,
  width INTEGER, height INTEGER,
  unit TEXT NOT NULL DEFAULT 'px',
  dpi INTEGER, color_mode TEXT, bleed TEXT, note TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS prompt_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_line_id INTEGER NOT NULL,
  content_type_id INTEGER,
  name TEXT NOT NULL,
  template TEXT NOT NULL,
  template_en TEXT NOT NULL DEFAULT '',
  negative TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_line_id INTEGER NOT NULL,
  sku TEXT, name TEXT NOT NULL,
  wood TEXT, size TEXT, style TEXT, price TEXT,
  selling_points TEXT, note TEXT
);
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  industry TEXT,
  vi TEXT NOT NULL DEFAULT '{}',
  contacts TEXT, note TEXT
);
CREATE TABLE IF NOT EXISTS copy_lib (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_line_id INTEGER NOT NULL,
  channel_id INTEGER,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT
);
CREATE TABLE IF NOT EXISTS brand_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_line_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  note TEXT
);
CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  business_line_id INTEGER,
  channel_id INTEGER,
  content_type_id INTEGER,
  prompt_cn TEXT, prompt_en TEXT,
  engine TEXT,
  file_path TEXT,
  width INTEGER, height INTEGER,
  status TEXT NOT NULL DEFAULT 'done',
  meta TEXT NOT NULL DEFAULT '{}',
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  engine TEXT NOT NULL,
  engine_task_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  input TEXT NOT NULL DEFAULT '{}',
  output TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS publish_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER,
  platform TEXT, title TEXT, content TEXT,
  scheduled_at TEXT, status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS service_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER, kind TEXT, content TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS engine_pricing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  engine TEXT NOT NULL,
  model TEXT NOT NULL,
  unit_price REAL NOT NULL,
  unit TEXT NOT NULL,
  discount_pct REAL NOT NULL DEFAULT 0,
  discount_until TEXT,
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(engine, model)
);
`;

const DEFAULT_SETTINGS: Record<string, string> = {
  deepseek_key: "",
  deepseek_base: "https://api.deepseek.com",
  deepseek_model: "deepseek-chat",
  qwen_key: "",
  qwen_base: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  qwen_vl_model: "qwen-vl-max",
  wanxiang_key: "",
  wanxiang_model: "wanx2.1-t2i-turbo",
  jimeng_key: "",
  jimeng_base: "https://ark.cn-beijing.volces.com/api/v3",
  jimeng_model: "doubao-seedream-4-0-250828",
  lovart_ak: "",
  lovart_sk: "",
  lovart_base: "https://lgw.lovart.ai",
  lovart_path: "/v1/openapi",
  lovart_project_id: "",
  kling_ak: "",
  kling_sk: "",
  kling_base: "https://api-beijing.klingai.com",
  vidu_key: "",
  vidu_base: "https://api.vidu.cn",
  vidu_model: "viduq3-pro",
  vidu_resolution: "720p",
  comfyui_local_url: "http://127.0.0.1:8188",
  comfyui_cloud_url: "",
  comfyui_workflow: "",
  default_image_engine: "lovart",
  default_video_engine: "kling",
  default_llm: "deepseek",
  jimeng_web_url: "https://jimeng.jianying.com",
};

function seed(db: DatabaseSync) {
  const has = db.prepare("SELECT COUNT(*) c FROM users").get() as { c: number };
  if (has.c > 0) return;

  db.prepare("INSERT INTO users(username,password_hash,role) VALUES(?,?,?)").run(
    "admin", hashPassword("admin123"), "admin"
  );
  const setStmt = db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)");
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) setStmt.run(k, v);

  const bl = db.prepare("INSERT INTO business_lines(code,name,sort) VALUES(?,?,?)");
  bl.run("ecom", "木盆电商", 1);
  bl.run("ad", "广告设计", 2);

  const ch = db.prepare("INSERT INTO channels(business_line_id,code,name,sort) VALUES(?,?,?,?)");
  // 木盆电商渠道
  const ecomChannels = ["淘宝", "抖店", "拼多多", "视频号", "小红书"];
  ecomChannels.forEach((n, i) => ch.run(1, `ecom_${i + 1}`, n, i + 1));
  // 广告设计三大项
  const adChannels = ["展厅全案设计", "投标应标效果图", "标识物设计生产安装"];
  adChannels.forEach((n, i) => ch.run(2, `ad_${i + 1}`, n, i + 1));

  const ct = db.prepare("INSERT INTO content_types(business_line_id,code,name,sort) VALUES(?,?,?,?)");
  const ecomTypes = ["白底图", "场景图", "细节特写", "尺寸标注图", "SKU组合图", "材质对比图", "包装发货图", "人景使用图", "种草图", "买家秀风图"];
  ecomTypes.forEach((n, i) => ct.run(1, `ec_${i + 1}`, n, i + 1));
  const adTypes = ["展厅整体效果图", "展厅分区效果图", "形象墙效果图", "应标效果图", "标识实景合成图", "工艺拆解示意图", "材质氛围参考图", "漫游展示短片"];
  adTypes.forEach((n, i) => ct.run(2, `ad_${i + 1}`, n, i + 1));

  const sp = db.prepare("INSERT INTO spec_presets(business_line_id,channel_id,name,width,height,unit,dpi,color_mode,bleed,note,sort) VALUES(?,?,?,?,?,?,?,?,?,?,?)");
  // 电商规格
  sp.run(1, 1, "淘宝主图", 800, 800, "px", 72, "RGB", "", "首图白底或场景", 1);
  sp.run(1, 1, "淘宝详情页", 750, 0, "px", 72, "RGB", "", "长图切片", 2);
  sp.run(1, 2, "抖店主图", 800, 800, "px", 72, "RGB", "", "", 1);
  sp.run(1, 2, "短视频封面", 1080, 1920, "px", 72, "RGB", "", "9:16", 2);
  sp.run(1, 3, "拼多多主图", 800, 800, "px", 72, "RGB", "", "另有750x352轮播", 1);
  sp.run(1, 4, "视频号封面", 1080, 1260, "px", 72, "RGB", "", "", 1);
  sp.run(1, 5, "小红书竖图", 1242, 1656, "px", 72, "RGB", "", "3:4", 1);
  // 广告规格
  sp.run(2, 6, "提案效果图(横)", 1920, 1080, "px", 96, "RGB", "", "汇报/投屏", 1);
  sp.run(2, 6, "提案效果图(大图)", 3840, 2160, "px", 96, "RGB", "", "高清版", 2);
  sp.run(2, 7, "标书插图A4", 2480, 3508, "px", 300, "CMYK", "3mm", "印刷级", 1);
  sp.run(2, 8, "标识效果图(实景合成)", 1920, 1080, "px", 96, "RGB", "", "按现场照片比例", 1);
  sp.run(2, 8, "易拉宝", 800, 2000, "mm", 150, "CMYK", "3mm", "印刷", 2);

  const pt = db.prepare("INSERT INTO prompt_templates(business_line_id,content_type_id,name,template,template_en,negative,sort) VALUES(?,?,?,?,?,?,?)");
  pt.run(1, 2, "木盆场景图-阳台",
    "{{product}}，实木花盆摆放在现代简约阳台，搭配绿植与鹅卵石，自然光，温暖家居氛围，电商产品摄影，高清细节",
    "{{product_en}}, solid wood planter on a modern minimalist balcony, with green plants and pebbles, natural light, warm home atmosphere, e-commerce product photography, high detail, 8k",
    "模糊, 变形, 水印, 文字, 低质量, 塑料质感", 1);
  pt.run(1, 1, "木盆白底图",
    "{{product}}，纯白背景，电商标准白底图，柔和打光，产品居中，木纹清晰可见，专业产品摄影",
    "{{product_en}}, pure white background, standard e-commerce product shot, soft studio lighting, centered composition, visible wood grain, professional product photography, 8k",
    "阴影过重, 背景杂色, 水印, 文字, 模糊", 2);
  pt.run(1, 9, "小红书种草图",
    "{{product}}，ins风家居一角，实木花盆与绿植，午后阳光斜照，生活气息，小红书种草风格，浅景深",
    "{{product_en}}, cozy home corner in ins style, solid wood planter with green plants, afternoon sunlight, lifestyle vibe, xiaohongshu aesthetic, shallow depth of field",
    "杂乱, 水印, 文字, 低质量", 3);
  pt.run(2, 11, "展厅整体效果图",
    "现代{{hall_type}}展厅室内设计，整体鸟瞰视角，{{theme}}主题，展墙展柜灯光氛围，企业展厅效果图，建筑摄影级画质",
    "Modern {{hall_type_en}} exhibition hall interior design, aerial perspective, {{theme_en}} theme, display walls and cabinets with ambient lighting, corporate showroom rendering, architectural photography quality, 8k",
    "扭曲透视, 模糊, 水印, 文字", 1);
  pt.run(2, 14, "应标效果图",
    "{{requirement}}，标识牌实景效果图，安装于建筑外立面/室内空间，真实材质质感，不锈钢与亚克力发光字，应标方案效果图，写实渲染",
    "{{requirement_en}}, signage in-situ rendering, mounted on building facade / interior space, realistic material texture, stainless steel and acrylic illuminated letters, bid proposal rendering, photorealistic",
    "变形, 卡通, 水印, 文字错误", 2);
  pt.run(2, 15, "标识实景合成",
    "将{{sign_type}}标识合成到实景照片中，透视匹配，光影一致，材质真实，现场安装效果预览",
    "Composite {{sign_type_en}} signage into the real site photo, perspective matched, consistent lighting and shadow, realistic material, installation preview",
    "透视错误, 光影不一致, 模糊", 3);

  const pr = db.prepare("INSERT INTO products(business_line_id,sku,name,wood,size,style,price,selling_points) VALUES(?,?,?,?,?,?,?,?)");
  pr.run(1, "MP-TH-30", "碳化木方形花盆", "碳化木", "30x30x30cm", "方形", "¥89", "防腐耐用,木纹自然,带托盘");
  pr.run(1, "MP-SM-40D", "松木圆形花盆带支架", "松木", "直径40cm", "圆形+铁艺支架", "¥129", "ins风,透气沥水,支架稳固");
  pr.run(1, "MP-SH-60T", "杉木长条花箱", "杉木", "60x25x25cm", "长条形", "¥109", "阳台种菜种花两用,加厚板材");

  const ba = db.prepare("INSERT INTO brand_assets(business_line_id,kind,name,content,note) VALUES(?,?,?,?,?)");
  ba.run(1, "品牌风格", "典致木工坊", "自然、实木质感、温暖家居", "电商主品牌");
  ba.run(1, "品牌色", "主色", "#8B5E34 原木棕 / #3E5C3A 绿植绿", "");
  ba.run(2, "品牌风格", "典致广告", "专业、工程感、可落地", "广告业务");

  const cp = db.prepare("INSERT INTO copy_lib(business_line_id,channel_id,title,content,tags) VALUES(?,?,?,?,?)");
  cp.run(1, 5, "小红书种草话术", "阳台改造｜这个实木花盆真的绝，原木纹理越看越喜欢，配龟背竹直接出片", "种草,阳台");
  cp.run(1, 1, "淘宝详情卖点", "整木裁切·高温碳化处理·防腐防裂·室内外通用·带沥水孔", "卖点");
}

let _db: DatabaseSync | null = null;

/** 增量模板：按名字查缺补漏，每次启动都会补齐（不影响已有数据） */
const EXTRA_TEMPLATES: [number, number, string, string, string, string, number][] = [
  [1, 3, "细节特写-木纹",
    "{{product}}局部特写，微距镜头下的实木纹理与碳化质感，边缘倒角工艺清晰，浅景深，电商细节图",
    "Close-up of {{product_en}}, macro shot of solid wood grain and carbonized texture, crisp chamfered edges, shallow depth of field, e-commerce detail shot, 8k",
    "模糊, 噪点, 水印, 文字, 变形", 4],
  [1, 5, "SKU组合陈列图",
    "{{product}}全家桶组合陈列，大中小尺寸一字排开，纯白或浅灰背景，统一打光，电商SKU套装主图",
    "{{product_en}} full set lineup, multiple sizes arranged in a row, pure white or light gray background, consistent studio lighting, e-commerce SKU bundle shot",
    "透视错乱, 阴影不一, 水印, 文字", 5],
  [1, 8, "人景使用图-浇花",
    "人物在阳台用{{product}}浇花的生活场景，手部出镜自然，阳光绿植环绕，真实使用氛围，电商人景图",
    "Person watering plants in {{product_en}} on a balcony, hands naturally in frame, sunlight and greenery, authentic lifestyle scene, e-commerce in-use photography",
    "手部畸形, 脸部特写, 水印, 文字", 6],
  [1, 2, "节日促销氛围图",
    "{{product}}节日主题场景图，{{festival}}氛围布置，暖色调促销海报风，留白区域适合加文案，电商活动图",
    "{{product_en}} festival themed scene, {{festival_en}} decorations, warm promotional poster style, negative space for copy, e-commerce campaign visual",
    "杂乱, 水印, 文字, 低质量", 7],
  [2, 12, "展厅分区效果图",
    "{{hall_type}}展厅{{zone}}分区效果图，人视角，{{theme}}主题，展陈动线清晰，灯光层次分明，室内设计渲染",
    "{{hall_type_en}} exhibition hall {{zone_en}} zone rendering, eye-level view, {{theme_en}} theme, clear visitor flow, layered lighting, interior design rendering, 8k",
    "扭曲透视, 模糊, 水印, 文字", 4],
  [2, 13, "形象墙效果图",
    "企业形象墙设计效果图，{{material}}材质，发光字logo墙，前台背景，灯光洗墙效果，写实渲染",
    "Corporate feature wall design rendering, {{material_en}} material, illuminated logo lettering, reception backdrop, wall-washer lighting, photorealistic",
    "变形, 文字错误, 水印, 卡通", 5],
  [2, 16, "工艺拆解示意图",
    "{{sign_type}}标识物工艺拆解示意图，爆炸图分层展示面板/字壳/灯带/安装件，标注清晰，工业设计说明图",
    "Exploded view diagram of {{sign_type_en}} signage, layered breakdown of panel / letter shell / LED strip / mounting parts, clear callouts, industrial design illustration",
    "结构错误, 模糊, 水印", 6],
  [2, 14, "应标效果图-夜景",
    "{{requirement}}，标识牌夜景实景效果图，发光字夜间点亮效果，建筑立面灯光氛围，应标方案夜景版，写实渲染",
    "{{requirement_en}}, signage night-scene in-situ rendering, illuminated letters lit at night, building facade lighting ambience, bid proposal night version, photorealistic",
    "过曝, 变形, 水印, 文字错误", 7],
];

function ensureExtraTemplates(db: DatabaseSync) {
  const find = db.prepare("SELECT id FROM prompt_templates WHERE name=?");
  const ins = db.prepare("INSERT INTO prompt_templates(business_line_id,content_type_id,name,template,template_en,negative,sort) VALUES(?,?,?,?,?,?,?)");
  for (const t of EXTRA_TEMPLATES) {
    if (!find.get(t[2])) ins.run(...t);
  }
}

/** 价格表种子（公开价仅供参考，可在 /pricing 管理页修改；折扣字段手填） */
const PRICING_SEED: [string, string, number, string, string][] = [
  // [engine, model, unit_price, unit, note]
  ["kling", "kling-v2", 0.14, "张", "可灵图像·v2"],
  ["kling", "kling-v2-master", 0.7, "秒", "可灵视频·v2-master（×时长）"],
  ["wanxiang", "wanx2.1-t2i-turbo", 0.2, "张", "通义万相 2.1 快速"],
  ["wanxiang", "wanx2.1-t2i-plus", 0.3, "张", "通义万相 2.1 高质量"],
  ["wanxiang", "wanx2.0-t2i-turbo", 0.16, "张", "通义万相 2.0 快速"],
  ["jimeng", "doubao-seedream-4-0-250828", 0.06, "张", "即梦 Seedream 4.0"],
  ["jimeng", "doubao-seedream-4-5-250911", 0.08, "张", "即梦 Seedream 4.5"],
  ["jimeng", "doubao-seedream-5-0-lite", 0.05, "张", "即梦 Seedream 5.0 lite"],
  ["jimeng", "doubao-seedream-5-0-pro", 0.1, "张", "即梦 Seedream 5.0 pro 旗舰"],
  ["vidu", "viduq3-pro", 1.0, "秒", "Vidu Q3 Pro（×时长）"],
  ["vidu", "viduq3-turbo", 0.5, "秒", "Vidu Q3 Turbo（×时长）"],
  ["deepseek", "deepseek-chat", 2, "百万token", "DeepSeek Chat 输出价；输入约¥1/百万"],
  ["deepseek", "deepseek-reasoner", 16, "百万token", "DeepSeek R1 输出价；输入约¥4/百万"],
  ["lovart", "default", 0.1, "credit", "LOVART 按 credit；价格请以控制台为准"],
];

function ensurePricing(db: DatabaseSync) {
  const ins = db.prepare("INSERT OR IGNORE INTO engine_pricing(engine,model,unit_price,unit,note) VALUES(?,?,?,?,?)");
  for (const p of PRICING_SEED) ins.run(...p);
}

export function getDb(): DatabaseSync {
  const g = globalThis as unknown as { __wb_db?: DatabaseSync };
  if (g.__wb_db) return g.__wb_db;
  ensureDirs();
  _db = new DatabaseSync(DB_PATH);
  _db.exec("PRAGMA journal_mode = WAL;");
  _db.exec(SCHEMA);
  // 增量迁移：publish_plans 关联生成的视频任务
  try { _db.exec("ALTER TABLE publish_plans ADD COLUMN task_id INTEGER"); } catch { /* 已存在 */ }
  // 增量迁移：客服记录增加 AI 回复草稿与处理状态
  try { _db.exec("ALTER TABLE service_records ADD COLUMN reply TEXT"); } catch { /* 已存在 */ }
  try { _db.exec("ALTER TABLE service_records ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'"); } catch { /* 已存在 */ }
  // 可灵新系统域名迁移（api.klingai.com → api-beijing.klingai.com）
  try { _db.prepare("UPDATE settings SET value='https://api-beijing.klingai.com' WHERE key='kling_base' AND value='https://api.klingai.com'").run(); } catch { /* 忽略 */ }
  // LOVART 官方 Agent OpenAPI 地址迁移（api.lovart.ai → lgw.lovart.ai，路径 → /v1/openapi）
  try { _db.prepare("UPDATE settings SET value='https://lgw.lovart.ai' WHERE key='lovart_base' AND value='https://api.lovart.ai'").run(); } catch { /* 忽略 */ }
  try { _db.prepare("UPDATE settings SET value='/v1/openapi' WHERE key='lovart_path' AND value='/v1/images/generations'").run(); } catch { /* 忽略 */ }
  // 增量迁移：把存量明文敏感 KEY（API KEY 类）加密入库
  try {
    const rows = _db.prepare("SELECT key,value FROM settings").all() as { key: string; value: string }[];
    for (const r of rows) {
      if (isSensitiveKey(r.key) && r.value && !r.value.startsWith("enc:")) {
        _db.prepare("UPDATE settings SET value=? WHERE key=?").run(encField(r.value), r.key);
      }
    }
  } catch { /* 忽略 */ }
  // 增量迁移：tasks 增加用量记账字段
  try { _db.exec("ALTER TABLE tasks ADD COLUMN usage TEXT"); } catch { /* 已存在 */ }
  try { _db.exec("ALTER TABLE tasks ADD COLUMN cost REAL"); } catch { /* 已存在 */ }
  seed(_db);
  ensureExtraTemplates(_db);
  ensurePricing(_db);
  g.__wb_db = _db;
  return _db;
}

export function all<T = Record<string, unknown>>(sql: string, ...args: unknown[]): T[] {
  return getDb().prepare(sql).all(...(args as never[])) as T[];
}
export function get<T = Record<string, unknown>>(sql: string, ...args: unknown[]): T | undefined {
  return getDb().prepare(sql).get(...(args as never[])) as T | undefined;
}
export function run(sql: string, ...args: unknown[]) {
  return getDb().prepare(sql).run(...(args as never[]));
}

export function getSetting(key: string): string {
  const row = get<{ value: string }>("SELECT value FROM settings WHERE key=?", key);
  const v = row?.value ?? "";
  return isSensitiveKey(key) ? decField(v) : v;
}
export function setSetting(key: string, value: string) {
  const v = isSensitiveKey(key) ? encField(value) : value;
  run("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, v);
}
export function allSettings(): Record<string, string> {
  const rows = all<{ key: string; value: string }>("SELECT key,value FROM settings");
  return Object.fromEntries(rows.map((r) => [r.key, isSensitiveKey(r.key) ? decField(r.value) : r.value]));
}

export function getMeta() {
  const lines = all("SELECT * FROM business_lines ORDER BY sort");
  const channels = all("SELECT * FROM channels ORDER BY sort");
  const types = all("SELECT * FROM content_types ORDER BY sort");
  const specs = all("SELECT * FROM spec_presets ORDER BY sort");
  const templates = all("SELECT * FROM prompt_templates ORDER BY sort");
  const products = all("SELECT * FROM products");
  return { lines, channels, types, specs, templates, products };
}

