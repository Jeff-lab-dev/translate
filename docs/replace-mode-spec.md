# 译文显示模式规格书（v1.2）

状态：v1.2（吸收浮窗闭环 UX 决策）
变更摘要见文末 §14。

## 1. 概述

本特性新增"译文替换原文"显示模式，并将浮窗交互重构为纯"翻译 ⇄ 取消"闭环。
- 浮窗按钮：单个状态切换按钮，翻译 ⇄ 取消循环，不弹菜单。
- 选中翻译：选中文本后在选区旁弹独立"译"气泡触发，与浮窗按钮解耦。
- 设置（引擎 + 显示模式）：只在 options 页配置，不进浮窗/网页内 UI，避免破坏翻译闭环。

## 2. 目标 / 非目标

### 目标
- 全局显示模式：`bilingual`（双语对照，默认）/ `replace`（译文替换）。
- `replace` 模式整页翻译用译文替换原文，原文可恢复。
- 浮窗按钮 = 翻译 ⇄ 取消 状态机闭环。
- 选中翻译独立气泡触发，就近展示译文（只读，不改页面文本）。
- 模式切换即时生效（`onChanged`）。

### 非目标（v1 不做）
- `replace` 时保留原文内联结构（链接/加粗/`<br>`/行内图）。用 `textContent` 拍平，结构仅用于恢复。
- 选中翻译的 `replace`（把选区页面文本替换为译文，可恢复）→ PR-C/v2。
- 中途切换模式自动转换已译块。
- 突破整页 30 块上限。
- 悬停气泡、仅译未译块等其它形态。

### 行为声明
- **"翻译整页"为全量刷新语义**：浮窗按钮从"已译"点回"未译"= 取消（恢复原文）；从"未译"点到"已译"= 先清场再全量采集翻译。已译块会被重新请求翻译（额外 API、译文可能略变），有意为之以防状态不一致。
- **浮窗按钮状态由 DOM 实时推导**：`document.querySelector('[data-ct-mode], .ct-translation')` 是否存在决定已译/未译，避免 SPA 内导航后状态错乱。

## 3. 模式定义

| 模式值 | 名称 | 整页翻译行为 | 选中翻译行为 |
|--------|------|--------------|--------------|
| `bilingual` | 双语对照（默认） | 译文插在原文 `afterend` | 选区气泡就近只读展示译文 |
| `replace` | 译文替换 | 用译文替换原文文本，原文暂存可恢复 | 选区气泡就近只读展示译文（与模式无关） |

> 选中翻译的气泡输出与 `displayMode` 无关：始终只读就近展示，不改页面文本。`replace` 选区改写见 PR-C/v2。

默认值：`bilingual`。

## 4. 存储与配置

- storage key：`displayMode`，值域 `"bilingual" | "replace"`，与 `llmSettings` 解耦，扩展级跨标签页一致。
- 内容脚本：
  - `const DEFAULT_MODE: DisplayMode = "bilingual"`；`let currentMode: DisplayMode = DEFAULT_MODE`。
  - 启动读 `displayMode`：合法则采用，否则保持 `DEFAULT_MODE`。
  - 注册 `chrome.storage.onChanged`：`displayMode` 变化时按合法性校验更新 `currentMode`。
  - **监听注册需幂等**（与 `init()` 的 `getElementById` 守卫一致），防 SPA 重复注入下重复注册（复审 N3）。

## 5. UI 入口

### 5.1 选项页（options.tsx）
- 新增"显示模式"区块，单选：○ 双语对照 / ○ 译文替换，保存写入 `displayMode`。
- 设置的唯一入口；浮窗与内容脚本 UI 内**禁止**任何设置/配置入口（闭环保全）。

### 5.2 浮窗按钮（content.tsx，重构）
- 单个圆形按钮，**无菜单**。`id="ct-floating-btn"`，可拖拽（沿用现状）。
- 状态机（三态）：
  - **未译 `idle`**：蓝色渐变（现状配色）。点击 → `translatePage()`。
  - **翻译中 `translating`**：按钮显示转圈（或降低不透明度），禁用点击，忽略重复触发。`isTranslating` 锁驱动。
  - **已译 `translated`**：变色（蓝 → 灰，仅颜色变化，不改文字"译"，决策 Q2）。点击 → `clearAllTranslations()`（取消，恢复原文）。
- 状态来源：每次操作前后调 `syncButtonState()`：
  ```
  syncButtonState():
    has = !!document.querySelector('[data-ct-mode], .ct-translation')
    setBtnClass(has ? 'ct-translated' : 'ct-idle')
  ```
  在 `init()`、`translatePage` 成功/失败后、`clearAllTranslations` 后调用。
- 翻译中禁用由 `isTranslating` 控制（不复用 DOM 推导，因为翻译中 DOM 还没有译文块）。
- 移除现状 mini-panel（`#ct-mini-panel`）及其三行菜单（翻译整页/翻译选中/打开设置）。整页翻译改由浮窗按钮承担，选中翻译改由选区气泡承担，设置改由 popup→options 承担。

### 5.3 选区气泡（content.tsx，新增）
- 触发：用户选中文本且选区含英文（`containsEnglish`）时，在选区附近显示小"译"气泡 `#ct-selection-bubble`。
- 事件：`mouseup` 后（节流）检查 `window.getSelection()`；`selectionchange` 仅作辅助，避免高频抖动。
- 定位：`range.getBoundingClientRect()` 取选区矩形，气泡 fixed 定位于其右下角，贴边翻转防溢出。
- 交互：
  - 点击气泡 → `translateSelection()`：请求翻译，气泡内容从"译"切为转圈；成功后气泡内就近渲染译文（只读，多行可滚动，最大宽高受限）。
  - 失败：气泡内显示错误文案（红字），不弹 Toast。
  - 关闭：选区清空 / 点击气泡外 / 新选区 / 页面 scroll（v1 简单：scroll 时隐藏）。
- 排除：选区落在 `ct-*` 自身元素内时不弹气泡。
- 气泡 z-index 极高（同浮窗），`ct-` 前缀防冲突。
- 不写 `data-ct-mode`、不改页面文本、不进 `clearAllTranslations` 范围。

## 6. DOM 数据模型与原像存储

### 6.1 替换块标记（仅整页 `replace`）
- `el.dataset.ctMode = "replaced"`；`el.dataset.ctSource = "page"`；`el.classList.add("ct-replaced")`。
- 原像：模块级 `WeakMap<Element, Node[]>` `originalSnapshot`，存 `Array.from(el.childNodes).map(n => n.cloneNode(true))`。不用 `dataset.ctOriginal`+`innerHTML`（消除重解析/注入，E1）。

### 6.2 双语块
`bilingual` 插入的 `.ct-translation`（`afterend`），不带 `data-ct-mode`。

### 6.3 视觉提示（D3）
`ct-replaced`：左 3px 蓝条 + `rgba(37,99,235,0.05)` 浅底，与双语块视觉一致。

### 6.4 浮窗已译态样式
`ct-floating-btn.ct-translated`：背景改灰（如 `linear-gradient(135deg,#9ca3af,#6b7280)`），仅颜色，文字仍"译"。

## 7. 行为规格

### 7.1 整页翻译 `translatePage()`
1. 入口 `doTranslate` 先检查 `isTranslating`：进行中则 Toast 拒绝并 return，**不清场**（复审 N6）。通过后：
2. `clearAllTranslations()`（清场：恢复 `[data-ct-mode]` 原像 + 移除 `.ct-translation`）。
3. `collectTextBlocks()` 采集**原文 el**（清场后已恢复）的可见英文块（上限 30）。显式声明采集对象始终是原文 el，不是译文（B2）。
4. `---NEXT---` 拼接批量请求（同现状）。
5. 按 `currentMode` 分发：`bilingual`→`insertBilingual`；`replace`→`insertReplace`。
6. 成功后 `syncButtonState()`（→ `translated`）；失败后 `syncButtonState()`（→ `idle`，因清场后无译文）。

### 7.2 选中翻译 `translateSelection()`（v1 = 气泡只读展示）
- 由选区气泡点击触发（不再由浮窗按钮触发）。
- 取 `window.getSelection()` 文本，`doTranslate(text, "selection")`。
- 成功：在气泡内渲染译文（只读）；失败：气泡内显示错误文案。
- **不写 DOM、不写 `data-ct-mode`、不进 `clearAllTranslations`**。
- 选中 `replace`（改写选区页面文本 + 可恢复）→ PR-C/v2，须配套独立恢复路径（`span.replaceWith(textNode(original))`），不复用页内块恢复逻辑。

### 7.3 插入函数

```
insertBilingual(el, translated):
  // 沿用现状 insertTranslation：afterend 插 .ct-translation
  // 保留现状"已译防重复"检查（nextElementSibling.classList.contains('ct-translation')）—复审 N5
  // 不写 data-ct-mode / originalSnapshot

insertReplace(el, translated):
  if el.dataset.ctMode === "replaced": return          // 幂等
  if translated.length < 2: return
  originalSnapshot.set(el, Array.from(el.childNodes).map(n => n.cloneNode(true)))
  el.textContent = translated                           // 强制 textContent（E2）
  el.dataset.ctMode = "replaced"
  el.dataset.ctSource = "page"
  el.classList.add("ct-replaced")
```

`el.textContent = translated` 副作用（B4）：块内链接/强调/`<br>`/行内图全部丢失，仅留纯译文。v1 接受（见 §2）。

### 7.4 恢复与清场

```
restoreReplacedBlock(el):
  snap = originalSnapshot.get(el)
  if (!snap) { delete el.dataset.ctMode; el.classList.remove("ct-replaced"); return }
  el.replaceChildren(...snap.map(n => n.cloneNode(true)))
  delete el.dataset.ctMode; delete el.dataset.ctSource
  el.classList.remove("ct-replaced"); originalSnapshot.delete(el)

clearAllTranslations():
  document.querySelectorAll("[data-ct-mode]").forEach(restoreReplacedBlock)
  document.querySelectorAll(".ct-translation").forEach(n => n.remove())
  syncButtonState()
```

D1 决策：同时清替换块 + 双语块。浮窗"已译→点击"与"翻译整页入口清场"共用此函数，语义一致="回到未译"。

### 7.5 模式切换的已译块
切换 `displayMode` 不自动转换/不清场。换形态：点浮窗按钮取消（`clearAllTranslations`）后再译。

## 8. 错误处理
- LLM 失败/未配 Key：整页翻译 Toast 报错，不清场不改 DOM；选中翻译气泡内显示错误文案。
- `clearAllTranslations` 容错：缺快照仅清标记。
- 翻译中（`isTranslating`）：浮窗按钮禁用；选区气泡点击同样拒绝重复（共享 `isTranslating` 或气泡内独立 `busy` 态）。

## 9. 边界与约束
- 采集黑名单含 `ct-*` 自身元素与 `.ct-translation`，不二次采集。
- `replace` 后 `innerText` 为译文 → 靠 §7.1 入口清场保障重译从原文出发。
- `originalSnapshot` WeakMap 随元素 GC 释放；译文不跨刷新持久化。
- 30 块上限不变。`replace` 模式仅替换前 30 块，其余保持英文；建议"翻译完成"Toast 文案并入"（前 30 块）"避免误判（N7）。
- 选区气泡：仅纯文本选区；选区跨多节点/含控件时取 `range.toString()`，不保留跨节点结构。
- 恢复承诺（F1）：页内块结构还原（childNodes 快照）；不保证选区/滚动位置还原。

## 10. 待决策项状态（v1.2 已决）

| 项 | 决策 | 落点 |
|----|------|------|
| D1 清除双语块 | 是，`clearAllTranslations` 同时清替换+双语 | §7.4 |
| D2 选中 `replace` 纳入 v1 | 否，延后 PR-C/v2 | §7.2 |
| D3 `ct-replaced` 视觉提示 | 是，左蓝条+浅底 | §6.3 |
| D4 无译文时按钮禁用 | **作废**：按钮恒可点（未译→译 / 已译→取消） | §5.2 |
| Q1 选中触发方式 | 选区旁独立气泡，与浮窗解耦 | §5.3 |
| Q2 已译态视觉 | 仅变色（蓝→灰），文字仍"译" | §5.2/§6.4 |
| Q3 翻译中态 | 转圈 + 禁用点击 | §5.2 |
| Q4 displayMode 配置入口 | 仅 options 页 | §5.1 |

## 11. 测试要点
- T1：`replace` 整页后原文被替换，`data-ct-mode=replaced`、`data-ct-source=page`、`ct-replaced` 存在。
- T2：浮窗"已译"态点取消 → 原结构还原、标记/快照清除、双语块移除、按钮回蓝。
- T3：`replace` 下再次点浮窗翻译：先清场再重译，无"中译中"；断言 `data-ct-mode` 存在、`textContent` 含中文、不含 `---NEXT---`。
- T4：`bilingual` 行为与现状一致（回归）。
- T5：options 切 `displayMode` 后已开页面无需刷新即生效。
- T6：浮窗按钮无设置入口；设置仅 popup→options。
- T7：未配 Key 报错且 DOM 不变、不清场。
- T8：选中英文 → 选区旁出现气泡 → 点击 → 气泡内显示译文；选区清空/外部点击气泡消失。
- T9：首装/`displayMode` 非法值 → `currentMode` 回退 `bilingual`。
- T10：翻译中（`isTranslating`）浮窗禁用、忽略重复点击；选中气泡重复点击被拒。
- T11：浮窗已译态按钮变灰；取消后回蓝。

## 12. 实现拆分
- **PR-A**：`types.ts`（`DisplayMode`/`DEFAULT_MODE`）+ `displayMode` 存储 + options 单选 + content 读取/`onChanged` + `insertBilingual`/`insertReplace` + `originalSnapshot` + `restoreReplacedBlock`/`clearAllTranslations` + `translatePage` 入口清场 + 浮窗状态机（移除 mini-panel，按钮闭环）。整页翻译闭环可用。
- **PR-B**：选区气泡（触发 + 定位 + 就近只读展示 + 关闭逻辑）。
- **PR-C（可选/v2）**：选中 `replace`（改写选区文本 + 独立恢复路径）。
- **PR-D（可选/v2）**：替换保留内联结构。

## 13. 文件改动清单
| 文件 | 改动 |
|------|------|
| `types.ts`（新建） | `export type DisplayMode = "bilingual" \| "replace"`；`export const DEFAULT_MODE` |
| `content.tsx` | `currentMode`+`onChanged`（幂等）；移除 `#ct-mini-panel` 及其逻辑；浮窗按钮状态机 + `syncButtonState` + `ct-translated` 样式；`insertBilingual`/`insertReplace`；`originalSnapshot`/`restoreReplacedBlock`/`clearAllTranslations`；`translatePage` 入口清场；新增选区气泡（PR-B） |
| `options.tsx` | 显示模式单选 + 保存 `displayMode` |
| `popup.tsx` | 不改（已是设置入口） |
| `background.ts` | 不改 |

类型归属（A2）：`DisplayMode` 放 `types.ts`，content 与 options `import type` 引入（type-only，无副作用，不触发 content 的 `init()`）。不碰 `LLMSettings` 既有重复。

## 14. v1.2 变更摘要（相对 v1.1）
1. §1/§5：浮窗重构为单按钮"翻译 ⇄ 取消"闭环，移除 mini-panel 及设置/翻译选中入口；设置仅 options。
2. §5.2 浮窗按钮三态机（idle/translating/translated），状态由 DOM 推导 `syncButtonState`；已译态仅变色（Q2）；翻译中转圈禁用（Q3）。
3. §5.3 新增选区气泡（Q1）：独立触发、就近只读展示译文、不写 DOM、不进清场范围。
4. §3/§7.2 选中翻译输出改为气泡只读展示（与 `displayMode` 无关）；选中 `replace` 仍 PR-C/v2。
5. §10 D4 作废（按钮恒可点）；新增 Q1–Q4 决策。
6. §11 补 T8/T11；T6 改为"浮窗无设置入口"。
7. §12 PR 拆分：PR-A 含浮窗闭环（含移除 mini-panel），PR-B 独立做选区气泡。
8. §13 `popup.tsx` 不改（已是设置入口），`content.tsx` 改动含 mini-panel 移除。
9. 吸收复审微调：N3 监听幂等（§4）、N6 清场在锁检查后（§7.1）、N5 防重复检查（§7.3）、N7 Toast 文案合并（§9）。