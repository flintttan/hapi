---
title: Mobile Terminal Copy/Scroll Analysis
---

# Mobile 端 Terminal「复制/滚动」链路分析（MTERM-010）

目标：明确移动端「选中文本复制」与「输出区域上下滑动/惯性滚动」的真实触点与阻断点，并给出**最小改动点**与风险/回退建议（不在本文件内做功能改动）。

> 说明：原 issue 要求写在 issue/PR 描述中；当前仓库内以本文档落盘，便于代码 review 与后续实现对照。

## 1) 复制链路：当前实现与限制

### 1.1 当前“选择文本”来源：xterm selection API（`onSelectionChange`/`getSelection`）

`TerminalView` 监听 xterm 的 `onSelectionChange`，并通过 `terminal.getSelection()` 获取选中文本，用于驱动 Copy 按钮的显隐与复制内容：

- selection 监听：`web/src/components/Terminal/TerminalView.tsx:75`
- 文本来源：`web/src/components/Terminal/TerminalView.tsx:76`
- Copy UI 显示条件：`web/src/components/Terminal/TerminalView.tsx:133`

结论：
- Copy UI 不再依赖 `document.getSelection()`，避免把终端外的 selection 或 DOM 结构差异带进复制链路。
- 复制内容来源于 xterm buffer 的 selection，适合做“保底复制”闭环（见 MTERM-030）。

### 1.2 xterm 渲染模式：当前依赖版本未暴露 `rendererType` 配置

项目依赖 `@xterm/xterm` `^6.0.0`（`web/package.json:26`），其 public typings 中未提供 `rendererType` 选项（`web/node_modules/@xterm/xterm/typings/xterm.d.ts:26` 起的 `ITerminalOptions` 列表中无该字段）。

- 初始化位置：`web/src/components/Terminal/TerminalView.tsx:49`

结论（POC 结果，用于校准后续方案）：
- “切换到 DOM renderer”在当前依赖版本下**无法通过 options 显式配置**，需要以实际运行表现为准。
- 因此移动端复制问题更可能来自 **选择检测逻辑（当前依赖 `document.getSelection()`）与 xterm 自身 selection 机制不一致**，或来自移动端交互/布局（例如滚动、键盘弹出时的布局补偿）导致的选择/复制体验不稳定（见 MTERM-030 的保底方向）。

### 1.3 复制写入剪贴板：用户手势触发 + 降级路径

Copy 按钮点击后走 `safeCopyToClipboard`：优先 `navigator.clipboard.writeText`，失败则 fallback 到 `document.execCommand('copy')`：

- hook：`web/src/hooks/useCopyToClipboard.ts:9`
- Clipboard API：`web/src/lib/clipboard.ts:1`
- execCommand fallback：`web/src/lib/clipboard.ts:8`

结论：
- 复制入口是按钮点击（用户手势）→ 符合 iOS 对 Clipboard 的基本限制。
- 但在 iOS/WebView 中，`navigator.clipboard` 能力与权限差异较大，fallback 可能仍失败，需要明确失败反馈（当前 hook 已有 haptic 反馈：`web/src/hooks/useCopyToClipboard.ts:16`）。

### 1.4 最小改动点（已落地）

- 选择检测：`web/src/components/Terminal/TerminalView.tsx:75`
- 复制内容：`web/src/components/Terminal/TerminalView.tsx:76`

## 2) 滚动链路：真正滚动元素与潜在阻断点

### 2.1 页面层级：Terminal 区域外层 `overflow-hidden`

终端输出区域外层容器使用 `overflow-hidden`，意味着页面本身不滚动，滚动必须发生在内部（xterm 生成的 viewport）：

- 容器：`web/src/routes/sessions/terminal.tsx:270`

### 2.2 真实滚动元素：xterm viewport（`.xterm-viewport`）

项目 CSS 明确把 `-webkit-overflow-scrolling: touch` 施加在 `.terminal-xterm .xterm-viewport`，这也暗示了“真正需要滚动”的元素是 `.xterm-viewport`：

- 触控滚动意图：`web/src/index.css:110`
- viewport 惯性滚动：`web/src/index.css:122`

结论：
- 手势需要命中到 `.xterm-viewport`（或其可滚动祖先）才能产生 scrollTop 变化与惯性滚动。
- 如果手势被 xterm canvas/overlay 捕获并 `preventDefault`，或 CSS/布局让 viewport 不可滚动，会表现为“滑不动/无惯性”。

### 2.3 VisualViewport 补偿：避免 `transform` 影响 iOS 惯性滚动

为让底部快捷键避开键盘，页面根容器需要在键盘弹出（VisualViewport offsetTop 变化）时做整体位移补偿。

已采取的修复（MTERM-040）：
- 使用 `position: relative` + `top: <offsetTop>` 做补偿，避免使用 `transform`（`web/src/routes/sessions/terminal.tsx:224`）。

结论（iOS/WebView 关注点）：
- iOS/Safari/WebView 下，带 `transform` 的祖先元素可能影响 `-webkit-overflow-scrolling: touch` 的惯性表现；因此优先用不引入 transform 的方式做 offsetTop 补偿。

## 3) iOS/Android 差异点（回归关注）

- iOS Safari / iOS WebView：
  - 原生长按选择对 canvas 输出不友好；更依赖 DOM renderer 或自建 Copy UI。
  - Clipboard API 权限/能力差异大，必须保持“用户手势触发 + 明确失败反馈”。
  - 若使用 `transform` 做 VisualViewport offsetTop 补偿，可能导致 `-webkit-overflow-scrolling: touch` 惯性异常（尤其键盘弹出时）；当前已改为 `top` 补偿，仍需真机回归。
- Android Chrome：
  - `touch-action` 支持相对完整，但“选择复制”仍受 xterm 渲染方式影响。
  - 更可能出现“滚动可以但选择不行”的组合，需要分别验证。

## 4) 风险与回退建议

- 风险：DOM renderer 可能带来性能/内存开销（长会话/大量输出时更明显）。
- 风险：滚动修复若涉及布局变更，需要覆盖键盘开关、长会话与输入焦点稳定性回归。
- 回退：建议引入“仅移动端启用”的开关（CSS/rendererType/复制 UI 逻辑都可按移动端条件分支），便于在特定机型/容器出问题时快速降级。
