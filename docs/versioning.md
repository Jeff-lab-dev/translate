# 构建版本号机制

每次构建自动注入版本号；版本递增幅度由 LLM 决定。

## 两层

### 层 1：构建元信息（给人看）
`scripts/gen-version.mjs` 在每次 `plasmo dev`/`plasmo build` 前运行，把以下值写入 `.env.local`（已 gitignore）：
- `PLASMO_PUBLIC_BUILD_VERSION` ← `package.json` 的 `version`
- `PLASMO_PUBLIC_BUILD_SHA` ← `git rev-parse --short HEAD`
- `PLASMO_PUBLIC_BUILD_DATE` ← 当天日期
- `PLASMO_PUBLIC_BUILD_TAG` ← 分支名（CI 中为 `github.ref_name`）

Plasmo 构建期把它们静态内联进 bundle；`popup.tsx` 读取 `process.env.PLASMO_PUBLIC_BUILD_*` 显示。无值时回退 `dev`，故首次 clone 未构建也能 tsc/构建。

### 层 2：版本递增（manifest.version，给 Chrome）
`scripts/bump-version.mjs` 在 CI 发版时运行：
1. 读最近的 `v*.*.*` git tag 作为基准版本（无 tag 则 bootstrap = 直接打当前 package.json 版本）。
2. 收集自该 tag 以来的提交信息 + diffstat。
3. 调 OpenAI 兼容 LLM，按改动的**性质 + 大小**判定 bump：`major`（破坏/大重构）/ `minor`（新功能/中等改动）/ `patch`（修复/chore/小改）。
4. 按判定结果 bump `package.json` 的 `version`，输出 `version`/`bump`/`skipped` 给 CI。

兜底：无 `LLM_API_KEY`、API 报错、响应无法解析 → 回退 `patch`，发版不被阻断。

## CI（`.github/workflows/release.yml`）
main push 时：
1. `checkout fetch-depth:0`（需完整历史 + tag 来 diff）。
2. `node scripts/bump-version.mjs`（带 `LLM_API_KEY` secret + `LLM_ENDPOINT`/`LLM_MODEL` vars）。
3. 提交 `package.json` + 打 tag `vX.Y.Z`（commit message 含 `[skip ci]` 防循环），push。
4. `pnpm build`（gen-version 读到已 bump 的版本）+ `pnpm package`。
5. 用 tag `vX.Y.Z` 发 Release（`makeLatest`），不再覆盖 `latest`。

## 必需的 CI 配置
- **Secret**：`LLM_API_KEY`（OpenAI 兼容 API key）。未配置则每次回退 patch。
- **Vars（可选）**：`LLM_ENDPOINT`（默认 `https://api.openai.com/v1/chat/completions`）、`LLM_MODEL`（默认 `gpt-4o-mini`）。

> 注意：这是 CI 自己的 key，与扩展运行时用户在 options 配置的 key 无关（那个在浏览器 storage，CI 取不到）。

## 本地预览 bump
```bash
LLM_API_KEY=sk-... node scripts/bump-version.mjs   # 会改写本地 package.json
# 或用环境里已有的：
pnpm bump
```
本地跑会改写 `package.json`，可用 `git checkout package.json` 还原。

## 首次启用
仓库当前无 `v*.*.*` tag。第一次 main push 会 **bootstrap**：直接打 `v1.0.0` tag 并发版，不调 LLM。之后每次 push 才走 LLM 判定。

## 命令速查
| 命令 | 作用 |
|------|------|
| `pnpm dev` | 生成构建元信息 → 热更新 |
| `pnpm build` | 生成构建元信息 → 生产构建 |
| `pnpm bump` | 本地预览 LLM bump（改写 package.json） |
| `pnpm package` | 打包 zip（不跑 gen-version） |