import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_end"
}

// ── Types ──────────────────────────────────────────────
interface LLMSettings {
  apiEndpoint: string
  apiKey: string
  model: string
  systemPrompt: string
  maxTokens: number
  temperature: number
}

// ── State ──────────────────────────────────────────────
let floatingBtn: HTMLDivElement | null = null
let miniPanel: HTMLDivElement | null = null
let isTranslating = false

// ── Init ───────────────────────────────────────────────
function init() {
  if (document.getElementById("ct-floating-btn")) return
  createFloatingButton()
  createMiniPanel()
  setupClickOutside()
}

// ── Floating Button ────────────────────────────────────
function createFloatingButton() {
  floatingBtn = document.createElement("div")
  floatingBtn.id = "ct-floating-btn"
  floatingBtn.innerHTML = "译"
  floatingBtn.title = "双语翻译助手 - 选中文本后点击翻译"

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

// ── Mini Panel ─────────────────────────────────────────
function createMiniPanel() {
  miniPanel = document.createElement("div")
  miniPanel.id = "ct-mini-panel"
  miniPanel.style.display = "none"

  Object.assign(miniPanel.style, {
    position: "fixed",
    bottom: "130px",
    right: "20px",
    width: "200px",
    background: "#fff",
    borderRadius: "12px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
    zIndex: "2147483645",
    overflow: "hidden",
    fontFamily: "system-ui, sans-serif"
  })

  miniPanel.innerHTML = `
    <div style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:13px;font-weight:600;color:#333">
      🌐 双语翻译助手
    </div>
    <button id="ct-translate-page" style="
      width:100%;padding:10px 16px;border:none;background:none;
      font-size:13px;color:#374151;cursor:pointer;text-align:left;
      display:flex;align-items:center;gap:8px;
    ">📄 翻译整个页面</button>
    <button id="ct-translate-selection" style="
      width:100%;padding:10px 16px;border:none;background:none;
      font-size:13px;color:#374151;cursor:pointer;text-align:left;
      display:flex;align-items:center;gap:8px;
    ">✂️ 翻译选中文本</button>
    <div style="border-top:1px solid #f0f0f0"></div>
    <button id="ct-open-settings" style="
      width:100%;padding:10px 16px;border:none;background:none;
      font-size:13px;color:#6b7280;cursor:pointer;text-align:left;
      display:flex;align-items:center;gap:8px;
    ">⚙️ 打开设置</button>
  `

  document.body.appendChild(miniPanel)

  miniPanel
    .querySelector("#ct-translate-page")!
    .addEventListener("click", () => {
      hideMiniPanel()
      translatePage()
    })
  miniPanel
    .querySelector("#ct-translate-selection")!
    .addEventListener("click", () => {
      hideMiniPanel()
      translateSelection()
    })
  miniPanel
    .querySelector("#ct-open-settings")!
    .addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "openOptions" })
      hideMiniPanel()
    })
}

function toggleMiniPanel() {
  if (!miniPanel) return
  if (miniPanel.style.display === "none") {
    miniPanel.style.display = "block"
  } else {
    hideMiniPanel()
  }
}

function hideMiniPanel() {
  if (miniPanel) miniPanel.style.display = "none"
}

function setupClickOutside() {
  document.addEventListener("click", (e: MouseEvent) => {
    if (!miniPanel || miniPanel.style.display === "none") return
    const target = e.target as HTMLElement
    if (
      !miniPanel.contains(target) &&
      target.id !== "ct-floating-btn" &&
      !floatingBtn?.contains(target)
    ) {
      hideMiniPanel()
    }
  })
}

// ── Click handler ──────────────────────────────────────
function handleFloatingBtnClick(e: MouseEvent) {
  const selection = window.getSelection()
  if (selection && selection.toString().trim().length > 0) {
    translateSelection()
  } else {
    toggleMiniPanel()
  }
}

// ── Translation logic ──────────────────────────────────
async function translateSelection() {
  const selection = window.getSelection()
  if (!selection || selection.toString().trim().length === 0) {
    showToast("请先选中要翻译的文本")
    return
  }
  const text = selection.toString().trim()
  await doTranslate(text, "selection")
}

async function translatePage() {
  // Collect all visible text blocks from the page
  const blocks = collectTextBlocks()
  if (blocks.length === 0) {
    showToast("当前页面无可翻译的文本块")
    return
  }

  // Join with a delimiter for batch translation
  const delimiter = "\n\n---NEXT---\n\n"
  const combined = blocks.map((b) => b.text).join(delimiter)

  const translation = await doTranslate(combined, "page")

  if (translation) {
    // Split back and insert translations
    const translatedBlocks = translation.split("---NEXT---").map((s) => s.trim())
    blocks.forEach((block, i) => {
      if (translatedBlocks[i]) {
        insertTranslation(block.el, translatedBlocks[i])
      }
    })
  }
}

// Tags whose text content should NOT be translated:
// code/pre (would corrupt code), form/interactive controls, media, metadata, etc.
const NO_TRANSLATE_SELECTOR =
  "script,style,pre,code,kbd,samp,var,tt,button,input,select,option,optgroup," +
  "textarea,label,noscript,template,iframe,object,embed,canvas,svg,math," +
  "title,meta,link,base,head"

// Our own injected UI elements
const SELF_SELECTOR = '[id^="ct-"],#ct-floating-btn,#ct-mini-panel,.ct-translation'

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
      // Skip our own injected UI / existing translations
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

async function doTranslate(
  text: string,
  mode: string
): Promise<string | null> {
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

function insertTranslation(originalEl: HTMLElement, translated: string) {
  if (!translated || translated.length < 2) return

  // Check if already translated
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

