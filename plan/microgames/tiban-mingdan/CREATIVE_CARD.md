# CREATIVE_CARD: 替班名单

- slug: `tiban-mingdan`
- creative_line: 替班名单
- target_runtime: web
- target_minutes: 20
- core_emotion: 拖卡排班 + 疲劳扩散 + 怨恨网络
- core_loop: 查看工人状态 -> 拖到岗位 -> 预览工分/疲劳 -> 确认排班 -> 结算崩溃/举报
- failure_condition: 关键状态崩溃，或在本轮主循环中被系统淘汰
- success_condition: 在限定时长内完成主循环，并稳定进入至少一个可结算结局

## Intent

- 做一个 Babel 相关的单创意线微游戏
- 只保留一个主循环，不扩成大项目
- 让 Claude worker 能按固定 packet 稳定并行
