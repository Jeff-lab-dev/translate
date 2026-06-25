# 双语翻译助手 (Bilingual Translator)

自用 Chrome 双语翻译插件，基于 [Plasmo](https://www.plasmo.com/) 框架开发。

## 功能

- 🔤 **英译中**：选中英文文本，点击右下角浮窗按钮即时翻译
- 📄 **整页翻译**：批量翻译页面文本块，双语对照显示
- ⚙️ **自定义 LLM**：支持任何兼容 OpenAI API 格式的翻译后端
- 🎯 **浮窗触发**：可拖拽的浮动按钮，不干扰页面浏览
- 🎨 **双语对照**：译文以灰色斜体显示在原文下方

## 快速开始

```bash
# 安装依赖
pnpm install

# 开发模式（热更新）
pnpm dev

# 构建
pnpm build
```

## 使用方式

1. 在 Chrome 中打开 `chrome://extensions`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `build/chrome-mv3-dev` 目录（开发模式）或 `build/chrome-mv3-prod`（生产模式）
5. 点击插件图标 → ⚙️ 设置翻译引擎 → 填写你的 API 信息
6. 打开任意英文网页，选中文本 → 点击右下角「译」按钮

## 技术栈

- **框架**：Plasmo v0.90
- **UI**：React 18 + TypeScript
- **存储**：chrome.storage (via @plasmohq/storage)
- **翻译**：兼容 OpenAI / OpenRouter / Ollama / 自定义 LLM API

## 许可证

MIT
