# SCENE_INTERACTION_SPEC: 替班名单

## Scene Objects

- 工人卡
- 岗位槽
- 工分表
- 疲劳标记
- 怨恨连线

## Player Input

- primary_input: 拖动工人卡到岗位槽并查看工分/疲劳/怨恨预览
- minimum_interaction: 玩家必须把至少两名工人拖入不同岗位槽，确认前看到 quota 与 fatigue/resentment 的冲突

## Feedback Channels

- 岗位收益预览
- 疲劳增量
- 怨恨连线变色
- quota 达成提示

## Forbidden UI

- 不允许只用“让 A 上班/让 B 休息”按钮
- 不允许做公司排班系统

## Acceptance Rule

- 首屏必须让玩家看到至少一个可直接操作的场景对象
- 玩家操作必须产生即时可见反馈，且反馈能追溯到 Required State
- 不得只靠随机事件文本或普通选择按钮完成主循环
