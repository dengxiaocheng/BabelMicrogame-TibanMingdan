# ACCEPTANCE_PLAYTHROUGH: 替班名单

## Scripted Playthrough
1. 开局显示 resource / pressure / risk / relation / round
2. 玩家执行一次核心操作：查看工人状态 -> 拖到岗位 -> 预览工分/疲劳 -> 确认排班 -> 结算崩溃/举报
3. 系统必须反馈一个资源或身体压力变化
4. 系统必须反馈一个关系或风险变化

## Direction Gate
- integration worker 必须让这个流程可试玩
- qa worker 必须用测试或手工记录验证这个流程
- 如试玩要求需要偏离 Direction Lock，停止并回交 manager
