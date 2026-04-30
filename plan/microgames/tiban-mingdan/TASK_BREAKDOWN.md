# TASK_BREAKDOWN: 替班名单

## Worker Dependency Graph

```
foundation → state → content → ui → integration → qa
                     ↗           ↗
               state ──────────→ integration
```

## Worker Bundles

### 1. tiban-mingdan-foundation
- **lane**: foundation
- **level**: M
- **goal**: 建立可运行骨架：工人数据结构 + 岗位数据结构 + 空拖拽占位
- **deliverables**:
  - 工人数据模型（id, name, fatigue 0–10, specialty, position）
  - 岗位数据模型（id, name, job_risk 0–5）
  - 首屏渲染：工人卡片区 + 岗位槽区（静态占位）
  - 基础拖拽骨架（drag source / drop target 事件绑定）
- **acceptance**: 首屏显示工人卡和岗位槽，拖工人卡到岗位槽能触发 console.log
- **anti-drift**: 不做疲劳公式，不做怨恨逻辑，不做结算。只做数据结构和渲染骨架
- **serves**: 为 state/content/ui worker 提供可挂载的数据和 DOM 结构

### 2. tiban-mingdan-state
- **lane**: logic
- **level**: M
- **goal**: 实现核心状态的一次分配和结算
- **deliverables**:
  - quota 计算函数：Σ(特长匹配度 × max(1, 10 - fatigue)) / 目标 × 100%
  - fatigue 增量函数：fatigue += job_risk
  - resentment 增量函数：被替换工人 resentment += 1
  - 结算函数：执行上述更新 + 检查阈值（fatigue=10 → 崩溃，resentment≥10 → 举报）
  - 单元测试覆盖所有公式
- **acceptance**: 给定工人和岗位输入，结算函数输出正确的 quota/fatigue/resentment 新值
- **anti-drift**: 不做 UI，不做事件池，不做动画。纯状态逻辑 + 测试
- **serves**: 为 ui/content/integration worker 提供可调用的状态结算 API

### 3. tiban-mingdan-content
- **lane**: content
- **level**: M
- **goal**: 用事件池和工人/岗位设定强化核心循环
- **deliverables**:
  - 6 名工人设定（名字、特长、初始 fatigue）
  - 4 个岗位设定（名字、job_risk）
  - 4 班次 quota 递增表（40% → 55% → 65% → 75%）
  - 事件池（5–8 个）：病号（fatigue+=2）、工头指定（必须排某工人）、工具损坏（job_risk 临时+1）
  - 事件触发规则：每班次随机 0–1 个事件
- **acceptance**: 事件数据可被 state worker 的结算函数正确消费
- **anti-drift**: 不做 UI，不做状态逻辑修改。只提供数据
- **serves**: 为 ui worker 提供展示内容，为 integration worker 提供完整游戏配置

### 4. tiban-mingdan-ui
- **lane**: ui
- **level**: M
- **goal**: 实现拖卡交互和预览面板，让玩家看见压力和反馈
- **deliverables**:
  - 工人卡渲染：显示 fatigue 值、特长、颜色状态指示
  - 岗位槽渲染：显示 job_risk、已填工人
  - 拖拽交互：drag/drop 事件处理，拖回、交换逻辑
  - 预览面板：quota 进度条、fatigue 增量列表、resentment 变化
  - 确认按钮：岗位全满时激活
  - 结算反馈动画：状态变化高亮
- **acceptance**: 玩家能拖工人卡到岗位槽，预览面板实时显示 quota/fatigue/resentment 变化
- **anti-drift**: 不自创状态公式，调用 state worker 提供的 API。不做事件逻辑
- **serves**: 为 integration worker 提供完整可交互 UI

### 5. tiban-mingdan-integration
- **lane**: integration
- **level**: M
- **goal**: 接成 4 班次完整主循环
- **deliverables**:
  - 班次管理器：控制 pending → confirmed → resolved 流转
  - 将 state 结算函数接入 UI 交互
  - 事件池集成：每班次开始时随机抽事件
  - 失败检测：崩溃/举报/连续未达标 → 结局
  - 结局画面：良好/一般/失败三种
- **acceptance**: ACCEPTANCE_PLAYTHROUGH 的 Step 1–7 完整可试玩
- **anti-drift**: 不改状态公式，不新增 UI 组件，不新增事件类型。只做接线
- **serves**: 为 qa worker 提供可测试的完整游戏流程

### 6. tiban-mingdan-qa
- **lane**: qa
- **level**: S
- **goal**: 用测试和脚本试玩确认方向没跑偏
- **deliverables**:
  - 自动化测试：覆盖 ACCEPTANCE_PLAYTHROUGH 的关键 state 变化
  - 手工试玩记录：按脚本执行并截图/记录结果
  - 方向检查清单：对照 Direction Lock 逐项确认
- **acceptance**: 所有自动化测试通过；手工试玩能完成 4 班次完整流程
- **anti-drift**: 不改代码，只报告问题。发现问题交回 manager
- **serves**: 确认产出符合 Direction Lock

## Primary Input 服务映射

每个 worker 如何服务「拖动工人卡到岗位槽并查看工分/疲劳/怨恨预览」：

| Worker | 对 primary input 的贡献 |
|--------|------------------------|
| foundation | 提供工人卡和岗位槽的 DOM 结构和拖拽事件绑定 |
| state | 提供 quota/fatigue/resentment 的预览计算和结算函数 |
| content | 提供工人特长和岗位 risk 数据，让预览有内容可显示 |
| ui | 实现拖拽视觉反馈和预览面板渲染 |
| integration | 把拖拽 → 预览 → 确认 → 结算接成完整流程 |
| qa | 验证整个 primary input 链路从拖拽到结算的正确性 |
