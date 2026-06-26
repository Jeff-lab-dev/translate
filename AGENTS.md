# AGENTS.md

本文件是给 AI 编码代理（含我自己）的行为约束。每条都会影响后续动作，无空话。

## 项目结构

- Plasmo v0.90.5 Chrome MV3 扩展，React 18 + TS 5.5，pnpm 11，Node 22。
- 入口文件固定语义，不要乱改名/乱挪：
  - `background.ts` — Service Worker：LLM 调用 + `chrome.runtime.onMessage`（避开页面 CSP）。
  - `content.tsx` — 内容脚本：注入浮窗 UI、采集文本、发翻译请求、插入译文。`matches: <all_urls>`，`run_at: document_end`。浮窗为单按钮"翻译⇄取消"闭环（无菜单）；设置不进浮窗。
  - `options.tsx` — 设置页（LLM 引擎 + 显示模式）。
  - `popup.tsx` — 工具栏弹窗（仅说明 + 跳设置）。
  - `types.ts` — 跨入口共享类型（type-only 引入，禁止带副作用）。
  - `docs/` — 规格书与审计（`replace-mode-spec.md` / `replace-mode-audit.md`）。
  - `scripts/check-secrets.sh` — pre-push 密钥扫描脚本。
  - `.github/workflows/` — `release.yml`（main 推送自动构建发版）、`security-scan.yml`（PR/push 跑 gitleaks）。
- 构建产物：`build/chrome-mv3-prod`（生产，真实浏览器加载这个）、`build/chrome-mv3-dev`（开发）。均被 gitignore，禁止提交。

## 运行命令

```bash
pnpm install              # 装依赖（frozen-lockfile 在 CI；本地可省）
pnpm dev                  # 开发热更新 → build/chrome-mv3-dev
pnpm build                # 生产构建 → build/chrome-mv3-prod
pnpm package               # 打包 → build/chrome-mv3-prod.zip
npx tsc --noEmit           # 类型检查（改完代码先跑）
```

真实浏览器验证：`chrome://extensions` → 开发者模式 → 加载 `build/chrome-mv3-prod` → 改了代码必须点扩展卡片 ↻ 刷新，否则跑的是旧构建。

## 测试命令

- **无自动化测试框架**（未装 jest/vitest）。不要臆造 `pnpm test`。
- 验证手段：
  1. `npx tsc --noEmit` 通过。
  2. `pnpm build` 通过。
  3. 真实 Chrome 加载 `build/chrome-mv3-prod` 手测（headless 不可信：不注入未打包扩展内容脚本，且沙箱常拦截本地 HTTP）。
- 新增功能前先在 `docs/` 写规格 + 审计，再实现（见既有 `replace-mode-*` 范式）。

## 代码风格（来自 `.prettierrc.mjs`，强制）

- 无分号 `semi: false`；双引号 `singleQuote: false`；无尾逗号 `trailingComma: none`。
- `printWidth: 80`，`tabWidth: 2`，空格缩进，`bracketSameLine: true`。
- import 顺序由 `@ianvs/prettier-plugin-sort-imports` 强制：内置 → 第三方 → 空行 → `@plasmo/*` → 空行 → `@plasmohq/*` → 空行 → `~*` → 空行 → `./`、`../`。不要手写乱序 import。
- 配置对象 `export const config: PlasmoCSConfig` 必须在每个内容脚本顶部。

## 禁止事项

1. **禁止给 `content.tsx` 导出默认 React 组件**（`export default function ... { return null }`）。这会触发 Plasmo CSUI 模式，注入 Shadow DOM host + renderer，导致插件不工作。纯副作用内容脚本用 `export {}` 保模块语义即可。（本仓库曾因此 bug 全站不工作，已修。）
2. **禁止在内容脚本里直接 `fetch` 调 LLM**。页面 CSP 会拦。统一经 `chrome.runtime.sendMessage({type:"translate",...})` 转发 background。
3. **禁止硬编码密钥/Token**（`sk-...`、`ghp_...`、私钥、`api_key=` 赋值等）。pre-push 的 `scripts/check-secrets.sh` 与 CI gitleaks 都会拦截推送。
4. **禁止绕过 pre-push 钩子**（`--no-verify`）。要改扫描规则就改 `scripts/check-secrets.sh` / `.gitleaks.toml`，不要禁用。
5. **禁止提交** `build/`、`.plasmo/`、`*.tsbuildinfo`、`node_modules/`（已在 `.gitignore`）。`tsconfig.tsbuildinfo` 之类缓存别进版本库。
6. **禁止跨入口 import 带副作用的模块**。例如 `options.tsx` 不得 `import` `content.tsx`——会执行 `init()` 往 options 页注入浮窗。共享类型放 `types.ts`，且用 `import type`。
7. **禁止新增 `permissions` / `host_permissions`** 除非确有必要。现状：`storage`、`activeTab`、`<all_urls>`。
8. **禁止在 background `onMessage` 异步分支漏 `return true`**。不返回 true 消息通道提前关闭，content 拿到 undefined 响应。
9. **禁止依赖 headless Chrome 复现内容脚本行为**做结论。它在本环境不注入未打包扩展内容脚本。
10. **禁止在内容脚本/浮窗 UI 内放设置或配置入口**（包括 `displayMode` 切换、"打开设置"按钮）。浮窗只做"翻译⇄取消"闭环，设置只走 popup→options，避免破坏翻译闭环。已移除原 mini-panel 的三行菜单。
11. **禁止给浮窗加菜单/多入口**。浮窗是单状态按钮：未译点=翻译、已译点=取消（`clearAllTranslations`）。选中翻译用独立选区气泡触发，不复用浮窗按钮。

## 完成标准（一个改动算完成需全部满足）

1. `npx tsc --noEmit` 零错误。
2. `pnpm build` 成功，且 `manifest.json` 的 `content_scripts.js` 指向实际存在的产物文件。
3. pre-push 安全扫描通过（本机 `bash scripts/check-secrets.sh` 无报错）。
4. 构建产物中能 grep 到新逻辑（防止"改了源码但没进 bundle"的假完成）。
5. 真实 Chrome 加载 `build/chrome-mv3-prod` 手测关键路径通过（浮窗出现 / 翻译链路 / 设置保存）。
6. 若改了行为，更新对应 `docs/` 规格书并标注变更摘要。
7. 提交到特性分支（非 main），开 PR，base = main。

## Review 标准（自检与审 PR 用同一份）

- [ ] 构建健康：`tsc --noEmit` + `pnpm build` 通过。
- [ ] 无密钥泄漏（`scripts/check-secrets.sh` + gitleaks 通过）。
- [ ] Plasmo 模式正确：内容脚本无默认 React 导出；配置对象在顶部；CSUI 仅用于真正需要 Shadow DOM UI 的场景。
- [ ] 消息协议正确：`onMessage` 异步分支 `return true`；content 用回调取 `sendResponse`；未处理 type 不返回 true。
- [ ] 设置读取带 `DEFAULT_*` 合并兜底（参考 `getSettings` 的 `{...DEFAULT, ...JSON.parse(stored)}`）。
- [ ] DOM 注入：`ct-` 前缀防冲突、极高 z-index、`init()` 有 `getElementById` 幂等守卫。浮窗为单按钮闭环，无菜单、无设置入口。
- [ ] 选中翻译走独立选区气泡，与浮窗按钮解耦；不改页面文本（v1 只读展示）。
- [ ] 翻译请求经 background，不经 content 直 fetch。
- [ ] 类型不跨入口重复定义；共享类型在 `types.ts` 且 `import type`。
- [ ] 未提交 gitignore 产物（`build/`、`.plasmo/`、`*.tsbuildinfo`）。
- [ ] commit message 清晰（`type(scope): ...`），PR 描述含改动/验证/待验证项。
- [ ] 真实浏览器手测结果写在 PR（本沙箱 headless 结论不算数）。