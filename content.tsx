import type { PlasmoCSConfig } from "plasmo"
import { type DisplayMode, DEFAULT_MODE } from "./types"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_end"
}

// ── State ──────────────────────────────────────────────
let floatingBtn: HTMLDivElement | null = null
let isTranslating = false

let currentMode: DisplayMode = DEFAULT_MODE
let storageListenerRegistered = false

// Original-content snapshots for replace-mode restoration (§6.1).
// WeakMap releases with the element; translations don't persist across reload.
const originalSnapshot = new WeakMap<HTMLElement, Node[]>()

const DISPLAY_MODE_KEY = "displayMode"

// ── Init ───────────────────────────────────────────────
function init() {
  if (document.getElementById("ct-floating-btn")) return
  ensureStyle()
  createFloatingButton()
  loadDisplayMode()
  registerStorageListener()
  syncButtonState()
}

// ── Display mode (storage) ─────────────────────────────
function isValidMode(v: unknown): v is DisplayMode {
  return v === "bilingual" || v === "replace"
}

async function loadDisplayMode() {
  try {
    // Read from `sync` to match options.tsx, which writes via @plasmohq/storage
    // (whose default area is "sync"). Reading `local` here would never see
    // the value and silently fall back to bilingual — the replace-mode bug.
    const { displayMode } = await chrome.storage.sync.get(DISPLAY_MODE_KEY)
    if (isValidMode(displayMode)) currentMode = displayMode
  } catch {
    // keep DEFAULT_MODE on any failure
  }
}

// Idempotent: register once even if init() runs again (SPA re-injection). (N3)
function registerStorageListener() {
  if (storageListenerRegistered) return
  storageListenerRegistered = true
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return // matches options.tsx @plasmohq/storage default
    const change = changes[DISPLAY_MODE_KEY]
    if (change && isValidMode(change.newValue)) {
      currentMode = change.newValue
    }
  })
}

// ── Injected styles ────────────────────────────────────
function ensureStyle() {
  if (document.getElementById("ct-style")) return
  const s = document.createElement("style")
  s.id = "ct-style"
  s.textContent = `
    .ct-replaced{
      border-left:3px solid #2563eb;
      background:rgba(37,99,235,0.05);
      padding-left:8px;
    }
  `
  ;(document.head || document.documentElement).appendChild(s)
}

// ── Floating Button (closed loop: translate <-> cancel) ──
function createFloatingButton() {
  floatingBtn = document.createElement("div")
  floatingBtn.id = "ct-floating-btn"
  floatingBtn.innerHTML = "译"
  floatingBtn.title = "双语翻译助手 - 点击翻译整页"

  Object.assign(floatingBtn.style, {
    position: "fixed",
    bottom: "80px",
    right: "20px",
    width: "42px",
    height: "42px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
    color: "#fff",
    fontSize: "16px",
    fontWeight: "700",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    zIndex: "2147483646",
    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
    userSelect: "none",
    transition: "transform 0.15s, box-shadow 0.15s",
    fontFamily: "system-ui, sans-serif",
    border: "2px solid rgba(255,255,255,0.3)"
  })

  floatingBtn.addEventListener("mouseenter", () => {
    if (floatingBtn) {
      floatingBtn.style.transform = "scale(1.1)"
      floatingBtn.style.boxShadow = "0 4px 14px rgba(37,99,235,0.4)"
    }
  })
  floatingBtn.addEventListener("mouseleave", () => {
    if (floatingBtn) {
      floatingBtn.style.transform = "scale(1)"
      floatingBtn.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)"
    }
  })
  floatingBtn.addEventListener("click", handleFloatingBtnClick)
  makeDraggable(floatingBtn)

  document.body.appendChild(floatingBtn)
}

function makeDraggable(el: HTMLElement) {
  let startX = 0,
    startY = 0,
    initialRight = 0,
    initialBottom = 0
  let dragging = false
  let moved = false

  el.addEventListener("mousedown", (e: MouseEvent) => {
    if ((e.target as HTMLElement).tagName === "BUTTON") return
    dragging = true
    moved = false
    startX = e.clientX
    startY = e.clientY
    const rect = el.getBoundingClientRect()
    initialRight = window.innerWidth - rect.right
    initialBottom = window.innerHeight - rect.bottom
    el.style.transition = "none"
    e.preventDefault()
  })

  document.addEventListener("mousemove", (e: MouseEvent) => {
    if (!dragging) return
    const dx = startX - e.clientX
    const dy = startY - e.clientY
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true
    const newRight = Math.max(
      0,
      Math.min(initialRight + dx, window.innerWidth - 50)
    )
    const newBottom = Math.max(
      0,
      Math.min(initialBottom + dy, window.innerHeight - 50)
    )
    el.style.right = newRight + "px"
    el.style.bottom = newBottom + "px"
  })

  document.addEventListener("mouseup", () => {
    if (dragging) {
      dragging = false
      el.style.transition = "transform 0.15s, box-shadow 0.15s"
    }
  })

  el.addEventListener("click", (e) => {
    if (moved) {
      e.stopPropagation()
      e.preventDefault()
      moved = false
    }
  })
}

// ── Floating button click: translate <-> cancel ───────
function handleFloatingBtnClick(e: MouseEvent) {
  if (isTranslating) return
  if (hasTranslations()) {
    clearAllTranslations() // cancel -> restore original
  } else {
    translatePage()
  }
}

function hasTranslations(): boolean {
  return !!document.querySelector("[data-ct-mode], .ct-translation")
}

function syncButtonState() {
  if (!floatingBtn) return
  setBtnTranslated(hasTranslations())
}

function setBtnTranslated(translated: boolean) {
  if (!floatingBtn) return
  floatingBtn.style.background = translated
    ? "linear-gradient(135deg, #9ca3af, #6b7280)"
    : "linear-gradient(135deg, #2563eb, #1d4ed8)"
  floatingBtn.title = translated
    ? "双语翻译助手 - 点击取消翻译（恢复原文）"
    : "双语翻译助手 - 点击翻译整页"
}

function setBtnBusy(busy: boolean) {
  if (!floatingBtn) return
  floatingBtn.style.opacity = busy ? "0.6" : "1"
  floatingBtn.style.pointerEvents = busy ? "none" : "auto"
}

// ── Translation logic ──────────────────────────────────
async function translatePage() {
  // Lock check first; do NOT clear while a translation is in progress. (N6)
  if (isTranslating) {
    showToast("翻译进行中，请稍候...")
    return
  }

  // Clear field so we always translate from the original text, never from
  // an existing (Chinese) translation — avoids "Chinese-to-Chinese".
  clearAllTranslations()

  const blocks = collectTextBlocks()
  if (blocks.length === 0) {
    showToast("当前页面无可翻译的文本块")
    syncButtonState()
    return
  }

  const delimiter = "\n\n---NEXT---\n\n"
  const combined = blocks.map((b) => b.text).join(delimiter)

  setBtnBusy(true)
  try {
    const translation = await doTranslate(combined, "page")
    if (translation) {
      const translatedBlocks = translation
        .split("---NEXT---")
        .map((s) => s.trim())
      blocks.forEach((block, i) => {
        if (translatedBlocks[i]) {
          if (currentMode === "replace") {
            insertReplace(block.el, translatedBlocks[i])
          } else {
            insertBilingual(block.el, translatedBlocks[i])
          }
        }
      })
      // N7: surface the 30-block cap in the completion toast to avoid "incomplete" confusion.
      if (blocks.length >= 30) {
        showToast("✅ 翻译完成（前 30 块）")
      }
    }
  } finally {
    setBtnBusy(false)
    syncButtonState()
  }
}

// Selection translate is triggered by the selection bubble (PR-B).
// Kept here so PR-B can wire it without touching the rest of this file.
async function translateSelection() {
  const selection = window.getSelection()
  if (!selection || selection.toString().trim().length === 0) {
    showToast("请先选中要翻译的文本")
    return
  }
  const text = selection.toString().trim()
  await doTranslate(text, "selection")
}

// Tags whose text content should NOT be translated:
// code/pre (would corrupt code), form/interactive controls, media, metadata, etc.
const NO_TRANSLATE_SELECTOR =
  "script,style,pre,code,kbd,samp,var,tt,button,input,select,option,optgroup," +
  "textarea,label,noscript,template,iframe,object,embed,canvas,svg,math," +
  "title,meta,link,base,head"

// Skip our own injected UI, existing translations, and already-replaced blocks.
const SELF_SELECTOR =
  '[id^="ct-"],.ct-translation,[data-ct-mode]'

// Display values considered inline (text rolls up to nearest block ancestor)
const INLINE_DISPLAYS = new Set([
  "inline",
  "inline-block",
  "inline-flex",
  "inline-grid",
  "inline-table",
  "contents",
  "run-in"
])

// Find the nearest block-level ancestor of `el`. Inline elements are skipped
// so that text inside <span>/<a>/<em> rolls up to the enclosing <p>/<li>/<td>…
function findBlockAncestor(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el
  while (node && node !== document.body.parentElement) {
    if (node === document.body) return node
    const display = window.getComputedStyle(node).display
    if (!INLINE_DISPLAYS.has(display)) return node
    node = node.parentElement
  }
  return el
}

function isHidden(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el)
  return (
    style.display === "none" ||
    style.visibility === "hidden" ||
    Number(style.opacity) === 0
  )
}

function collectTextBlocks(): { el: HTMLElement; text: string }[] {
  const blocks: { el: HTMLElement; text: string }[] = []
  const seenEl = new WeakSet<HTMLElement>() // dedupe by block element
  const seenText = new Set<string>() // dedupe by text hash

  // Walk text nodes (leaf-first), so inline text rolls up to its block ancestor.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Text) {
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      // Skip whitespace-only text nodes
      if (!node.nodeValue || node.nodeValue.trim().length === 0) {
        return NodeFilter.FILTER_REJECT
      }
      // Skip code / interactive / media / metadata tags (incl. ancestors)
      if (parent.closest(NO_TRANSLATE_SELECTOR)) return NodeFilter.FILTER_REJECT
      // Skip our own injected UI / existing translations / replaced blocks
      if (parent.closest(SELF_SELECTOR)) return NodeFilter.FILTER_REJECT
      // Skip hidden elements
      if (isHidden(parent)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    }
  })

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text
    const parent = textNode.parentElement as HTMLElement
    const block = findBlockAncestor(parent)
    if (!block || seenEl.has(block)) continue

    // innerText respects visible rendering and <br> spacing
    const text = (block.innerText || block.textContent || "").trim()
    if (text.length < 2) continue
    if (!containsEnglish(text)) continue

    const hash = text.slice(0, 80)
    if (seenText.has(hash)) continue

    seenEl.add(block)
    seenText.add(hash)
    blocks.push({ el: block, text })
  }

  // Optionally collect image alt text (decorative alts filtered by containsEnglish).
  document.body.querySelectorAll("img").forEach((img) => {
    if (blocks.length >= 30) return
    const el = img as HTMLImageElement
    const alt = (el.alt || "").trim()
    if (alt.length < 5 || !containsEnglish(alt)) return
    if (el.closest(NO_TRANSLATE_SELECTOR)) return
    if (el.closest(SELF_SELECTOR)) return
    if (isHidden(el)) return
    const hash = alt.slice(0, 80)
    if (seenText.has(hash)) return
    seenText.add(hash)
    blocks.push({ el, text: alt })
  })

  // Limit to prevent huge API calls
  return blocks.slice(0, 30)
}

function containsEnglish(text: string): boolean {
  // Check if text contains meaningful English content (at least some English chars)
  const englishChars = text.match(/[a-zA-Z]{2,}/g)
  return (englishChars?.length || 0) >= 1
}

async function doTranslate(text: string, mode: string): Promise<string | null> {
  if (isTranslating) {
    showToast("翻译进行中，请稍候...")
    return null
  }

  isTranslating = true
  showToast("🔄 正在翻译...")

  try {
    return await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "translate", text, mode },
        (response) => {
          isTranslating = false
          if (response?.error) {
            showToast("❌ " + response.error)
            resolve(null)
          } else if (response?.translation) {
            showToast("✅ 翻译完成")
            resolve(response.translation)
          } else {
            showToast("❌ 翻译失败：未收到响应")
            resolve(null)
          }
        }
      )
    })
  } catch (e: any) {
    isTranslating = false
    showToast("❌ 翻译出错: " + e.message)
    return null
  }
}

// ── Insertion: bilingual (original behavior) ─────────
function insertBilingual(originalEl: HTMLElement, translated: string) {
  if (!translated || translated.length < 2) return

  // Keep the existing "already translated" guard (N5).
  if (originalEl.nextElementSibling?.classList.contains("ct-translation")) return

  const transEl = document.createElement("div")
  transEl.className = "ct-translation"
  transEl.textContent = translated

  Object.assign(transEl.style, {
    fontSize: "0.9em",
    color: "#6b7280",
    marginTop: "4px",
    marginBottom: "8px",
    paddingLeft: "8px",
    borderLeft: "3px solid #2563eb",
    lineHeight: "1.6",
    fontStyle: "italic",
    background: "rgba(37,99,235,0.03)",
    padding: "6px 10px",
    borderRadius: "0 4px 4px 0"
  })

  originalEl.insertAdjacentElement("afterend", transEl)
}

// ── Insertion: replace original text ──────────────────
function insertReplace(el: HTMLElement, translated: string) {
  if (!translated || translated.length < 2) return
  if (el.dataset.ctMode === "replaced") return // idempotent

  // Snapshot original child nodes (cloned) for restoration; avoids re-parsing
  // innerHTML on restore (no XSS/re-exec risk). (E1)
  originalSnapshot.set(
    el,
    Array.from(el.childNodes).map((n) => n.cloneNode(true))
  )

  // Flatten inline structure (links/bold/<br> lost) — accepted v1 tradeoff. (B4)
  el.textContent = translated // textContent only, never innerHTML (E2)
  el.dataset.ctMode = "replaced"
  el.dataset.ctSource = "page"
  el.classList.add("ct-replaced")
}

// ── Restore / clear ───────────────────────────────────
function restoreReplacedBlock(el: HTMLElement) {
  const snap = originalSnapshot.get(el)
  if (!snap) {
    // Fallback: just clear markers if no snapshot present.
    delete el.dataset.ctMode
    delete el.dataset.ctSource
    el.classList.remove("ct-replaced")
    return
  }
  // Clone again so the snapshot can be reused if needed.
  el.replaceChildren(...snap.map((n) => n.cloneNode(true)))
  delete el.dataset.ctMode
  delete el.dataset.ctSource
  el.classList.remove("ct-replaced")
  originalSnapshot.delete(el)
}

function clearAllTranslations() {
  document.querySelectorAll("[data-ct-mode]").forEach((el) => {
    restoreReplacedBlock(el as HTMLElement)
  })
  document.querySelectorAll(".ct-translation").forEach((n) => n.remove())
  syncButtonState()
}

// ── Toast notification ─────────────────────────────────
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(message: string) {
  let toast = document.getElementById("ct-toast")
  if (!toast) {
    toast = document.createElement("div")
    toast.id = "ct-toast"
    Object.assign(toast.style, {
      position: "fixed",
      top: "16px",
      left: "50%",
      transform: "translateX(-50%)",
      padding: "8px 16px",
      background: "rgba(0,0,0,0.8)",
      color: "#fff",
      fontSize: "13px",
      borderRadius: "8px",
      zIndex: "2147483647",
      fontFamily: "system-ui, sans-serif",
      pointerEvents: "none",
      transition: "opacity 0.3s",
      opacity: "0"
    })
    document.body.appendChild(toast)
  }

  toast.textContent = message
  toast.style.opacity = "1"

  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    if (toast) toast.style.opacity = "0"
  }, 2000)
}

// ── Start ──────────────────────────────────────────────
init()

// This is a raw side-effect content script (no React UI), so we intentionally
// do NOT export a default component. Exporting one would make Plasmo treat
// this file as a Content Script UI (CSUI) and wrap it in a Shadow DOM host,
// which is unnecessary here and was the likely cause of the script not running.
export {}