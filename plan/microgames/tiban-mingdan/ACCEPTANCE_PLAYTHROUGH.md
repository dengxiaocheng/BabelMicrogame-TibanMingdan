# ACCEPTANCE_PLAYTHROUGH: 替班名单

## Minimum Playable Script

### 前置：初始化
- 系统生成 6 名工人（A–F），初始 fatigue 随机 0–3，各有特长
- 生成 4 个岗位槽（焊工/搬运/质检/喷涂），job_risk 分别为 2/3/1/4
- 班次 1 quota 目标：40%

### Step 1: 查看工人状态
- **操作**: 无（自动显示）
- **预期**: 首屏显示 6 张工人卡 + 4 个空岗位槽 + quota 目标 40%
- **通过**: 玩家能读出每个工人的 fatigue 值和特长，能看到岗位 job_risk

### Step 2: 拖入第一个工人
- **操作**: 拖工人 A 到岗位槽"焊工"(job_risk=2)
- **预期**: 工人 A 卡移到焊工槽内；预览面板显示 quota 贡献 +X%，fatigue +2
- **通过**: 拖入后预览面板即时更新，数据可追溯到 state

### Step 3: 拖入更多工人（触发冲突可见）
- **操作**: 依次拖工人 B→搬运(risk=3)，C→质检(risk=1)，D→喷涂(risk=4)
- **预期**: 预览面板显示总 quota 预估；D 因喷涂 risk=4 fatigue 增量较大（若原 fatigue=3，新值=7 → 黄色）
- **通过**: 玩家能看到 quota 预估与 fatigue 的冲突

### Step 4: 调整排班（验证撤回/交换）
- **操作**: 把工人 D 从喷涂拖回卡片区，换工人 E 到喷涂
- **预期**: 预览面板更新，E 的 fatigue 增量替代 D 的
- **通过**: 拖回和交换功能正常

### Step 5: 确认排班
- **操作**: 所有岗位已填满 → 点击确认
- **预期**: 结算动画；state 更新（每工人 fatigue += job_risk）；quota 达成值显示；shift → resolved
- **通过**: 结算结果与预览一致（允许随机事件小幅偏差）

### Step 6: 检查失败条件
- **预期**: 系统检查 fatigue=10 → 崩溃；resentment≥10 → 举报；quota 未达标 → 警告
- **通过**: 如触发失败条件，正确中断并显示结局

### Step 7: 进入下一班次
- **预期**: 班次 2 开始，quota 目标升至 55%，引入怨恨网络
- **通过**: 班次递进正确，state 从上一班次继承

## Direction Gate
- integration worker 必须让 Step 1–7 完整可试玩
- qa worker 必须用自动化测试覆盖 Step 2–6 的 state 变化
- 如试玩要求需要偏离 Direction Lock，停止并回交 manager
