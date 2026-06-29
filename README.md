# Mukyu AI

一款不止于对话的学习用 AI 工具。

---

## 特点

* 浮动查询：不打断主线学习的情况下快速了解陌生概念

* 分块学习与树状上下文：AI划分章节，按章节分别学习。使用树状上下文架构，避免上下文冗长，同时减少 token 消耗

* RAG 知识库：可自行导入学习资料供 AI 参考

* 多供应商支持：兼容 OpenAI、Anthropic、Google Gemini 三家 API 格式。可同时配置多家供应商

* 快速跳转时间线：直观的时间线导航，可一键跳转回之前的学习节点、提问记录或思维片段

* 多模态支持：支持 PDF、Word、Excel 等格式的文档理解，自带文档解析；支持为无多模态的模型外挂图像理解模型

* 动态上下文压缩

* 丝滑的动画过渡和完善的公式渲染

---

## Tech Stack

React, Next.js, Tailwind CSS, Motion, Electron

## Getting Started

### 1. Install dependencies
```bash
npm install
```

### 2. Run the development server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### 3. Run the Electron app
```bash
npm run electron:dev
```

### 4. Build the desktop application
```bash
npm run electron:build
```

---

## License
[MIT](LICENSE)
