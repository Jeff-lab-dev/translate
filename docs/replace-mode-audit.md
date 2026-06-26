# 规格书复审报告：译文显示模式 v1.1

复审对象：`docs/replace-mode-spec.md` v1.1
复审目的：核对初版审计（`docs/replace-mode-audit.md`）8 条修订是否闭环，并扫描 v1.1 引入的新问题。
严重度：🔴 阻断 · 🟠 重要 · 🟡 次要 · 🔵 提示

---

## 1. 初版审计闭环核对

| 审计项 | 状态 | 证据 |
|--------|------|------|
| B1 阻断 入口/按钮 undo 语义重叠 | ✅ 闭环 | §7.4 统一为 `clearAllTranslations`，D1 决策"都清双语块"；§7.1 入口与 §5.2 按钮共用 |
| A1 `currentMode` 默认兜底 | ✅ 闭环 | §4 `DEFAULT_MODE` + 合法性校验；T9 覆盖 |
| A2 `DisplayMode` 归属 | ✅ 闭环 | §13 `types.ts`，type-only 引入不触发 content 副作用 |
| A3 选中 replace 恢复不完整 | ✅ 闭环（延后） | §7.2 选中 replace 移至 PR-C/v2，配套独立恢复路径 |
| B3 编码/解码不成对 | ✅ 闭环（延后） | 同上，v1 不涉及 `data-ct-original` 编码 |
| B4 `textContent` 副作用未注明 | ✅ 闭环 | §7.3 列副作用清单；§2 非目标声明 |
| C1 函数职责未解耦 | ✅ 闭环 | §7.4 说明 D1 既定后单函数满足两种调用方 |
| E1 `innerHTML` 重解析/XSS | ✅ 闭环 | §6.1 改 `WeakMap` childNodes 快照；§7.4 `replaceChildren` 克隆恢复 |
| E2 译文 HTML 注入 | ✅ 闭环 | §7.3 强制 `textContent` 写译文 |
| B5 全量重译权衡未声明 | ✅ 闭环 | §2"行为声明"段 + §7.1 入口清场说明 |
| D1–D4 | ✅ 闭环 | §10 全部决策并入正文 |
| F1 恢复承诺范围 | ✅ 闭环 | §9 显式"页内块结构还原，不保证选区/滚动位置" |
| F2 `data-ct-mode` 来源区分 | ✅ 闭环 | §6.1 `data-ct-source="page"` |
| F3 30 块 UX 限制 | ✅ 闭环 | §9 建议 Toast 提示"已译前 N 块" |
| T9/T10 测试缺失 | ✅ 闭环 | §11 新增 |

初版审计全部闭环。

---

## 2. v1.1 新引入问题扫描

### N1 🟡 `originalSnapshot` WeakMap 与 `clearAllTranslations` 的查询一致性
`clearAllTranslations` 用 `document.querySelectorAll("[data-ct-mode]")` 找替换块，再 `restoreReplacedBlock` 从 `originalSnapshot.get(el)` 取快照。二者键都是元素引用，一致。但 §7.3 `insertReplace` 先写 `originalSnapshot.set` 再设 `dataset.ctMode`——顺序无影响。**一致性 OK**。仅提示：若未来有代码路径在设 `dataset.ctMode` 后又移除元素再重建，WeakMap 与 dataset 可能短暂不同步；v1 无此路径。🔵

### N2 🟡 `replaceChildren(...snap.map(n => n.cloneNode(true)))` 每次清场克隆开销
每次 `restoreReplacedBlock` 克隆整段子节点。30 块上限下可接受。但若同一元素被替换→恢复→再替换多次，`originalSnapshot` 在 `insertReplace` 重新 set 时会覆盖旧快照——但旧快照是"已恢复的原像"，与新原像相同，覆盖无害。✅ 正确。🔵 提示：可在 `restoreReplacedBlock` 末尾 `originalSnapshot.delete(el)`（规格已写）避免泄漏，OK。

### N3 🟠 `onChanged` 监听的清理与重复注册
§4 规定注册 `chrome.storage.onChanged`。内容脚本在 `document_end` 注入一次，监听注册一次，OK。但若页面 SPA 内 navigation 导致 content script 重复注入（`<all_urls>` + `document_end`，Plasmo 幂等性靠 `init()` 的 `getElementById` 守卫，**但 `onChanged` 监听无守卫**），可能重复注册监听 → `currentMode` 被多次赋值（幂等，无害）但内存泄漏。
**建议**：注册前检查标志位或用一次性守卫，与 `init()` 的幂等策略对齐。规格 §4 补一句"监听注册需幂等（与 `init()` 守卫一致）"。

### N4 🟡 `clearAllTranslations` 中 `.ct-translation` 移除范围
`document.querySelectorAll(".ct-translation")` 移除所有双语块。这些块是 `afterend` 插入的独立 div，`.remove()` 安全。但若用户手动修改过页面（极少），可能误删同 class 元素——页面用 `.ct-translation` 概率极低。可接受。🔵

### N5 🔵 `insertBilingual` 重命名带来的回归
§7.3 将现状 `insertTranslation` 重命名为 `insertBilingual`。需确保 §7.1 `bilingual` 分支调用 `insertBilingual`，且现状的"防重复插入"逻辑（`nextElementSibling.classList.contains("ct-translation")`）保留。规格未显式声明保留此防重复。**建议**：§7.3 `insertBilingual` 注明"保留现状的已译防重复检查"。低风险。

### N6 🟠 `translatePage` 入口清场与 `isTranslating` 锁的顺序
§7.1 step 1 清场在 `doTranslate`（设 `isTranslating=true`）之前还是之后？若在之后，清场发生在"翻译中"态，期间用户点"恢复原文"按钮已被禁用（§5.2），OK。但 `doTranslate` 的 `isTranslating` 检查在 `clearAllTranslations` 之前还是之后影响"翻译中再点翻译整页"行为：
- 若 `doTranslate` 先检查 `isTranslating` 拒绝 → 清场不执行（正确，不破坏进行中翻译）。
- 若清场先执行再 `doTranslate` → 进行中翻译被清场破坏。
**建议**：§7.1 明确顺序："先 `doTranslate` 入口检查 `isTranslating`（拒绝则直接 return，不清场）；通过后再清场+采集+请求"。现状 `doTranslate` 已含 `isTranslating` 检查，需规格声明清场在检查通过后。

### N7 🔵 Toast"已译前 N 块"提示与现有 Toast 时序
§9 建议提示"已译前 N 块"。现有 `showToast` 单例 2s 淡出，"翻译完成"Toast 与"已译前 N 块"Toast 会互相覆盖。低优。可在"翻译完成"文案中合并："✅ 翻译完成（前 30 块）"。🔵

### N8 🟡 `data-ct-source` 在 v1 仅 `"page"` 一种值
§6.1 设 `data-ct-source="page"`，但 v1 无其它来源（选中延后）。属前瞻标记，无害。但 `clearAllTranslations` 遍历 `[data-ct-mode]` 不区分 source，v1 正确；v2 加入选中后需按 source 分发恢复路径——规格 §7.2 已声明"v2 须独立恢复路径"。✅ 前瞻一致。

---

## 3. 复审结论

- 初版审计 15 项**全部闭环**。
- v1.1 新增 8 项扫描：**1 重要（N3 监听幂等）、1 重要（N6 清场与锁顺序）、3 次要、3 提示**，无阻断。
- 建议在进入实现前补 2 条规格微调（N3、N6），其余为实现期注意项。

## 4. 建议微调清单（spec v1.2 候选）
1. §4 补：`onChanged` 监听注册需幂等（与 `init()` 守卫一致），避免 SPA 重复注入下重复注册（N3）。
2. §7.1 补：清场在 `doTranslate` 的 `isTranslating` 检查通过之后执行；翻译中拒绝时不清场（N6）。
3. §7.3 `insertBilingual` 注明保留现状"已译防重复"检查（N5）。
4. §9/§11：将"已译前 N 块"并入"翻译完成"文案，避免 Toast 互相覆盖（N7）。

上述均为次要微调，可在 PR-A 实现时一并吸收，无需再出正式 v1.2。