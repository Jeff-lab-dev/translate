import { Storage } from "@plasmohq/storage"

const storage = new Storage()

export interface LLMSettings {
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

export async function getSettings(): Promise<LLMSettings> {
  const stored = await storage.get("llmSettings")
  if (stored) {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
    } catch {
      return DEFAULT_SETTINGS
    }
  }
  return DEFAULT_SETTINGS
}

export async function saveSettings(settings: LLMSettings): Promise<void> {
  await storage.set("llmSettings", JSON.stringify(settings))
}

export async function callLLM(
  text: string,
  settings: LLMSettings
): Promise<string> {
  const { apiEndpoint, apiKey, model, systemPrompt, maxTokens, temperature } =
    settings

  const response = await fetch(apiEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ],
      max_tokens: maxTokens,
      temperature
    })
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`API error ${response.status}: ${errText}`)
  }

  const data = await response.json()
  // Support both OpenAI-compatible format and some common variants
  const content =
    data.choices?.[0]?.message?.content ||
    data.response ||
    data.content ||
    ""

  return content.trim()
}

// ── Message listener for content script requests ───────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "translate") {
    handleTranslate(message.text, message.mode)
      .then((translation) => sendResponse({ translation }))
      .catch((err) => sendResponse({ error: err.message }))
    return true // Keep channel open for async
  }

  if (message.type === "openOptions") {
    chrome.runtime.openOptionsPage()
    return false
  }
})

async function handleTranslate(
  text: string,
  mode: string
): Promise<string> {
  const settings = await getSettings()

  if (!settings.apiKey) {
    throw new Error("请先在插件设置中配置 API Key")
  }

  if (!settings.apiEndpoint) {
    throw new Error("请先在插件设置中配置 API 端点")
  }

  return await callLLM(text, settings)
}
