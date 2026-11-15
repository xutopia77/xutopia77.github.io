import fs from "node:fs";
import path from "node:path";

// 笔记正文里的相对图片路径（如 assets/a.png）在构建时改写成
// /blog/<slug>/<文件名>，与旧 Hexo 站点的图片地址保持一致。
// http(s) 等远程图片（图床）不做任何处理。
// 移植自 astro-dev/src/plugins/remark-blog-images.mjs，配合
// content.config.ts 的 vault loader 使用。

const slugCache = new Map();

function readSlug(filePath) {
	if (slugCache.has(filePath)) return slugCache.get(filePath);

	let slug = "";
	try {
		const raw = fs.readFileSync(filePath, "utf8");
		const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
		if (frontmatter) {
			const block = frontmatter[1];
			const explicit = block.match(/^slug:\s*(.+)$/m);
			const permalink = block.match(/^permalink:\s*(.+)$/m);
			slug = (explicit?.[1] ?? permalink?.[1] ?? "").trim().replace(/^blog\//, "");
		}
	} catch {
		slug = "";
	}

	slugCache.set(filePath, slug);
	return slug;
}

function isLocal(url) {
	return (
		Boolean(url) &&
		!/^(?:[a-z]+:)?\/\//i.test(url) &&
		!url.startsWith("/") &&
		!url.startsWith("data:")
	);
}

export default function remarkBlogImages() {
	return (tree, file) => {
		const filePath = file.history?.[0] ?? file.path;
		if (!filePath) return;

		const slug = readSlug(filePath);
		if (!slug) return;

		const visit = (node) => {
			if (node.type === "image" && isLocal(node.url)) {
				node.url = `/blog/${slug}/${path.basename(node.url)}`;
			}
			if (Array.isArray(node.children)) node.children.forEach(visit);
		};

		visit(tree);
	};
}
