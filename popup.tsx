import { useState } from "react"

// Inlined at build time from .env.local (written by scripts/gen-version.mjs).
// Fallbacks keep tsc/fresh-clone builds working when no build metadata exists.
const BUILD_VERSION = process.env.PLASMO_PUBLIC_BUILD_VERSION || "0.0.0"
const BUILD_SHA = process.env.PLASMO_PUBLIC_BUILD_SHA || "dev"
const BUILD_DATE = process.env.PLASMO_PUBLIC_BUILD_DATE || ""
const BUILD_TAG = process.env.PLASMO_PUBLIC_BUILD_TAG || ""

function PopupPage() {
  const [status, setStatus] = useState("")

  function openOptions() {
    chrome.runtime.openOptionsPage()
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.icon}>🌐</span>
        <h1 style={styles.title}>双语翻译助手</h1>
      </div>
      <p style={styles.desc}>在网页上选择英文文本，点击浮窗按钮即可翻译为中文</p>

      <div style={styles.actions}>
        <button style={styles.btn} onClick={openOptions}>
          ⚙️ 设置翻译引擎
        </button>
      </div>

      <div style={styles.footer}>
        <span style={styles.version}>
          v{BUILD_VERSION}
          {BUILD_SHA && BUILD_SHA !== "dev" ? ` · ${BUILD_SHA}` : ""}
          {BUILD_DATE ? ` · ${BUILD_DATE}` : ""}
        </span>
        <span style={styles.tip}>右下角浮窗按钮</span>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 280,
    padding: 16,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    background: "#fff"
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8
  },
  icon: {
    fontSize: 24
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    margin: 0,
    color: "#111"
  },
  desc: {
    fontSize: 13,
    color: "#666",
    lineHeight: 1.5,
    margin: "0 0 16px 0"
  },
  actions: {
    display: "flex",
    flexDirection: "column" as any,
    gap: 8
  },
  btn: {
    width: "100%",
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    color: "#fff",
    background: "#2563eb",
    border: "none",
    borderRadius: 6,
    cursor: "pointer"
  },
  footer: {
    marginTop: 14,
    paddingTop: 10,
    borderTop: "1px solid #eee",
    display: "flex",
    justifyContent: "space-between",
    fontSize: 11,
    color: "#999"
  },
  version: {},
  tip: {}
}

export default PopupPage
