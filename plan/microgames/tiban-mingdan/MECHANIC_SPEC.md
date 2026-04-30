# MECHANIC_SPEC: 替班名单

## Primary Mechanic

- mechanic: 拖卡排班 + 疲劳扩散 + 怨恨网络
- primary_input: 拖动工人卡到岗位槽并查看工分/疲劳/怨恨预览
- minimum_interaction: 玩家必须把至少两名工人拖入不同岗位槽，确认前看到 quota 与 fatigue/resentment 的冲突

## Mechanic Steps

1. 查看工人疲劳和关系
2. 拖卡到岗位槽
3. 预览 quota/job_risk/fatigue/resentment
4. 确认 shift 并结算崩溃或举报

## State Coupling

每次有效操作必须同时推动两类后果：

- 生存/资源/进度压力：从 Required State 中选择至少一个直接变化
- 关系/风险/秩序压力：从 Required State 中选择至少一个直接变化

## Not A Choice List

- 不能只展示 2-4 个文字按钮让玩家选择
- UI worker 必须把 primary input 映射到场景对象操作
- integration worker 必须让这个操作进入状态结算，而不是只写叙事反馈
