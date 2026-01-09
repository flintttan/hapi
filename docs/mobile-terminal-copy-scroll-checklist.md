---
title: Mobile Terminal Copy/Scroll Checklist
---

# Mobile 端 Terminal「复制/滚动」验收 Checklist

目标：在 **iOS Safari / Android Chrome / iOS WebView（如 Telegram 内置）** 三类环境中，对「选中文本→复制」与「输出区手势滚动（含惯性）」做可复现、可回归的验收记录。

适用范围：
- 输出区：Terminal 输出内容区域（非输入框）。
- 两种状态都要测：**键盘收起**、**键盘弹出**（iOS VisualViewport 场景尤需关注）。

## 1) 环境矩阵（需要分别在“键盘收起/弹出”两种状态验证）

状态说明：
- Baseline：当前版本（修复前）的结论，用于对比（若未验证，请在备注中说明 “reported/unverified”）。
- Target：修复后的期望结论（应为 Pass，除非明确标注例外）。

| 环境 | 键盘状态 | Baseline：复制 | Baseline：滚动 | Target：复制 | Target：滚动 | 备注 |
|---|---|---|---|---|---|---|
| iOS Safari | 收起 | Fail（reported） | Fail（reported） | Pass | Pass |  |
| iOS Safari | 弹出 | Fail（reported） | Fail（reported） | Pass | Pass |  |
| Android Chrome | 收起 | Fail（reported） | Fail（reported） | Pass | Pass |  |
| Android Chrome | 弹出 | Fail（reported） | Fail（reported） | Pass | Pass |  |
| iOS WebView（Telegram 等） | 收起 | Fail（reported） | Fail（reported） | Pass | Pass |  |
| iOS WebView（Telegram 等） | 弹出 | Fail（reported） | Fail（reported） | Pass | Pass |  |

## 2) 复制验收项（每项必须记录 Pass/Fail）

前置：准备一个可滚屏的终端输出（建议连续输出至少 3 屏）。

### 2.1 长按选择一段终端输出并复制（原生选择 / 或 Copy UI）

结论（用于对比）：
- Baseline：Fail（reported）
- Target：Pass

Steps：
1. 在终端输出区域长按一段文本（不要点到输入框）。
2. 尝试拖拽调整选择范围（若出现选择柄）。
3. 触发复制：优先使用系统 Copy 菜单；若无系统菜单，则使用产品提供的 Copy 按钮（如有）。
4. 切换到外部输入框（例如浏览器地址栏/页面内普通 input）粘贴。

Pass：
- 可选中连续文本（范围可控）；复制后外部粘贴文本与所选一致。

Fail（常见表现）：
- 无法出现选择范围/选择柄；或复制为空；或复制内容与所选不一致。

### 2.2 清空选择后复制入口消失/不可用

结论（用于对比）：
- Baseline：Fail（reported）
- Target：Pass

Steps：
1. 完成一次选择后，点击空白处/按 Esc（如适用）清空选择。
2. 观察复制入口（系统菜单或 Copy 按钮）是否消失或不可触发。

Pass：
- 选择清空后，复制入口不应长期悬挂/误触发。

### 2.3 复制失败反馈（受 iOS Clipboard 限制时的降级）

结论（用于对比）：
- Baseline：Fail（reported）
- Target：Pass

Steps：
1. 在网络权限/剪贴板权限受限环境尝试复制（或通过无授权浏览器模拟）。
2. 观察是否有可感知的失败反馈（toast/haptic/提示文案等）。

Pass：
- 失败时有明确反馈；不会默默失败让用户误以为已复制。

## 3) 滚动验收项（每项必须记录 Pass/Fail）

### 3.1 输出区上下滑动可滚动，且支持惯性滚动

结论（用于对比）：
- Baseline：Fail（reported）
- Target：Pass

Steps：
1. 在终端输出区域做缓慢上下滑动。
2. 在终端输出区域做快速甩动（fling）并观察是否存在惯性滚动。

Pass：
- 输出区域 scrollTop 发生变化；快速滑动有惯性；滚动时不应被当成点击/输入导致焦点异常频繁变化。

### 3.2 键盘弹出时滚动仍可用（尤其 iOS VisualViewport 场景）

结论（用于对比）：
- Baseline：Fail（reported）
- Target：Pass

Steps：
1. 点击终端输入区域使键盘弹出。
2. 在键盘弹出状态下，在终端输出区域重复 3.1 的滑动与甩动。

Pass：
- 键盘弹出后仍可滚动，且不明显退化（不出现“只能轻微拖动/无惯性/跳动”）。

### 3.3 到顶/到底时不发生页面穿透滚动

结论（用于对比）：
- Baseline：Fail（reported）
- Target：Pass

Steps：
1. 将终端输出滚到最顶/最底。
2. 继续向上/向下滑动，观察页面整体是否被拖动（穿透滚动）。

Pass：
- 终端到边界后不会把页面整体拖走（或至少行为符合产品预期）。

## 4) 证据与签字（用于复核/回归对比）

- 录屏/截图（至少 1 个）：`docs/public/assets/mobile-terminal-copy-scroll/placeholder.svg`（请替换为真实证据文件）
- 记录人/签字：`<name>` / 日期：`YYYY-MM-DD`

## 5) 回归记录（MTERM-050）

高风险项（建议在回归记录里重点关注并附证据）：
- **焦点/输入**：点击输入区域是否稳定聚焦、是否会因滚动/选择导致异常丢焦
- **键盘遮挡**：键盘弹出时内容区高度/布局是否正确、快速键是否被遮挡
- **滚动穿透**：滚到边界继续滑动是否把页面整体拖动（scroll chaining）

本轮相关改动（用于回归对照）：
- Copy UI 由 xterm selection 驱动：`6b7711e`
- VisualViewport offsetTop 补偿避免 transform：`b2e9aa8`

| 环境 | 键盘状态 | 复制 | 滚动（含惯性） | **输入/焦点** | 快速键 | 结果 | 证据 |
|---|---|---|---|---|---|---|---|
| iOS Safari | 收起 | TBD | TBD | TBD | TBD | TBD | `<link>` |
| iOS Safari | 弹出 | TBD | TBD | TBD | TBD | TBD | `<link>` |
| Android Chrome | 收起 | TBD | TBD | TBD | TBD | TBD | `<link>` |
| Android Chrome | 弹出 | TBD | TBD | TBD | TBD | TBD | `<link>` |
