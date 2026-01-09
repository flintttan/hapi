---
title: Mobile Terminal Copy/Scroll Manual Regression
---

# 手工回归脚本：移动端 Terminal「复制/滚动」（MTERM-060）

背景：当前仓库未接入 web 侧 Playwright/Cypress 等 E2E 基建；本文件提供**可执行的手工回归脚本**，并给出后续自动化接入建议，用于持续回归关键交互。

## 0) 预期覆盖范围

- 复制：选择一段终端输出 → 触发复制 → 外部粘贴一致
- 滚动：输出区上下滑动/甩动（含惯性）可用，边界不穿透
- 输入/焦点：点击聚焦输入稳定；滚动/选择不导致异常频繁丢焦
- 快速键：可点击且不被键盘遮挡（键盘收起/弹出两态）

## 1) 本地启动（开发环境）

在仓库根目录：

1. 启动 web + server：
   - `bun run dev`
2. 打开 web（默认 Vite 端口通常为 5173；以终端输出为准）。

说明：
- web 侧会把 `/api` 与 `/socket.io` 代理到 server（见 `web/vite.config.ts`），因此建议用 `bun run dev` 一起启动。

## 2) 移动视口准备

推荐使用 Chrome DevTools 设备模式做“最小复现”（真机回归仍以 `docs/mobile-terminal-copy-scroll-checklist.md` 为准）：

1. 打开 DevTools → Toggle device toolbar
2. 选择 iPhone/Android 典型尺寸（或自定义宽度 ≤ 430）
3. 进入某个 session 的 Terminal 页面

## 3) 回归步骤（按键盘两态各跑一遍）

### 3.1 准备“≥ 3 屏输出”

在终端里执行任意能产生大量输出的命令（示例）：
- `seq 1 300`
- `yes | head -n 300`

### 3.2 输出区滚动（含惯性）

1. 在输出区缓慢上下滑动，观察内容是否滚动（可肉眼或通过 `scrollTop` 变化确认）。
2. 在输出区快速甩动（fling），观察是否存在惯性滚动（iOS 重点）。
3. 滚动到最顶/最底后继续滑动，确认不会把页面整体拖动（scroll chaining）。

### 3.3 复制（选中 → Copy → 外部粘贴）

1. 在输出区选择一段文本：
   - 桌面端：鼠标拖拽选择
   - 移动端：长按/拖拽（以实际可用手势为准）
2. 观察 Copy 按钮是否可见并可点击（若仅出现系统 Copy 菜单，也可直接用系统菜单验证）。
3. 点击 Copy 后，在外部输入框粘贴，确认内容一致。
4. 清空选择后，Copy 按钮应消失。
5. 若复制失败，应有明确反馈（haptic/提示）。

### 3.4 输入/焦点/快速键

1. 点击输入区域使键盘弹出，确认底部快速键不被遮挡。
2. 点击快速键，确认终端仍可输入且焦点稳定。
3. 在键盘弹出状态重复 3.2 的滚动步骤，确认滚动不明显退化。

## 4) 记录与归档

1. 按 `docs/mobile-terminal-copy-scroll-checklist.md` 的回归表逐项填写 Pass/Fail。
2. 录屏/截图至少 1 份，并替换 `docs/public/assets/mobile-terminal-copy-scroll/placeholder.svg`（或新增证据文件并更新链接）。

## 5) 后续自动化接入建议（最小化）

若要补齐最小 E2E：
1. 引入 Playwright（优先）并增加一个“移动视口”用例。
2. 让用例只断言关键路径：
   - `.terminal-xterm .xterm-viewport` 可滚动（scrollTop 从 0 → >0）
   - 触发 selection 后 Copy 按钮可见（可通过 xterm API 或测试夹具触发）
3. 为避免依赖真实后端数据，建议新增一个 dev-only 的 Terminal fixture route（只在 `import.meta.env.DEV` 下可用）用于稳定渲染与断言。
