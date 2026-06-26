# 构建版本号机制

每次构建自动在插件里显示版本印记；版本号本身由开发代理（按 `AGENTS.md` 规则）在改动时 bump。

## 层 1：构建期版本印记（自动）
`scripts/gen-version.mjs` 在每次 `plasmo dev`/`plasmo build` 前运行，把以下值写入 `.env.local`（已 gitignore）：
- `PLASMO_PUBLIC_BUILD_VERSION` ← `package.json` 的 `version`
- `PLASMO_PUBLIC_BUILD_SHA` ← `git rev-parse --short HEAD`
- `PLASMO_PUBLIC_BUILD_DATE` ← 当天日期
- `PLASMO_PUBLIC_BUILD_TAG` ← 分支名（CI 中为 `github.ref_name`）

Plasmo 构建期把它们静态内联进 bundle；`popup.tsx` 读取 `process.env.PLASMO_PUBLIC_BUILD_*` 显示。无值时回退 `dev`，故首次 clone 未构建也能 tsc/构建。

## 层 2：版本号递增（代理驱动）
不在 CI 调 LLM。版本递增由**开发代理**在每次改动时按 `AGENTS.md` 的规则自行决定并写进 `package.json`：

| 改动 | bump |
|------|------|
| 破坏性变更、大重构、移除功能 | major（X.0.0） |
| 新功能、新 UI、中等非破坏性改动 | minor（X.Y.0） |
| 修复、chore、文档、配置、无行为变化的重构 | patch（X.Y.Z） |

代理在同一 PR 内提交 version bump。Plasmo 自动把 `package.json.version` 同步到 `manifest.version`。

## CI（`.github/workflows/release.yml`）
main push 时：
1. `jq -r .version package.json` 读版本号。
2. `pnpm build`（gen-version 写入构建印记）+ `pnpm package`。
3. 用 tag `vX.Y.Z` 发 Release，`makeLatest`，`allowUpdates`（同版本重跑则更新而非失败）。

CI 不改版本号、不调 LLM、不需要 secret。版本号完全由仓库内的 `package.json` 决定。

## 命令速查
| 命令 | 作用 |
|------|------|
| `pnpm dev` | 生成构建印记 → 热更新 |
| `pnpm build` | 生成构建印记 → 生产构建 |
| `pnpm package` | 打包 zip（不跑 gen-version） |