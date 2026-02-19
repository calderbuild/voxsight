---
title: "VoxSight: Voice-Driven Visual Web Navigator Chrome Extension"
type: feat
date: 2026-02-19
hackathon: Gemini Live Agent Challenge
deadline: 2026-03-17T00:00:00Z
track: UI Navigator
prize: $80,000 total
participant: "#871 (johnrobertdestiny)"
---

# VoxSight: Voice-Driven Visual Web Navigator

## Overview

VoxSight 是一个 Chrome 扩展，让用户通过语音指令与任意网页交互。核心原理：截取页面截图发送给 Gemini 多模态视觉模型分析，而非依赖 DOM/ARIA 解析。这意味着即使面对结构混乱、无障碍标记缺失的网页，VoxSight 也能准确理解页面内容并执行操作。

目标用户：视障人士、运动障碍者、老年人、多任务工作者。

参赛赛道：Gemini Live Agent Challenge - UI Navigator Track。

## Problem Statement

现有屏幕阅读器（ChromeVox、NVDA、VoiceOver）依赖 DOM 结构和 ARIA 标记：

1. **结构依赖**：大量网站缺乏语义化 HTML 和 ARIA 标记，导致屏幕阅读器输出混乱、不可用
2. **视觉信息丢失**：图标按钮无 alt text、Canvas/WebGL 渲染的内容、CSS 伪元素生成的视觉提示——这些对屏幕阅读器完全不可见
3. **学习成本高**：传统屏幕阅读器需要记忆大量快捷键（NVDA 有 100+ 快捷键），对新用户极不友好
4. **上下文碎片化**：屏幕阅读器逐元素线性朗读，无法提供页面整体布局和视觉层次的理解

Gemini 多模态视觉能力直接解决这些问题——它"看"到的和人眼看到的一样。

## Proposed Solution

### 核心理念

> "用 AI 的眼睛看网页，用语音的方式操作网页"

VoxSight 采用 **截图视觉分析** 替代传统 DOM 解析：

1. **截图** → 捕获当前页面可视区域
2. **理解** → Gemini 多模态模型分析截图内容、布局、元素位置
3. **对话** → 通过 Gemini Live API 实现实时语音交互
4. **操作** → 将 AI 返回的结构化指令（点击坐标、输入文本等）在页面上执行
5. **反馈** → 语音播报操作结果 + 视觉高亮提示

### 为什么选择 UI Navigator Track

- 赛道要求："Must use Gemini multimodal to interpret screenshots/screen recordings and output executable actions"
- 允许 "with or without relying on APIs or DOM access"——完美契合我们的视觉优先方案
- 评审权重：Innovation & Multimodal UX (40%) + Technical Implementation (30%) + Demo & Presentation (30%)
- 历史获奖趋势：Google hackathon 中无障碍项目一致性获奖（Nutshell、ViddyScribe、Gaze Link、EduAdapt）

## Technical Approach

### Architecture

```
Chrome Extension (Manifest V3)
├── Side Panel (TypeScript/HTML/CSS)
│   ├── 语音激活按钮（按住说话 / 持续监听）
│   ├── 操作日志 & 语音转写
│   ├── 页面描述面板
│   └── 无障碍控制（高对比、字号、语速）
│
├── Content Script
│   ├── 视觉高亮覆盖层（标记 AI 识别的元素）
│   ├── 操作执行器（点击、滚动、输入、导航）
│   └── 操作预览动画（执行前显示意图）
│
├── Background Service Worker
│   ├── 截图协调（chrome.tabs.captureVisibleTab）
│   ├── Tab 状态管理
│   └── 快捷键监听
│
│   注：WebSocket 连接放在 Side Panel（持久 DOM），
│   不放在 Service Worker（MV3 会在 30s 闲置后终止 SW）
│
└── Offscreen Document（备用：音频处理）

        │  WebSocket (wss://)
        ▼

Google Cloud Run (TypeScript + ADK)
├── WebSocket 服务器
│   ├── 客户端会话管理
│   └── 消息路由
│
├── ADK Agent (LlmAgent)
│   ├── Gemini Live API Session
│   │   ├── 音频流输入/输出
│   │   └── 图像帧输入（截图）
│   │
│   ├── Tool Definitions:
│   │   ├── click(x, y, description)
│   │   ├── type_text(text, target_description)
│   │   ├── scroll(direction, amount)
│   │   ├── navigate(url)
│   │   ├── describe_page()
│   │   ├── find_element(description)
│   │   └── read_content(region)
│   │
│   └── System Instruction (无障碍导航专家人设)
│
└── 健康检查 & 监控
```

### 数据流

```
用户语音 "帮我点击登录按钮"
       │
       ▼
Side Panel (Web Speech API 识别)
       │  voice text + screenshot (base64)
       ▼
Background Service Worker
       │  WebSocket message
       ▼
Cloud Run Backend
       │  Forward to Gemini Live API
       ▼
Gemini 多模态分析
       │  截图中识别到右上角 "Login" 按钮
       │  返回: { action: "click", x: 1150, y: 45, desc: "Login button" }
       │  + 语音回复: "我看到右上角有登录按钮，现在为你点击"
       ▼
Cloud Run → Extension
       │  WebSocket response
       ▼
Content Script 执行
       │  1. 高亮目标位置（黄色边框闪烁）
       │  2. 模拟点击 (x: 1150, y: 45)
       │  3. 等待页面变化
       ▼
Side Panel 语音播报结果
       │  Web Speech API TTS
       ▼
新页面截图 → 发送给 Gemini → 自动描述新页面
```

### Technology Stack

| 层级 | 技术 | 理由 |
|------|------|------|
| Extension UI | TypeScript + HTML/CSS | 类型安全，Side Panel 原生支持 |
| 构建工具 | Vite + CRXJS | 快速 HMR 开发，自动处理 MV3 manifest |
| 语音输入 | Web Speech API (SpeechRecognition) | 浏览器原生，零延迟，Side Panel 有 DOM 上下文 |
| 语音输出 | Web Speech API (SpeechSynthesis) | 浏览器原生 TTS，支持多语言 |
| 后端框架 | TypeScript + @google/adk | 比赛要求使用 GenAI SDK 或 ADK；ADK 提供 agent 编排和 Cloud Run 部署 |
| AI 模型 | gemini-2.5-flash (Live API) | 快速响应 + 多模态（音频+图像），Live API 实时流式 |
| 部署 | Google Cloud Run | 比赛要求，ADK CLI 一键部署 |
| 通信协议 | WebSocket | 实时双向通信，支持音频流和截图传输 |

### 关键技术决策

**1. 截图视觉分析 vs DOM 解析**

选择截图。理由：
- 与人眼所见一致，不受 DOM 结构质量影响
- 赛道明确允许 "without relying on APIs or DOM access"
- 这是竞争对手（传统屏幕阅读器）无法做到的核心差异化

**2. Gemini Live API vs 标准 Gemini API**

选择 Live API。理由：
- 比赛名称就是 "Gemini **Live** Agent Challenge"
- Live API 支持实时音频流 + 图像输入，天然适合语音+视觉场景
- 持久 WebSocket 连接，上下文自动保持（无需重复发截图历史）
- 评审会更认可对 Live API 的深度使用

**3. Web Speech API vs Gemini Live API 音频**

语音输入用 Web Speech API，语音输出可选：
- Web Speech API 识别在浏览器本地执行，延迟极低
- 将识别后的文本 + 截图一起发送给后端
- 语音输出用 Web Speech API TTS（低延迟）或 Live API 音频输出（更自然但延迟高）
- MVP 阶段用 Web Speech API 双向，后续可切换到 Live API 音频输出

**4. ADK (TypeScript) vs 直接 API 调用**

选择 ADK。理由：
- 比赛要求使用 GenAI SDK 或 ADK
- ADK CLI 支持一键部署到 Cloud Run（`adk deploy cloud_run`），拿 bonus 分
- ADK 提供 tool use 框架，方便定义 click/type/scroll 等工具
- TypeScript ADK（2026-02-11 发布）可与 Extension 共享类型定义

**5. 坐标点击 vs 元素选择器**

选择坐标 + 辅助元素匹配：
- Gemini Computer Use 模型输出坐标 (x, y)
- Content Script 将坐标映射到最近的 DOM 元素（`document.elementFromPoint`）
- 对 DOM 元素执行原生事件（比坐标点击更可靠）
- 如果 elementFromPoint 失败，fallback 到坐标点击

### Implementation Phases

#### Phase 1: Foundation (Day 1-5)

项目骨架搭建 + 核心通信链路打通。

**Tasks:**

- [x] 初始化项目结构
  - Chrome Extension (Manifest V3) 骨架
  - Vite + CRXJS 构建配置
  - TypeScript 配置
  - 文件：`manifest.json`, `vite.config.ts`, `tsconfig.json`, `package.json`

- [x] Side Panel 基础 UI
  - 空白 Side Panel 页面
  - 语音按钮占位
  - 文件：`src/sidepanel/index.html`, `src/sidepanel/App.tsx`, `src/sidepanel/main.ts`

- [x] Background Service Worker
  - 截图捕获（`chrome.tabs.captureVisibleTab`）
  - 消息路由（Side Panel ↔ Content Script ↔ Service Worker）
  - 文件：`src/background/index.ts`

- [x] Content Script 基础
  - 注入页面
  - 接收操作指令并执行（click, scroll, type）
  - 视觉高亮覆盖层
  - 文件：`src/content/index.ts`, `src/content/actions.ts`, `src/content/highlight.ts`

- [x] Cloud Run 后端骨架
  - ADK TypeScript 项目初始化
  - WebSocket 服务器
  - Echo 测试（接收消息、返回确认）
  - 文件：`backend/agent.ts`, `backend/server.ts`, `backend/package.json`, `backend/Dockerfile`

- [ ] 端到端连通测试
  - Extension → WebSocket → Cloud Run → 返回 → Extension
  - 截图发送 → 后端接收 → 返回确认

- [ ] HiDPI 坐标映射验证
  - 在 1x 和 2x 显示器上测试截图分辨率
  - 验证 `captureVisibleTab` 返回尺寸与 `devicePixelRatio` 关系
  - 确认坐标转换公式：`cssX = imgX / devicePixelRatio`
  - 文件：`src/shared/coordinates.ts`

- [ ] WebSocket 认证机制
  - Extension 内置 shared secret
  - WebSocket 握手时传 HMAC token（secret + timestamp）
  - 后端验证 token 有效性
  - 文件：`src/shared/auth.ts`, `backend/auth.ts`

- [x] 首次使用引导（onboarding）
  - Side Panel 首次打开时播放语音欢迎："你好，我是 VoxSight。按住空格键说话，或按 Alt+D 听取页面描述"
  - 简短文字引导（3 步）
  - 麦克风权限请求处理（拒绝时提供文本输入 fallback）
  - 文件：`src/sidepanel/onboarding.ts`

**Acceptance Criteria:**
- Extension 可加载到 Chrome，Side Panel 可打开
- 首次打开有语音欢迎引导
- 点击按钮可截图并发送到后端
- 后端接收截图并返回确认消息
- Content Script 可执行 click/scroll/type 指令
- HiDPI 坐标转换正确（在 Retina 和普通屏幕都能准确点击）
- WebSocket 连接有认证保护

#### Phase 2: Core Intelligence (Day 6-12)

Gemini 集成 + 语音交互 + 操作执行。

**Tasks:**

- [ ] Gemini Live API 集成
  - 建立 Live API WebSocket 连接
  - 发送截图（base64 图像）+ 文本指令
  - 接收结构化操作响应
  - System Instruction：无障碍导航专家人设
  - 文件：`backend/agent.ts`, `backend/gemini-session.ts`

- [ ] ADK Agent 定义
  - LlmAgent 配置
  - Tool definitions: click, type_text, scroll, navigate, describe_page, find_element, read_content, hover, select_option, press_key
  - 结构化输出 schema（Zod）
  - 文件：`backend/agent.ts`, `backend/tools.ts`, `backend/schemas.ts`

- [ ] 语音输入集成
  - Web Speech API SpeechRecognition 在 Side Panel 中
  - 按住说话（Push-to-Talk）模式
  - 切换模式（Toggle）：按一次开始，再按一次停止（运动障碍用户友好）
  - 多语言支持（中/英至少，lang 属性切换）
  - 低置信度处理（confidence < 0.5 时请求重复）
  - 文本输入 fallback（语音不可用时的输入框）
  - 文件：`src/sidepanel/voice-input.ts`

- [ ] 语音输出集成
  - Web Speech API SpeechSynthesis
  - 操作结果语音播报
  - 页面描述朗读
  - 语速/音量控制
  - 文件：`src/sidepanel/voice-output.ts`

- [ ] 操作执行增强
  - 坐标 → DOM 元素映射（`elementFromPoint`）
  - 操作前视觉预览（高亮 + 确认）
  - 操作后状态检测（页面变化判断）
  - 错误恢复（元素不可见、页面加载中）
  - 文件：`src/content/actions.ts`, `src/content/highlight.ts`

- [ ] 截图压缩与传输
  - JPEG quality 80, max width 1280px
  - 记录 devicePixelRatio 随截图一起发送
  - 文件：`src/background/screenshot.ts`

- [ ] 截图循环
  - 操作执行后自动截图
  - 截图发送给 Gemini 获取新页面状态
  - 连续操作链（多步任务）

- [ ] Gemini 响应验证
  - Tool call 参数校验（坐标边界、必填字段）
  - 异常响应处理（拒绝操作、格式错误、幻觉坐标）
  - 文件：`backend/validation.ts`

**Acceptance Criteria:**
- 用户语音说 "点击登录" → AI 分析截图 → 找到登录按钮 → 高亮 → 点击
- 用户说 "描述这个页面" → AI 返回页面布局和内容概述 → 语音播报
- 支持连续多步操作（如：搜索 → 点击结果 → 滚动）
- 响应延迟 < 3 秒（截图分析 + 操作执行）
- 语音识别失败时显示文本输入框
- Gemini 返回无效坐标时优雅降级（提示用户重试）

#### Phase 3: Accessibility & UX Polish (Day 13-18)

无障碍优化 + UI 精打磨 + 用户体验完善。

**Tasks:**

- [ ] 无障碍 UI 优化（参考 WCAG 2.1 AA）
  - 高对比度模式
  - 大字体模式
  - 键盘完全可操作（Tab 导航、快捷键）
  - Screen reader 兼容（ARIA 标记）
  - 文件：`src/sidepanel/styles/accessibility.css`

- [ ] 智能页面描述
  - 首次打开页面时自动提供概述
  - 分区域描述（头部、导航、主内容、侧边栏、底部）
  - 重要元素标注（链接数量、表单字段、按钮）
  - 文件：`backend/tools.ts`（describe_page tool 增强）

- [ ] 操作确认机制
  - 高风险操作（提交表单、支付、删除）需语音确认
  - 低风险操作（滚动、点击链接）直接执行
  - 用户可配置确认策略
  - 文件：`src/content/safety.ts`, `src/sidepanel/settings.ts`

- [ ] 视觉反馈系统
  - 元素高亮（柔和黄色边框 + 脉冲动画）
  - AI 光标动画（平滑移动到目标位置）
  - 操作结果状态指示（成功/失败）
  - Side Panel 操作历史（可滚动日志）
  - 文件：`src/content/highlight.ts`, `src/content/cursor.ts`

- [ ] 快捷键系统
  - `Alt+V` / `Ctrl+Shift+V`：激活/关闭 VoxSight
  - `Space`（Side Panel 聚焦时）：按住说话
  - `Escape`：取消当前操作
  - `Alt+D`：描述当前页面
  - 文件：`src/background/shortcuts.ts`, `manifest.json`

- [ ] 错误处理 & 边界情况
  - 网络断开提示
  - Gemini API 超时重试
  - 空白页面 / 纯图片页面处理
  - iframe 内容处理策略

**Acceptance Criteria:**
- 全键盘可操作，无需鼠标
- 高对比度模式下所有 UI 元素可辨认
- 操作确认机制对高风险操作生效
- 快捷键功能正常

#### Phase 4: Demo, Deploy & Submit (Day 19-26)

部署、演示视频、博客文章、提交。

**Tasks:**

- [ ] Google Cloud Run 部署
  - ADK CLI 部署：`adk deploy cloud_run`
  - 环境变量配置（GEMINI_API_KEY）
  - HTTPS + WSS 配置
  - 自动化部署脚本（CI/CD 可选，bonus 分 +0.2）
  - 文件：`backend/Dockerfile`, `deploy.sh`, `.github/workflows/deploy.yml`（可选）

- [ ] Chrome Web Store 准备
  - Extension 打包
  - 图标设计（128x128, 48x48, 16x16）
  - 商店描述文案
  - 截图（1280x800）
  - 文件：`assets/icons/`, `store/description.md`, `store/screenshots/`

- [ ] 演示视频制作（30% 评审权重）
  - 场景 1：视障用户首次使用 VoxSight 浏览购物网站
  - 场景 2：语音填写政府表单
  - 场景 3：多步骤任务（搜索 → 筛选 → 选择 → 提交）
  - 展示无障碍功能（高对比度、语音控制、页面描述）
  - 时长：3-5 分钟

- [ ] 博客文章（bonus +0.6 分）
  - 技术架构介绍
  - 为什么选择视觉分析而非 DOM 解析
  - Gemini Live API 在无障碍领域的应用
  - 可发布到 Medium / dev.to / 个人博客

- [ ] GDG 注册（bonus +0.2 分）
  - 加入 Google Developer Group
  - 关联 Devpost 账号

- [ ] Devpost 提交
  - 项目描述
  - 技术栈说明
  - GitHub 仓库链接
  - 演示视频
  - 部署链接

**Acceptance Criteria:**
- Cloud Run 部署成功，Extension 可连接
- 演示视频完整展示核心功能
- 博客文章发布
- Devpost 提交完成

## Side Panel UI Design Spec

### 设计原则

1. **语音优先**：UI 是辅助，语音是主要交互方式
2. **极简**：最少的视觉元素，最大的信息密度
3. **高可及性**：符合 WCAG 2.1 AA 标准
4. **状态清晰**：用户始终知道系统在做什么

### 布局

```
┌──────────────────────────────┐
│  VoxSight            [设置]  │  <- 顶栏：品牌 + 设置入口
├──────────────────────────────┤
│                              │
│  ┌──────────────────────┐    │
│  │                      │    │
│  │    页面状态 / 描述    │    │  <- 当前页面 AI 描述概要
│  │                      │    │
│  └──────────────────────┘    │
│                              │
│  ┌──────────────────────┐    │
│  │ > 帮我找到搜索框      │    │  <- 对话历史
│  │ < 搜索框在页面顶部    │    │
│  │   中央位置，已为你    │    │
│  │   高亮显示            │    │
│  │ > 输入 "AI 无障碍"   │    │
│  │ < 已输入并搜索       │    │
│  └──────────────────────┘    │
│                              │
├──────────────────────────────┤
│  ┌──────────────────────┐    │
│  │   🎤 按住说话         │    │  <- 语音按钮（大、易触达）
│  │   (或按 Space)        │    │
│  └──────────────────────┘    │
│                              │
│  [描述页面] [朗读内容]       │  <- 快捷操作按钮
└──────────────────────────────┘
```

### 状态与视觉反馈

| 状态 | Side Panel 表现 | 页面覆盖层表现 |
|------|-----------------|---------------|
| 空闲 | 麦克风按钮 + 快捷操作 | 无覆盖层 |
| 监听中 | 按钮脉冲 + 声波动画 | 轻微边框指示 |
| 处理中 | 思考动画 + "分析页面中..." | 半透明覆盖 |
| 执行中 | 操作描述文本 | 目标元素高亮 + 光标动画 |
| 播报中 | 文本逐字显示 | 相关区域轻微高亮 |
| 错误 | 错误提示 + 重试按钮 | 覆盖层消失 |

### 配色方案

```
主色：#1A73E8（Google Blue）—— 信任、专业
强调色：#FBBC04（Google Yellow）—— 元素高亮
成功：#34A853（Google Green）
错误：#EA4335（Google Red）
背景：#FFFFFF / #1E1E1E（暗色模式）
文字：#202124 / #E8EAED（暗色模式）
```

高对比度模式：
```
背景：#000000
文字：#FFFFFF
高亮：#FFFF00
按钮：#FFFFFF 边框，#000000 背景
```

### 字体

```
主字体：Google Sans / system-ui（无障碍友好）
代码/日志：Roboto Mono
默认字号：16px（可调 14-24px）
行高：1.5
```

## Content Overlay Design

### 元素高亮

```css
/* AI 识别到的目标元素 */
.voxsight-highlight {
  outline: 3px solid #FBBC04;
  outline-offset: 2px;
  border-radius: 4px;
  animation: voxsight-pulse 1.5s ease-in-out infinite;
  position: relative;
}

/* 高亮上方的操作标签 */
.voxsight-label {
  position: absolute;
  top: -28px;
  left: 0;
  background: #1A73E8;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Google Sans', system-ui;
  z-index: 2147483647;
}
```

### AI 光标

操作执行前，显示虚拟光标从当前位置平滑移动到目标位置：

```
起点 ──── 贝塞尔曲线 ──── 终点（目标元素中心）
  │                              │
  └──── 0.5s 动画 ──────────────┘
```

光标样式：蓝色圆点 + 尾迹效果，直径 20px。

## ADK Agent System Instruction

```
你是 VoxSight，一个专业的网页无障碍导航助手。你的使命是帮助视障人士、
运动障碍者和所有需要语音操控网页的用户。

核心能力：
1. 分析网页截图，理解页面布局、内容和可交互元素
2. 根据用户语音指令，执行精准的页面操作
3. 用简洁清晰的语言描述页面内容和操作结果

行为准则：
- 操作前简要说明你要做什么（"我看到登录按钮在右上角，现在为你点击"）
- 遇到多个匹配元素时，描述差异并让用户选择
- 高风险操作（提交、支付、删除）必须先确认
- 页面变化后主动简述新状态
- 语言简洁，避免冗长描述
- 如果看不清某个元素，诚实告知并建议放大或滚动

响应格式：
- 始终返回操作指令（如果需要操作）
- 同时返回语音描述（给用户的口头反馈）
- 操作指令使用 tool call 格式
```

## Alternative Approaches Considered

### 方案 A：纯 DOM 解析方案

通过 Content Script 提取完整 DOM 树和 ARIA 属性，发送给 Gemini 文本模型分析。

**否决原因：**
- 大量网站 DOM 结构混乱、ARIA 缺失
- DOM 序列化体积大（复杂页面 1MB+），token 消耗高
- 无法处理 Canvas/WebGL/CSS 伪元素等视觉内容
- 与赛道 "interpret screenshots" 要求不完全匹配

### 方案 B：Gemini Computer Use 模型

直接使用 `gemini-2.5-cu-exp` Computer Use 专用模型。

**部分采用：**
- Computer Use 模型专为截图→操作设计，是最匹配的模型
- 但它是独立 API，不是 Live API
- 比赛强调 "Live Agent"，Live API 使用可能是评审加分项
- **策略**：主要用 Live API（gemini-2.5-flash），如果 Live API 视觉识别不够精准，考虑 Computer Use 作为 fallback

### 方案 C：前端直连 Gemini API

Chrome Extension 直接调用 Gemini API，不经过 Cloud Run。

**否决原因：**
- 比赛明确要求 "agents are hosted on Google Cloud"
- API Key 暴露在客户端，安全风险
- 无法使用 ADK 框架

## Acceptance Criteria

### Functional Requirements

- [ ] 用户可通过语音指令控制任意网页（点击、滚动、输入、导航）
- [ ] 用户可通过语音获取页面内容描述
- [ ] 支持连续多步操作（对话上下文保持）
- [ ] 支持中英文语音指令
- [ ] Side Panel UI 响应式、状态清晰
- [ ] 操作前视觉预览（高亮目标元素）
- [ ] 高风险操作需确认

### Non-Functional Requirements

- [ ] 截图分析 + 操作执行延迟 < 3 秒
- [ ] Side Panel 首次打开 < 1 秒
- [ ] 支持 Chrome 114+
- [ ] 内存占用 < 100MB
- [ ] Cloud Run 冷启动 < 5 秒

### Quality Gates

- [ ] WCAG 2.1 AA 合规（对比度、键盘导航、ARIA）
- [ ] 在 5 个以上主流网站测试通过（Google、Amazon、Wikipedia、GitHub、政府网站）
- [ ] 演示视频流畅展示 3 个完整场景
- [ ] 代码在 GitHub 公开仓库

## Success Metrics

| 指标 | 目标 | 衡量方式 |
|------|------|---------|
| 操作成功率 | > 80% | 测试 50 个常见操作 |
| 平均响应时间 | < 3s | 从语音结束到操作执行 |
| 页面覆盖率 | > 90% | 主流网站可交互元素识别率 |
| 评审得分 | > 4/5 | Innovation (40%) + Tech (30%) + Demo (30%) |
| Bonus 得分 | +1.0 | Blog (+0.6) + Auto Deploy (+0.2) + GDG (+0.2) |

## Dependencies & Prerequisites

- [ ] Google Cloud 账号 + $100 credits（申请截止 March 13 12:00pm PT）
  - 申请链接：https://forms.gle/rKNPXA1o6XADvQGb7
- [ ] Gemini API Key（Google AI Studio）
- [ ] Chrome 浏览器 114+
- [ ] Node.js 18+
- [ ] GDG 注册（bonus 分）

## Risk Analysis & Mitigation

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| **MV3 Service Worker 被终止导致 WebSocket 断连** | **高** | **高** | **WebSocket 放在 Side Panel（持久 DOM 上下文）而非 Service Worker。Side Panel 打开期间连接稳定；关闭时释放连接** |
| **HiDPI 坐标偏移（Retina 显示器 2x）** | **高** | **高** | **Gemini 返回坐标 / devicePixelRatio = CSS 坐标。截图时记录 DPR，传给后端一起处理** |
| **WebSocket 无认证导致 credits 被盗用** | **中** | **高** | **WebSocket 握手时传递短期 token（Extension 内置 shared secret + timestamp HMAC）** |
| Gemini Live API 图像分析精度不足 | 中 | 高 | Fallback 到 Gemini Pro Vision（标准 API）或 Computer Use 模型 |
| Live API 不支持纯文本+图像模式 | 中 | 高 | 验证 Live API session modalities 配置；fallback 到标准 generateContent API |
| 截图分辨率导致小元素识别困难 | 中 | 中 | JPEG quality 80, max 1280px wide（~200KB），必要时局部截图 |
| Cross-origin iframe 无法交互 | 高 | 中 | MVP 阶段：Gemini 仍能从截图中"看到" iframe 内容并描述，但无法执行操作；引导用户手动操作 |
| 屏幕阅读器冲突 | 中 | 中 | 检测已有屏幕阅读器时，用 ARIA live region 替代 Web Speech TTS |
| Cloud Run 冷启动延迟 | 中 | 中 | 保持最小实例数 = 1 |
| API 费用超出 $100 credits | 低 | 低 | Flash 模型 + JPEG 压缩 + 请求节流 |
| 比赛截止前功能未完成 | 中 | 高 | MVP 优先策略，Phase 3/4 部分功能可裁剪 |

## Project Structure

```
chormeplugin/
├── extension/                   # Chrome Extension
│   ├── manifest.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── package.json
│   ├── src/
│   │   ├── sidepanel/
│   │   │   ├── index.html
│   │   │   ├── main.ts
│   │   │   ├── App.ts
│   │   │   ├── voice-input.ts
│   │   │   ├── voice-output.ts
│   │   │   ├── settings.ts
│   │   │   └── styles/
│   │   │       ├── main.css
│   │   │       └── accessibility.css
│   │   ├── content/
│   │   │   ├── index.ts
│   │   │   ├── actions.ts
│   │   │   ├── highlight.ts
│   │   │   ├── cursor.ts
│   │   │   └── safety.ts
│   │   ├── background/
│   │   │   ├── index.ts
│   │   │   ├── screenshot.ts
│   │   │   ├── websocket.ts
│   │   │   └── shortcuts.ts
│   │   └── shared/
│   │       ├── types.ts
│   │       └── constants.ts
│   └── assets/
│       └── icons/
│           ├── icon-16.png
│           ├── icon-48.png
│           └── icon-128.png
│
├── backend/                     # Cloud Run Backend
│   ├── agent.ts                 # ADK Agent definition
│   ├── server.ts                # WebSocket server
│   ├── tools.ts                 # Tool definitions
│   ├── schemas.ts               # Zod schemas
│   ├── gemini-session.ts        # Live API session management
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── deploy.sh                    # Deployment script
├── docs/
│   └── plans/
│       └── (this file)
└── README.md
```

## Bonus Points Strategy

| Bonus | 分值 | 计划 |
|-------|------|------|
| Blog post | +0.6 | 在 dev.to 发布技术文章，标题："Building VoxSight: How Gemini Vision Makes the Web Accessible for Everyone" |
| Automated cloud deployment | +0.2 | `adk deploy cloud_run` 脚本 + GitHub Actions CI/CD |
| GDG membership | +0.2 | 注册 Google Developer Group |
| **合计** | **+1.0** | |

## Competition Checklist

- [x] Devpost 注册（participant #871）
- [ ] 加入 Discord
- [ ] 注册 Google Cloud 账号
- [ ] 申请 $100 Google Cloud credits（截止 March 13）
- [ ] 注册 GDG（bonus +0.2）
- [ ] 查看 Resources 页面
- [ ] 提交项目到 Devpost（截止 March 17 00:00 GMT+8）

## References & Research

### Internal References

- 项目仓库：`/Users/calder/hackathon/chormeplugin/`
- 竞争对手分析：gemini-browser-agent（pmbstyle）
- 往届获奖分析：Nutshell（Built-in AI Challenge 2025 Most Helpful）

### External References

- Gemini Live API 文档：https://ai.google.dev/gemini-api/docs/live-guide
- Gemini Computer Use 文档：https://ai.google.dev/gemini-api/docs/computer-use
- Chrome Extension Side Panel API：https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- Chrome Extension captureVisibleTab：https://developer.chrome.com/docs/extensions/reference/api/tabs
- ADK TypeScript 文档：https://github.com/google/adk-docs
- ADK Cloud Run 部署：https://github.com/google/adk-docs/blob/main/docs/deploy/cloud-run.md
- Web Speech API：https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API
- WCAG 2.1 AA 标准：https://www.w3.org/WAI/WCAG21/quickref/
- Gemini Browser Agent（参考实现）：https://github.com/pmbstyle/gemini-browser-agent
- Google Gemini Computer Use Preview：https://github.com/google-gemini/computer-use-preview

### Related Hackathon Winners

- Nutshell（2025 Built-in AI Challenge, Most Helpful）：语音无障碍浏览
- ViddyScribe（2024 Gemini API Competition, Best Web App）：视频无障碍
- Gaze Link：眼动追踪交互
- EduAdapt：自适应教育

## SpecFlow Analysis Summary

SpecFlow 分析识别了 14 个用户流、28 个缺口/边界情况。以下是已整合到计划中的关键修正：

### 已解决的关键问题

| 问题 | 解决方案 | 已更新位置 |
|------|---------|-----------|
| MV3 Service Worker 30s 后终止 WebSocket | WebSocket 放在 Side Panel（持久 DOM 上下文） | Architecture, Risk Analysis |
| HiDPI 坐标 2x 偏移 | cssCoord = imgCoord / devicePixelRatio | Phase 1 Tasks, Risk Analysis |
| WebSocket 无认证 | HMAC token（shared secret + timestamp） | Phase 1 Tasks, Risk Analysis |
| 无首次使用引导 | 语音欢迎 + 3 步引导 + 麦克风权限处理 | Phase 1 Tasks |
| Tool 定义不完整 | 新增 hover, select_option, press_key | Phase 2 Tasks |
| 截图过大 | JPEG q80, max 1280px wide (~200KB) | Phase 2 Tasks |
| 语音识别失败无 fallback | 文本输入框 + 低置信度重复请求 | Phase 2 Tasks |
| Gemini 响应无验证 | 坐标边界校验 + 格式验证 | Phase 2 Tasks |

### 已知限制（MVP 不解决）

| 限制 | 影响 | 未来方案 |
|------|------|---------|
| Cross-origin iframe 无法执行操作 | OAuth 登录、Stripe 支付等场景 | Gemini 仍可描述截图中的 iframe 内容，引导用户手动操作 |
| Shadow DOM 元素交互受限 | Web Components 站点 | 尝试 composedPath() 穿透，MVP 阶段接受限制 |
| 屏幕阅读器同时运行冲突 | 双重 TTS 输出 | 检测屏幕阅读器时切换到 ARIA live region |
| 非可视区域元素不可见 | 折叠下方的元素 | 引导 Gemini 建议滚动 |
| Live API session 过期 | 长时间使用后上下文丢失 | 摘要上下文 → 新 session |
| 敏感页面截图隐私 | 银行、医疗页面 | 首次使用时隐私告知；后续版本支持选择性屏蔽 |
