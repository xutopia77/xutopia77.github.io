import fs from "node:fs";
import path from "node:path";

// 项目页面来源：仓库内快照 content-export/projects（pnpm export:content 从笔记库导出）
// ├── index.html          → /projects/ 列表页
// └── <slug>/index.html   → /projects/<slug>/ 详情页
// 注意：dev/build 均以项目根为 cwd，页面代码会被打包进 dist，
// 不能用 import.meta.url 相对定位，须以 cwd 定位仓库内快照目录
const PROJECT_INDEX_DIR = path.resolve(process.cwd(), "content-export", "projects");

export { PROJECT_INDEX_DIR };

/** 列出所有含 index.html 的项目目录名 */
export function listProjectSlugs(): string[] {
	try {
		return fs
			.readdirSync(PROJECT_INDEX_DIR, { withFileTypes: true })
			.filter(
				(entry) =>
					entry.isDirectory() &&
					fs.existsSync(path.join(PROJECT_INDEX_DIR, entry.name, "index.html")),
			)
			.map((entry) => entry.name)
			.sort();
	} catch {
		return [];
	}
}

/** 读取项目目录下的文本文件（HTML 等，utf8；仅限 project-index 内部，防目录穿越） */
export function readProjectText(rel: string): string | undefined {
	const abs = path.resolve(PROJECT_INDEX_DIR, rel);
	if (!abs.startsWith(path.resolve(PROJECT_INDEX_DIR) + path.sep)) {
		return undefined;
	}
	try {
		return fs.readFileSync(abs, "utf8");
	} catch {
		return undefined;
	}
}

/** 读取项目目录下的二进制资源文件（图片等） */
export function readProjectFile(rel: string): Buffer | undefined {
	const abs = path.resolve(PROJECT_INDEX_DIR, rel);
	if (!abs.startsWith(path.resolve(PROJECT_INDEX_DIR) + path.sep)) {
		return undefined;
	}
	try {
		return fs.readFileSync(abs);
	} catch {
		return undefined;
	}
}

const MIME_TYPES: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	gif: "image/gif",
	webp: "image/webp",
	avif: "image/avif",
	svg: "image/svg+xml",
	mp4: "video/mp4",
	webm: "video/webm",
	pdf: "application/pdf",
	json: "application/json",
	css: "text/css",
	js: "text/javascript",
	txt: "text/plain",
};

export function getMimeType(relPath: string): string {
	const ext = path.extname(relPath).toLowerCase().slice(1);
	return MIME_TYPES[ext] ?? "application/octet-stream";
}

/** 递归列出全部资源文件；index.html 由页面路由生成，跳过避免产物冲突 */
export function walkProjectFiles(): { rel: string; abs: string }[] {
	const files: { rel: string; abs: string }[] = [];
	const walk = (dir: string) => {
		for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
			if (item.name.startsWith(".")) continue;
			const abs = path.join(dir, item.name);
			if (item.isDirectory()) {
				walk(abs);
				continue;
			}
			const rel = path
				.relative(PROJECT_INDEX_DIR, abs)
				.split(path.sep)
				.join("/");
			if (path.basename(rel).toLowerCase() === "index.html") continue;
			files.push({ rel, abs });
		}
	};
	try {
		walk(PROJECT_INDEX_DIR);
	} catch {
		// 目录不存在时返回空列表，构建不失败
	}
	return files;
}
