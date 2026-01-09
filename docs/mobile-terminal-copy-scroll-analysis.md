---
title: Mobile Terminal Copy/Scroll Analysis
---

# Mobile 端 Terminal「复制/滚动」链路分析（MTERM-010）

目标：明确移动端「选中文本复制」与「输出区域上下滑动/惯性滚动」的真实触点与阻断点，并给出**最小改动点**与风险/回退建议（不在本文件内做功能改动）。

> 说明：原 issue 要求写在 issue/PR 描述中；当前仓库内以本文档落盘，便于代码 review 与后续实现对照。

## 1) 复制链路：当前实现与限制

### 1.1 当前“选择文本”来源：`document.getSelection()`

`TerminalView` 通过监听全局 `selectionchange`，读取 `document.getSelection()`，并要求 selection 的 anchor/focus 节点位于 xterm 容器内，才认为“有选择内容”，从而显示 Copy 按钮：

- 入口：`web/src/components/Terminal/TerminalView.tsx:89`
- 监听：`web/src/components/Terminal/TerminalView.tsx:129`
- 文本来源：`web/src/components/Terminal/TerminalView.tsx:94`
- 选择范围判断（是否在容器内）：`web/src/components/Terminal/TerminalView.tsx:103`
- Copy UI 显示条件：`web/src/components/Terminal/TerminalView.tsx:158`

结论：
- 该方案依赖**浏览器原生 DOM 文本选择**。
- 当终端输出是 **canvas 渲染**或“不可原生选择”的 DOM 结构时，移动端长按很难产生有效的 `document.getSelection()`，导致 Copy UI 不出现或内容为空。

### 1.2 xterm 渲染模式：默认未指定 `rendererType`

`Terminal` 初始化未传入 `rendererType`，等价于使用 xterm 默认渲染（通常为 canvas/webgl 路径，随运行环境而定）：

- 初始化：`web/src/components/Terminal/TerminalView.tsx:49`

结论（可复核点）：
- 若默认走 canvas renderer，则**终端输出不是可被系统长按选择的真实文本节点**，`document.getSelection()` 通常拿不到“你看到的那段终端文本”。
- 移动端想要“系统级长按选择/拖拽柄/Copy 菜单”，更可能需要 DOM renderer（见 MTERM-020 的 POC 方向）。

### 1.3 复制写入剪贴板：用户手势触发 + 降级路径

Copy 按钮点击后走 `safeCopyToClipboard`：优先 `navigator.clipboard.writeText`，失败则 fallback 到 `document.execCommand('copy')`：

- hook：`web/src/hooks/useCopyToClipboard.ts:9`
- Clipboard API：`web/src/lib/clipboard.ts:1`
- execCommand fallback：`web/src/lib/clipboard.ts:8`

结论：
- 复制入口是按钮点击（用户手势）→ 符合 iOS 对 Clipboard 的基本限制。
- 但在 iOS/WebView 中，`navigator.clipboard` 能力与权限差异较大，fallback 可能仍失败，需要明确失败反馈（当前 hook 已有 haptic 反馈：`web/src/hooks/useCopyToClipboard.ts:16`）。

### 1.4 最小改动点建议（不在本 issue 中实现）

为避免依赖 `document.getSelection()`（移动端不稳定/与 xterm 内部选择不一致），更稳的方向是改为使用 xterm selection API 驱动 Copy UI：

- 现有选择检测点：`web/src/components/Terminal/TerminalView.tsx:89`
- 未来替换点（建议）：用 `terminal.onSelectionChange` / `terminal.getSelection()` 取代 `document.getSelection()`（见 MTERM-030）。

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

### 2.3 VisualViewport 补偿采用 `transform: translateY(...)`（iOS 风险点）

为让底部快捷键避开键盘，页面根容器在键盘弹出（VisualViewport offsetTop 变化）时使用 transform 做整体位移：

- transform 设置：`web/src/routes/sessions/terminal.tsx:224`

结论（iOS/WebView 高风险点）：
- iOS/Safari/WebView 下，**带 transform 的祖先元素**可能影响 `-webkit-overflow-scrolling: touch` 的惯性表现（典型症状：只能“拖动式滚动”或惯性失效/抖动）。
- 这解释了为何问题在“键盘弹出（offsetTop 非 0）”场景更突出。

建议的可回退修复方向（见 MTERM-040）：
- 用不引入 transform 的布局方式实现 offsetTop 补偿（例如用 `top`/`padding`/布局重排），或把 scroll 容器移出 transform 影响范围；并以移动端条件开关保护。

## 3) iOS/Android 差异点（回归关注）

- iOS Safari / iOS WebView：
  - 原生长按选择对 canvas 输出不友好；更依赖 DOM renderer 或自建 Copy UI。
  - Clipboard API 权限/能力差异大，必须保持“用户手势触发 + 明确失败反馈”。
  - transform + `-webkit-overflow-scrolling: touch` 组合容易导致惯性滚动异常（尤其键盘弹出时）。
- Android Chrome：
  - `touch-action` 支持相对完整，但“选择复制”仍受 xterm 渲染方式影响。
  - 更可能出现“滚动可以但选择不行”的组合，需要分别验证。

## 4) 风险与回退建议

- 风险：DOM renderer 可能带来性能/内存开销（长会话/大量输出时更明显）。
- 风险：滚动修复若涉及布局变更，需要覆盖键盘开关、长会话与输入焦点稳定性回归。
- 回退：建议引入“仅移动端启用”的开关（CSS/rendererType/复制 UI 逻辑都可按移动端条件分支），便于在特定机型/容器出问题时快速降级。
