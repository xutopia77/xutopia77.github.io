// 内容导出：笔记库 → 仓库内快照 content-export/（入库推 GitHub）
// 站点构建只消费快照，与笔记库零耦合；笔记变更后运行 pnpm export:content 重新导出
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { collectEntries } from "../src/utils/vault-scan";

const ROOT = process.cwd();
// 笔记库：cwd（astro-dev 根）向上两级到仓库根
const VAULT = path.join(ROOT, "..", "..", "note");
const EXPORT_DIR = path.join(ROOT, "content-export");
const POSTS_DIR = path.join(EXPORT_DIR, "posts");
const PROJECTS_DIR = path.join(VAULT, "10-projects", "project-index");

// 快照目录整体重建，保证与笔记库一致（删除的文章不会残留）
fs.rmSync(EXPORT_DIR, { recursive: true, force: true });
fs.mkdirSync(POSTS_DIR, { recursive: true });

function formatDate(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// ── 1. 文章快照：归一化后的 Firefly 原生 front matter ──────────
const entries = collectEntries();
for (const entry of entries) {
	const frontMatter: Record<string, unknown> = {
		title: entry.title,
		published: formatDate(entry.published),
		description: entry.description,
		tags: entry.tags,
		category: entry.category,
	};
	if (entry.updated) frontMatter.updated = formatDate(entry.updated);
	if (entry.image) frontMatter.image = entry.image;
	if (entry.pinned) frontMatter.pinned = true;

	const md = matter.stringify(entry.body.trimStart(), frontMatter);
	fs.writeFileSync(path.join(POSTS_DIR, `${entry.slug}.md`), md, "utf8");
}
console.log(`[export] 文章快照 ${entries.length} 篇 → content-export/posts/`);

// ── 2. 关于页快照 ──────────────────────────────────────────────
const aboutSrc = path.join(VAULT, "10-projects", "12-blog-dev", "about.md");
if (fs.existsSync(aboutSrc)) {
	fs.copyFileSync(aboutSrc, path.join(EXPORT_DIR, "about.md"));
	console.log("[export] about.md 已导出");
} else {
	console.warn(`[export] 警告：找不到 about.md：${aboutSrc}`);
}

// ── 3. 项目页快照（列表 + 各项目 HTML + 图片） ─────────────────
if (fs.existsSync(PROJECTS_DIR)) {
	fs.cpSync(PROJECTS_DIR, path.join(EXPORT_DIR, "projects"), {
		recursive: true,
		filter: (src) => !path.basename(src).startsWith("."),
	});
	console.log("[export] project-index 已导出 → content-export/projects/");
} else {
	console.warn(`[export] 警告：找不到 project-index：${PROJECTS_DIR}`);
}

console.log("[export] 完成");
