import { useEffect, useState } from "react"
import { Storage } from "@plasmohq/storage"
import { type DisplayMode, DEFAULT_MODE } from "./types"

const storage = new Storage()
const DISPLAY_MODE_KEY = "displayMode"

interface LLMSettings {
  apiEndpoint: string
  apiKey: string
  model: string
  systemPrompt: string
  maxTokens: number
  temperature: number
}

const DEFAULT_SETTINGS: LLMSettings = {
  apiEndpoint: "https://api.openai.com/v1/chat/completions",
  apiKey: "",
  model: "gpt-4o-mini",
  systemPrompt:
    "You are a professional translator. Translate the following English text to Chinese. Keep the translation accurate, natural, and fluent. Preserve the original meaning and tone. For technical terms, use standard Chinese translations. Return ONLY the translated text, no explanations.",
  maxTokens: 4096,
  temperature: 0.3
}

function OptionsPage() {
  const [settings, setSettings] = useState<LLMSettings>(DEFAULT_SETTINGS)
  const [displayMode, setDisplayMode] = useState<DisplayMode>(DEFAULT_MODE)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState("")

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    const stored = await storage.get("llmSettings")
    if (stored) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) })
      } catch {
        setSettings(DEFAULT_SETTINGS)
      }
    }
    const storedMode = await storage.get(DISPLAY_MODE_KEY)
    if (storedMode === "bilingual" || storedMode === "replace") {
      setDisplayMode(storedMode)
    } else {
      setDisplayMode(DEFAULT_MODE)
    }
  }

  async function handleSave() {
    await storage.set("llmSettings", JSON.stringify(settings))
    await storage.set(DISPLAY_MODE_KEY, displayMode)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleTest() {
    setTesting(true)
    setTestResult("")
    try {
      const { apiEndpoint, apiKey, model } = settings
      if (!apiKey) {
        setTestResult("❌ 请先填写 API Key")
        setTesting(false)
        return
      }

      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "user", content: "Translate to Chinese: Hello world" }
          ],
          max_tokens: 100,
          temperature: 0
        })
      })

      if (!response.ok) {
        const errText = await response.text()
        setTestResult(`❌ 连接失败 (${response.status}): ${errText.slice(0, 200)}`)
      } else {
        const data = await response.json()
        const content =
          data.choices?.[0]?.message?.content ||
          data.response ||
          data.content ||
          ""
        setTestResult(`✅ 连接成功！测试翻译: ${content}`)
      }
    } catch (e: any) {
      setTestResult(`❌ 网络错误: ${e.message}`)
    }
    setTesting(false)
  }

  const update = (key: keyof LLMSettings) => (e: any) =>
    setSettings((s) => ({ ...s, [key]: e.target.value }))

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>⚙️ 翻译引擎设置</h1>
        <p style={styles.subtitle}>配置你的自定义 LLM 翻译后端</p>

        <div style={styles.field}>
          <label style={styles.label}>API 端点 (Endpoint)</label>
          <input
            style={styles.input}
            type="text"
            value={settings.apiEndpoint}
            onChange={update("apiEndpoint")}
            placeholder="https://api.openai.com/v1/chat/completions"
          />
          <span style={styles.hint}>兼容 OpenAI 格式的 API 地址</span>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>API Key</label>
          <input
            style={{ ...styles.input, fontFamily: "monospace" }}
            type="password"
            value={settings.apiKey}
            onChange={update("apiKey")}
            placeholder="sk-..."
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>模型名称 (Model)</label>
          <input
            style={styles.input}
            type="text"
            value={settings.model}
            onChange={update("model")}
            placeholder="gpt-4o-mini"
          />
        </div>

        <div style={styles.row}>
          <div style={{ ...styles.field, flex: 1 }}>
            <label style={styles.label}>Max Tokens</label>
            <input
              style={styles.input}
              type="number"
              value={settings.maxTokens}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  maxTokens: parseInt(e.target.value) || 4096
                }))
              }
            />
          </div>
          <div style={{ ...styles.field, flex: 1, marginLeft: 12 }}>
            <label style={styles.label}>Temperature</label>
            <input
              style={styles.input}
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={settings.temperature}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  temperature: parseFloat(e.target.value) || 0.3
                }))
              }
            />
          </div>
        </div>

        <div style={styles.field}>
          <label style={styles.label}>System Prompt</label>
          <textarea
            style={{ ...styles.input, minHeight: 80, resize: "vertical" }}
            value={settings.systemPrompt}
            onChange={update("systemPrompt")}
            rows={3}
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>显示模式</label>
          <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 14,
                cursor: "pointer",
                color: "#374151"
              }}>
              <input
                type="radio"
                name="displayMode"
                checked={displayMode === "bilingual"}
                onChange={() => setDisplayMode("bilingual")}
              />
              双语对照（译文在原文下方）
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 14,
                cursor: "pointer",
                color: "#374151"
              }}>
              <input
                type="radio"
                name="displayMode"
                checked={displayMode === "replace"}
                onChange={() => setDisplayMode("replace")}
              />
              译文替换（用译文替换原文，可恢复）
            </label>
          </div>
        </div>

        <div style={styles.actions}>
          <button style={styles.btnPrimary} onClick={handleSave}>
            {saved ? "✅ 已保存" : "💾 保存设置"}
          </button>
          <button
            style={{
              ...styles.btnSecondary,
              opacity: testing ? 0.6 : 1
            }}
            onClick={handleTest}
            disabled={testing}>
            {testing ? "⏳ 测试中..." : "🔌 测试连接"}
          </button>
        </div>

        {testResult && (
          <div
            style={{
              ...styles.testResult,
              background: testResult.startsWith("✅") ? "#ecfdf5" : "#fef2f2",
              color: testResult.startsWith("✅") ? "#065f46" : "#991b1b"
            }}>
            {testResult}
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    background: "#f5f5f5",
    minHeight: "100vh",
    padding: 24,
    display: "flex",
    justifyContent: "center"
  },
  card: {
    background: "#fff",
    borderRadius: 12,
    padding: 32,
    maxWidth: 560,
    width: "100%",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    margin: "0 0 4px 0",
    color: "#111"
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    margin: "0 0 24px 0"
  },
  field: {
    marginBottom: 16
  },
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: "#333",
    marginBottom: 6
  },
  input: {
    width: "100%",
    padding: "8px 12px",
    fontSize: 14,
    border: "1px solid #d1d5db",
    borderRadius: 6,
    outline: "none",
    boxSizing: "border-box" as any,
    background: "#fafafa",
    transition: "border-color 0.2s"
  },
  hint: {
    display: "block",
    fontSize: 12,
    color: "#999",
    marginTop: 4
  },
  row: {
    display: "flex",
    gap: 12
  },
  actions: {
    display: "flex",
    gap: 10,
    marginTop: 20
  },
  btnPrimary: {
    flex: 1,
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 600,
    color: "#fff",
    background: "#2563eb",
    border: "none",
    borderRadius: 8,
    cursor: "pointer"
  },
  btnSecondary: {
    flex: 1,
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 600,
    color: "#374151",
    background: "#f3f4f6",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    cursor: "pointer"
  },
  testResult: {
    marginTop: 16,
    padding: "10px 14px",
    borderRadius: 8,
    fontSize: 13,
    lineHeight: 1.5,
    wordBreak: "break-word" as any
  }
}

export default OptionsPage
