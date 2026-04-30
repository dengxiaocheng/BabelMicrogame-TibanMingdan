# TASK_BREAKDOWN: 替班名单

## Standard Worker Bundle

1. `tiban-mingdan-foundation`
   - lane: foundation
   - level: M
   - goal: 建立只服务「查看工人状态 -> 拖到岗位 -> 预览工分/疲劳 -> 确认排班 -> 结算崩溃/举报」的可运行骨架

2. `tiban-mingdan-state`
   - lane: logic
   - level: M
   - goal: 实现 Direction Lock 状态的一次分配/操作结算

3. `tiban-mingdan-content`
   - lane: content
   - level: M
   - goal: 用事件池强化「拖卡排班 + 疲劳扩散 + 怨恨网络」

4. `tiban-mingdan-ui`
   - lane: ui
   - level: M
   - goal: 让玩家看见核心压力、可选操作和后果反馈

5. `tiban-mingdan-integration`
   - lane: integration
   - level: M
   - goal: 把已有 state/content/ui 接成单一主循环

6. `tiban-mingdan-qa`
   - lane: qa
   - level: S
   - goal: 用测试和 scripted playthrough 确认方向没跑偏
