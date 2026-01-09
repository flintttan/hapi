---
title: Mobile Terminal Copy/Scroll Feature Flags
---

# 上线与灰度：移动端 Terminal「复制/滚动」回退开关（MTERM-070）

目的：为不同 WebView/机型上的兼容性问题提供**快速回退能力**，在出现问题时可通过开关降级并验证恢复；默认不改变桌面端行为。

## 1) 开关总览

### 1.1 复制策略（Copy UI 的选中文本来源）

- 默认：
  - 触控设备：`document`（优先使用原生 selection，更符合长按选择/系统工具栏习惯）
  - 桌面端：`xterm`（使用 xterm selection API 驱动 Copy UI）
- 可切换：`xterm` / `document`

配置入口（二选一，优先 query param 便于临时排障）：
- Query param：`terminal_copy=xterm|document`
- LocalStorage：`hapi:terminal.copyMode = xterm|document`

### 1.2 VisualViewport offsetTop 补偿方式（键盘弹出场景）

- 默认：`top`（`position: relative + top`，避免 transform 影响 iOS 惯性滚动）
- 回退：`transform`（旧行为：`translateY(offsetTop)`）

配置入口：
- Query param：`terminal_offset=top|transform`
- LocalStorage：`hapi:terminal.viewportOffsetMode = top|transform`

### 1.3 长按菜单策略（contextmenu 处理）

- 默认：
  - 触控设备：`native`（不让 xterm 接管 `contextmenu`，优先走浏览器原生文本选择：蓝色选择柄/工具栏）
  - 桌面端：`xterm`（保留 xterm 默认右键复制/粘贴体验）
- 可切换：`native` / `xterm`

配置入口：
- Query param：`terminal_contextmenu=native|xterm`
- LocalStorage：`hapi:terminal.contextMenuMode = native|xterm`

## 2) 使用方式

### 2.1 用 query param 临时切换（推荐排障）

示例：
- 强制回退复制策略：`?terminal_copy=document`
- 强制回退键盘补偿：`?terminal_offset=transform`
- 强制切换长按菜单策略：`?terminal_contextmenu=xterm`
- 同时设置：`?terminal_copy=document&terminal_offset=transform&terminal_contextmenu=xterm`

### 2.2 用 LocalStorage 持久化（用于灰度/定向机型）

在浏览器控制台执行：

```js
localStorage.setItem('hapi:terminal.copyMode', 'document')
localStorage.setItem('hapi:terminal.viewportOffsetMode', 'transform')
```

恢复默认：

```js
localStorage.removeItem('hapi:terminal.copyMode')
localStorage.removeItem('hapi:terminal.viewportOffsetMode')
```

## 3) 观测点（不采集隐私数据）

建议在灰度期间重点观察：
- 复制：Copy 按钮可见性、复制成功/失败反馈、粘贴内容一致性
- 滚动：是否可惯性滚动、是否出现“拖不动/无惯性/跳动”、边界是否穿透
- 输入/焦点：键盘弹出后输入是否稳定、是否频繁丢焦、快速键是否被遮挡

## 4) 已知权衡

- `terminal_copy=document` 依赖浏览器原生 selection，可能在某些 WebView/布局下不稳定；但它可作为 xterm selection 路径异常时的回退。
- `terminal_offset=transform` 可能在 iOS/WebView 场景影响 `-webkit-overflow-scrolling: touch` 的惯性表现；但可作为 `top` 补偿导致布局异常时的回退。
- `terminal_contextmenu=native` 会绕开 xterm 的右键/长按粘贴菜单，优先确保原生文本可选；若需要恢复 xterm 的粘贴菜单，可切到 `terminal_contextmenu=xterm`。

## 5) Android PWA：长按只出现“粘贴”的说明

在 Android（尤其是 PWA）里，长按通常会触发 `contextmenu`。xterm 默认会在 `contextmenu` 中把隐藏 textarea 移到事件位置并 `select()`，这会让系统把长按当成“输入框菜单”，在无选区时往往只剩“粘贴”，从而阻断原生文本选择（蓝色选择柄/工具栏）。

当前策略：触控设备默认 `terminal_contextmenu=native`，在捕获阶段拦截 `contextmenu` 并阻止其继续被 xterm 处理，从而让浏览器按普通文本处理长按（进入原生选择模式）。若需要恢复 xterm 的粘贴菜单，可切到 `terminal_contextmenu=xterm`。
