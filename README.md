# xutopia.top 个人博客

基于 [Firefly](https://github.com/CuteLeaf/Firefly) 主题深度定制的 Astro 博客（原 Firefly README 见 [README-firefly.md](./README-firefly.md)）。

- 线上地址：<https://xutopia.top>
- 源码自包含：构建与部署不依赖任何外部内容仓库

## 核心机制：内容快照

博客内容来自笔记库（Obsidian vault）的**导出快照**，本仓库不包含原始笔记：

```
笔记库（publish: true） --npm run export:content--> content-export/ --git push--> 部署
```

- `content-export/posts/` — 发布的文章（front matter 已归一化为 Firefly 原生格式）
- `content-export/about.md` — 关于页
- `content-export/projects/` — 项目列表页与各项目详情（HTML + 图片）

笔记的增删改只发生在笔记库；本仓库永远只持有「要发布的那部分」。

## 发布流程

```powershell
# 1. 在笔记库中标 publish: true（front matter 需要 slug + pubDate）
# 2. 导出内容快照
npm run export:content

# 3. 提交并推送
git add -A
git commit -m "publish: <文章说明>"
git push origin master    # 本地备份
git push github master    # 触发 GitHub Pages 自动部署
```

push 到 GitHub 后 Actions 里的 `deploy.yml` 自动构建并发布，无需手动操作。

## 本地开发

```powershell
pnpm install              # 安装依赖（仅此一步必须用 pnpm，Node >= 22，pnpm >= 11）
npm run export:content    # 首次或笔记变更后导出快照
npm run dev               # 开发服务器 http://localhost:4321
npm run build             # 完整构建（含字体子集化、redirect 修复、内联脚本压缩、pagefind 索引）
npm run preview           # 预览构建产物
```

注意：搜索索引（Pagefind）只在构建后生成，`npm run dev` 下搜索不可用。

## 日常改动通常碰这些位置

| 想改什么 | 位置 |
|---|---|
| 站名、副标题、域名 | `src/config/siteConfig.ts` |
| 头像、昵称、社交链接 | `src/config/profileConfig.ts` |
| 导航栏菜单 | `src/config/navBarConfig.ts` |
| 文章样式/布局组件 | `src/components/`、`src/layouts/` |
| favicon / logo / 头像图片 | `public/favicon/`、`src/assets/images/` |
| 内容导出逻辑 | `scripts/export-content.ts`、`src/utils/vault-scan.ts` |

## 部署

- 平台：GitHub Pages（Settings → Pages → Source: GitHub Actions）
- 域名：`xutopia.top`（Cloudflare 管理解析，灰云 CNAME 指向 `xutopia77.github.io`；仓库 `public/CNAME` 文件绑定域名）
- 工作流：`.github/workflows/deploy.yml`（push master 触发）、`biome.yml`（格式检查）

## 构建产物说明

`npm run build` 的完整链条：

1. `generate-github-card-data.ts` / `generate-lqips.ts` / `generate-vndb-covers.ts` — 预生成数据与图片占位
2. `astro build --force` — 静态站点构建
3. `subset-fonts.ts` — 字体子集化
4. `fix-html-redirects.ts` — 修复 `.html` 结尾 redirect 的产物形态（Astro 会生成目录导致托管 404）
5. `minify-inline-scripts.ts` — 压缩内联脚本
6. `run-pagefind.ts` — 生成搜索索引
