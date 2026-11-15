// 笔记库发布扫描（与站点构建解耦）：只被 scripts/export-content.ts 使用。
// 导出脚本把 publish: true 的文章归一化写入仓库内 content-export/posts/，
// 站点构建只读快照目录，与笔记库零耦合。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

// 项目位于 blog-dev/astro-dev/src/utils，向上四级到仓库根，再进入笔记库
export const VAULT = fileURLToPath(new URL("../../../../note", import.meta.url));

// 这些目录里的笔记即使标了 publish 也不对外发布
export const EXCLUDED_DIRS = ["00-inbox/", "40-archives/", "system/"];

export type PublishEntry = {
	slug: string;
	title: string;
	published: Date;
	updated?: Date;
	description: string;
	image: string;
	tags: string[];
	category: string;
	pinned: boolean;
	body: string;
	sourcePath: string;
};

function toText(value: unknown): string | undefined {
	if (typeof value === "string") {
		const text = value.trim();
		return text || undefined;
	}
	if (typeof value === "number") return String(value);
	return undefined;
}

function toTextList(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.map((item) => toText(item)).filter((item): item is string => Boolean(item));
	}
	const text = toText(value);
	if (!text) return [];
	return text
		.split(/[,\s]+/)
		.map((item) => item.trim())
		.filter(Boolean);
}

function toDate(value: unknown): Date | undefined {
	if (!value) return undefined;
	const date = value instanceof Date ? value : new Date(String(value));
	return Number.isNaN(date.getTime()) ? undefined : date;
}

/** 递归收集笔记库中声明了 publish 的 markdown 文件，归一化成发布所需字段 */
export function collectEntries(): PublishEntry[] {
	const entries: PublishEntry[] = [];
	let skipped = 0;
	const seenSlugs = new Set<string>();

	const walk = (dir: string) => {
		for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
			if (item.name.startsWith(".")) continue;
			const full = path.join(dir, item.name);

			if (item.isDirectory()) {
				const relDir = `${path.relative(VAULT, full).split(path.sep).join("/")}/`;
				if (EXCLUDED_DIRS.some((prefix) => relDir.startsWith(prefix))) continue;
				walk(full);
				continue;
			}
			if (!item.name.endsWith(".md")) continue;

			const raw = fs.readFileSync(full, "utf8");
			// front matter 必须紧贴文件开头，避免把正文里的分隔线误判为 front matter
			const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
			if (!match) continue;

			let parsed: unknown;
			try {
				parsed = matter(raw).data;
			} catch {
				skipped += 1;
				continue;
			}
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;

			const fields = parsed as Record<string, unknown>;
			// 只有声明了 publish 字段且为 true 的笔记才进入发布流程
			const declared = fields.publish === true || fields.publish === "true";
			if (!declared) continue;

			const permalink = toText(fields.permalink);
			const slug = toText(fields.slug) ?? permalink?.replace(/^blog\//, "");
			const published = toDate(fields.pubDate) ?? toDate(fields.date);
			const title = toText(fields.title) ?? "";

			// 声明了发布但字段不完整 → 视为不规范，本次不发布
			if (!slug || !published) {
				console.warn(`[export] 跳过字段不完整的文章：${title || "(无标题)"}`);
				skipped += 1;
				continue;
			}
			if (seenSlugs.has(slug)) {
				console.warn(`[export] 跳过 slug 重复的文章：${slug} (${title})`);
				skipped += 1;
				continue;
			}
			seenSlugs.add(slug);

			entries.push({
				slug,
				title,
				published,
				updated: toDate(fields.updatedDate) ?? toDate(fields.updated),
				description: toText(fields.description) ?? "",
				image: toText(fields.heroImage) ?? "",
				tags: toTextList(fields.tags),
				category: toText(fields.category) ?? toTextList(fields.categories)[0] ?? "",
				pinned: fields.pinned === true,
				body: raw.slice(match[0].length),
				sourcePath: full,
			});
		}
	};

	walk(VAULT);

	console.log(`[export] 扫描完成：候选 ${entries.length} 篇，跳过不规范 ${skipped} 篇`);
	return entries;
}
