# MINI_GDD: 替班名单

## Scope

- runtime: web
- duration: 20min
- project_line: 替班名单
- single_core_loop: 查看工人状态 -> 拖到岗位 -> 预览工分/疲劳 -> 确认排班 -> 结算崩溃/举报

## Core Loop
1. 执行核心循环：查看工人状态 -> 拖到岗位 -> 预览工分/疲劳 -> 确认排班 -> 结算崩溃/举报
2. 按 20 分钟节奏推进：基础排班 -> 关系影响 -> 病号和危险岗 -> 工头指定名单

## State

- quota
- fatigue
- job_risk
- resentment
- shift

## UI

- 只保留主界面、结果反馈、结算入口
- 不加多余菜单和后台页

## Content

- 用小型事件池支撑主循环
- 一次只验证一条 Babel 创意线

## Constraints

- 总体规模目标控制在 5000 行以内
- 单个 worker 任务必须服从 packet budget
- 如需扩线，交回 manager 重新拆
