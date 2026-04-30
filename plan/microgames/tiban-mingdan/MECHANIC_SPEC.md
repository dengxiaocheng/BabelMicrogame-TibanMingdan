# MECHANIC_SPEC: 替班名单

## Primary Mechanic
- mechanic: 拖卡排班 + 疲劳扩散 + 怨恨网络
- primary_input: 拖动工人卡到岗位槽并查看工分/疲劳/怨恨预览
- minimum_interaction: 玩家必须把至少两名工人拖入不同岗位槽，确认前看到 quota 与 fatigue/resentment 的冲突

## Mechanic Steps

### Step 1: 查看工人状态
- 显示每个工人的：名字、fatigue 值（0–10）、特长、当前怨恨关系
- 疲劳 ≥ 6 黄色警告，≥ 8 红色警告
- 怨恨 ≥ 6 关系线变黄，≥ 8 变红

### Step 2: 拖卡到岗位槽
- 玩家从工人卡片区拖一张工人卡到某个空岗位槽
- 岗位槽显示 job_risk 等级（用颜色/星星表示）
- 同一工人不能重复填入多个岗位
- 拖入时即时触发预览计算

### Step 3: 预览（核心决策点）
预览面板实时显示当前排班方案的预期结果：
- **quota 预估** = Σ(工人特长匹配度 × max(1, 10 - fatigue)) / 目标值 × 100%
- **fatigue 增量**：每个被排工人 fatigue += job_risk(该岗位)
- **resentment 变化**：被替换的工人（上一班次在此岗位的工人）对当前工人 resentment += 1

预览颜色标示：
- 某工人 fatigue 将达 ≥ 8：红色
- 某工人对 resentment 将达 ≥ 8：红色
- quota 不足目标：橙色

### Step 4: 确认排班
- 所有岗位槽填满后，确认按钮激活
- 点击确认 → shift 变为 confirmed
- 进入结算阶段

### Step 5: 结算
按 Step 3 预览的实际值更新 state：
1. quota 实际达成：≥ 目标则通过
2. fatigue 按公式增加
3. resentment 按规则增加
4. 随机事件修正（如有）

检查失败条件：
- 任意 fatigue = 10 → 崩溃事件
- 任意 resentment ≥ 10 → 举报事件
- quota 未达标 → 警告（连续未达标则失败）

shift 变为 resolved → 进入下一班次或结局

## State Coupling Rule
每次有效操作必须同时推动两类后果：
1. 生存/资源/进度压力：quota 或 fatigue 变化
2. 关系/风险/秩序压力：job_risk 或 resentment 变化

## Not A Choice List
- 不能只展示 2–4 个文字按钮让玩家选择
- UI worker 必须把 primary input 映射到场景对象操作（拖卡）
- integration worker 必须让操作进入状态结算，不是只写叙事反馈
