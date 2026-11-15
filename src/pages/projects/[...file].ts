// /projects/<slug>/<file>：项目页引用的静态资源（图片等），
// 构建时从笔记库 project-index 目录生成，与详情页同目录保证相对路径可用
import type { APIRoute } from "astro";
import { getMimeType, readProjectFile, walkProjectFiles } from "@/utils/vault-projects";

export const prerender = true;

export function getStaticPaths() {
	return walkProjectFiles().map(({ rel }) => ({
		params: { file: rel },
		props: { rel },
	}));
}

export const GET: APIRoute = ({ props }) => {
	const { rel } = props as { rel: string };
	const content = readProjectFile(rel);
	if (content === undefined) {
		return new Response("Not found", { status: 404 });
	}
	return new Response(content as BodyInit, {
		headers: { "Content-Type": getMimeType(rel) },
	});
};
