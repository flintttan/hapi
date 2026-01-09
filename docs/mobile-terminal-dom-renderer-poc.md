---
title: Mobile Terminal DOM Renderer POC
---

# POC：移动端 xterm「DOM renderer / 原生长按选择」（MTERM-020）

目标：在移动端尽可能获得系统级的“长按选择/拖拽柄/Copy 菜单”体验，并保证桌面端行为不受影响。

## 结论（POC 结果）

1) 当前依赖版本下，`@xterm/xterm` 的 public `ITerminalOptions` **未暴露** `rendererType` 配置项，因此无法在业务代码中用 options 显式“切换到 DOM renderer”：
- 依赖版本：`web/package.json:26`
- typings：`web/node_modules/@xterm/xterm/typings/xterm.d.ts:26`

2) xterm 内部实现存在 `DomRenderer`，并在 core 中创建 renderer（用于定位默认实现与后续排查路径）：
- renderer 创建：`web/node_modules/@xterm/xterm/src/browser/CoreBrowserTerminal.ts:583`

3) 因此，本阶段 POC 的产出是“校准方向”：
- “仅靠切换 rendererType”在当前版本下不可作为可控手段；
- 移动端复制体验更应转向 **xterm selection API 的保底 Copy UI（MTERM-030）**，以及与滚动/键盘布局相关的交互冲突排查（MTERM-040）。

## 手工验证步骤（iOS Safari / Android Chrome）

> 当前环境无法执行真机验证，需在真机/目标 WebView 中按以下步骤复核。

### 1) 原生长按选择（输出区域）

1. 打开 Terminal 页面，确保输出区有足够内容（至少 3 屏）。
2. 在输出区长按一段文本，观察是否出现系统选择柄/Copy 菜单。
3. 调整选择范围后点击 Copy。
4. 切换到外部输入框粘贴，检查内容一致。

期望：
- 出现系统选择交互（手柄/菜单），可复制并粘贴一致。

### 2) 大量输出后的滚动与输入可用性

1. 连续输出 ≥3 屏内容后，在输出区快速滑动，观察惯性滚动是否可用。
2. 点击输入区域，确认仍能聚焦并输入，且不会因选择/滚动导致异常频繁丢焦。

期望：
- 滚动与输入保持可用，无明显卡顿或交互冲突。

## 风险与回退建议（为后续实现做准备）

- 风险：若后续引入“可配置 renderer/模式切换”，需要重点回归长会话/大量输出的性能与内存占用。
- 回退：建议把移动端相关策略（Copy UI、滚动修复、任何潜在渲染模式策略）置于移动端条件分支/开关下，便于机型/容器问题时快速降级。
