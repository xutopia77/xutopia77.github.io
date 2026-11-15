// 修复以 .html 结尾的 redirect 产物：
// Astro 对 redirect 目标 /xutopia77-projects.html 生成的是目录 xutopia77-projects.html/index.html，
// 静态托管（GitHub Pages / CF Pages）请求该 URL 时找不到文件会 404。
// 构建后把这类目录转成真实文件 dist/<name>.html，meta refresh 内容不变。
import fs from "node:fs/promises";
import { glob } from "glob";
import { resolveSiteRoot } from "./site-root";

const DIST_DIR = resolveSiteRoot();

async function main() {
	const entries = await glob(`${DIST_DIR.replaceAll("\\", "/")}/**/*.html`);
	let fixed = 0;

	for (const entry of entries) {
		if (!entry.endsWith(".html")) continue;
		const stat = await fs.stat(entry).catch(() => null);
		if (!stat?.isDirectory()) continue;

		// 目录 <name>.html/ 内含 index.html（meta refresh 跳转页）
		const inner = `${entry}/index.html`;
		const redirectHtml = await fs.readFile(inner, "utf-8");
		await fs.rm(entry, { recursive: true, force: true });
		await fs.writeFile(entry, redirectHtml);
		fixed += 1;
		console.log(`   ↻ ${entry.replace(DIST_DIR, "").slice(1)} 目录 → 文件`);
	}

	if (fixed === 0) console.log("   无 .html 结尾的 redirect 目录，跳过");
	else console.log(`✅ 已修复 ${fixed} 个 redirect 目录`);
}

main();
