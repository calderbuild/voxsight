---
title: "VoxSight: Remaining Polish and Submission Preparation"
type: feat
date: 2026-02-24
---

# VoxSight: Remaining Polish and Submission Preparation

Cloud Run 部署阻塞在 Billing credits 审批（72 工作小时内）。本计划覆盖所有不依赖部署的剩余工作。

## Task 1: Gemini 响应验证

在 backend 添加坐标边界校验，防止 Gemini 返回无效坐标。

- [ ] 在 `backend/agent.ts` 的 `sanitizeActions` 中添加坐标验证
  - click/type_text/hover 的 x/y 必须 >= 0 且 <= screenshot 像素尺寸
  - scroll amount 必须 > 0 且 <= 5000
  - navigate url 必须以 http:// 或 https:// 开头
  - 无效 action 从 actions 数组中移除，在 text 中追加警告

**文件:** `backend/agent.ts`

## Task 2: 错误处理边界情况

- [ ] Side Panel: 网络断开时禁用语音按钮，显示离线状态
- [ ] Side Panel: 空白页面（about:blank）检测，提示用户打开网页
- [ ] Content Script: `elementFromPoint` 返回 null 时给出坐标附近元素建议
- [ ] Backend: Gemini API 超时（15s）自动重试一次

**文件:** `extension/src/sidepanel/main.ts`, `extension/src/content/index.ts`, `backend/agent.ts`

## Task 3: Chrome Web Store 准备

- [ ] 编写 `store/description.md`：中英文商店描述（200 字以内）
- [ ] 准备 `store/screenshots/` 目录结构（提交前截图填充）
- [ ] 编写 `store/privacy-policy.md`：隐私政策（截图数据仅发送到自有后端，不存储）

**文件:** `store/description.md`, `store/privacy-policy.md`

## Task 4: 演示视频脚本

- [ ] 编写 `docs/demo-script.md`：3 个场景的详细脚本
  - 场景 1: 语音描述 Google 首页 + 搜索操作
  - 场景 2: 语音填写表单（输入文本 + 点击提交）
  - 场景 3: 多步骤购物流程（搜索 -> 筛选 -> 点击商品）
  - 每个场景标注：旁白文本、操作步骤、预期 AI 响应
- [ ] 包含开场（15s VoxSight 介绍）和结尾（技术栈 + 无障碍意义）

**文件:** `docs/demo-script.md`

## Task 5: 博客文章草稿（bonus +0.6）

- [ ] 编写 `docs/blog-draft.md`
  - 标题: "Building VoxSight: How Gemini Vision Makes the Web Accessible for Everyone"
  - 结构: Problem -> Solution -> Architecture -> Demo -> Impact
  - 重点: 截图视觉分析 vs DOM 解析的优势
  - 约 1500 字英文

**文件:** `docs/blog-draft.md`

## Task 6: Devpost 提交材料

- [ ] 编写 `docs/devpost-submission.md`
  - 项目名称、简介（300 字）
  - 技术栈列表
  - "How we built it" 段落
  - "Challenges we ran into" 段落
  - "What we learned" 段落
  - "What's next" 段落
  - GitHub 仓库链接

**文件:** `docs/devpost-submission.md`

## Task 7: Cloud Run 部署（Billing 解除后）

- [ ] 运行 `./deploy.sh`
- [ ] 获取 Cloud Run URL，更新 `extension/src/shared/constants.ts` 的 `BACKEND_URL_PROD`
- [ ] 重新 build extension: `npm --prefix extension run build`
- [ ] 验证 extension 连接 Cloud Run 后端正常工作
- [ ] 更新 Devpost 提交中的部署链接

**文件:** `extension/src/shared/constants.ts`, `deploy.sh`

## Acceptance Criteria

- [ ] Gemini 返回越界坐标时不崩溃，给出友好提示
- [ ] 网络断开和恢复时 UI 状态正确
- [ ] Chrome Web Store 描述和隐私政策完整
- [ ] 演示视频脚本可直接按步骤录制
- [ ] 博客文章可发布到 dev.to / Medium
- [ ] Devpost 提交材料齐全
- [ ] （Billing 解除后）Cloud Run 部署成功，extension 可连接

## Priority Order

1. Task 1 + Task 2（代码质量，影响演示效果）
2. Task 4 + Task 6（演示和提交准备，核心交付物）
3. Task 3 + Task 5（商店准备和博客，bonus 分）
4. Task 7（等 Billing 解除后执行）
