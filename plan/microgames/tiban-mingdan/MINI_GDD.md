# MINI_GDD: 替班名单

## Scope
- runtime: web
- duration: ~20 min（4 班次）
- project_line: 替班名单
- single_core_loop: 查看工人状态 → 拖到岗位 → 预览工分/疲劳 → 确认排班 → 结算崩溃/举报

## 20 分钟节奏（4 班次）

| 班次 | 时长 | 引入要素 | quota 目标 |
|------|------|---------|-----------|
| 1 | 5 min | 基础拖卡排班、疲劳结算 | 40% |
| 2 | 5 min | 怨恨网络：替换工人增加怨恨 | 55% |
| 3 | 5 min | 病号 + 危险岗（job_risk ≥ 3） | 65% |
| 4 | 5 min | 工头指定名单：必须排特定工人 | 75% |

## 工人 & 岗位

- 工人：6 人，各有初始 fatigue（0–3 随机）、特长（影响 quota 贡献倍率）
- 岗位：4 个岗位槽，各有 job_risk 等级（1–4）
- 每班次：玩家从工人池中拖人填满所有岗位槽

## Core Loop（单班次）

1. **查看**：显示所有工人 fatigue、怨恨关系、岗位 job_risk
2. **拖卡**：拖工人卡到岗位槽，触发预览
3. **预览**：实时显示该安排下的 quota 预估、fatigue 增量、resentment 变化
4. **确认**：锁定排班，进入结算
5. **结算**：
   - 每个岗位按工人特长 + fatigue 计算 quota 贡献
   - fatigue += job_risk（疲劳叠加岗位危险）
   - 被替换的工人对替换者 resentment += 1
   - 检查崩溃/举报阈值 → 如触发则进入结局

## State

- quota: 当前班次目标百分比（每班次递增）
- fatigue: 每工人 0–10
- job_risk: 每岗位 0–5
- resentment: 每工人对 0–10
- shift: pending / confirmed / resolved

## UI
- 主界面：工人卡片区（左）+ 岗位槽区（右）+ 预览面板（底部）
- 结果反馈：结算动画 + 状态变化高亮
- 结算入口：班次结算 → 下一班次或结局

## Content
- 事件池：每班次 0–1 个随机事件（病号、工头突击、工具损坏）
- 事件只影响 state，不改变核心循环
- 一次只验证一条 Babel 创意线

## Constraints
- 总体规模 ≤ 5000 行
- 单 worker 服从 packet budget
- 如需扩线，交回 manager
