// 替班名单 — 状态反馈文本 (疲劳标记 + 工人反应 + 预览 + 结算叙述)

const FATIGUE_TIERS = [
  { max: 15, label: '状态正常',  tone: 'ok' },
  { max: 30, label: '有些疲惫',  tone: 'warn',      hint: '还可以撑一轮' },
  { max: 50, label: '明显疲劳',  tone: 'danger',    hint: '工作效率下降' },
  { max: 70, label: '接近极限',  tone: 'critical',  hint: '随时可能倒下' },
  { max: 100, label: '崩溃边缘', tone: 'crash',     hint: '不能再排班了' },
];

function getFatigueFlavor(fatigue) {
  for (const tier of FATIGUE_TIERS) {
    if (fatigue <= tier.max) return tier;
  }
  return FATIGUE_TIERS[FATIGUE_TIERS.length - 1];
}

const RESENTMENT_TIERS = [
  { max: 10, label: '还过得去', tone: 'ok' },
  { max: 20, label: '有了隔阂', tone: 'warn' },
  { max: 35, label: '明显不和', tone: 'danger' },
  { max: 50, label: '积怨已深', tone: 'critical' },
];

function getResentmentFlavor(value) {
  for (const tier of RESENTMENT_TIERS) {
    if (value <= tier.max) return tier;
  }
  return RESENTMENT_TIERS[RESENTMENT_TIERS.length - 1];
}

function getQuotaFlavor(quota, round) {
  const expected = 20 + (round - 1) * 5;
  if (quota <= 0) return { label: '配额达成', tone: 'ok' };
  if (quota <= expected * 0.4) return { label: '快达标了', tone: 'warn' };
  if (quota <= expected) return { label: '配额压力', tone: 'danger' };
  return { label: '配额吃紧', tone: 'critical' };
}

const RISK_TIERS = [
  { max: 20, label: '安全', tone: 'ok' },
  { max: 50, label: '有隐患', tone: 'warn' },
  { max: 80, label: '危险', tone: 'danger' },
  { max: 100, label: '高危', tone: 'critical' },
];

function getRiskFlavor(risk) {
  for (const tier of RISK_TIERS) {
    if (risk <= tier.max) return tier;
  }
  return RISK_TIERS[RISK_TIERS.length - 1];
}

// 工人反应 (Worker Card)

function getWorkerReaction(worker, state) {
  if (!worker.alive) return null;

  const fatigue = getFatigueFlavor(worker.fatigue);
  const assignedShift = state.shifts.find(s => s.assignedId === worker.id);

  const resentmentEntries = Object.entries(state.resentment)
    .filter(([key]) => key.startsWith(`${worker.id}-`) || key.endsWith(`-${worker.id}`));
  const maxWorkerResent = resentmentEntries.length > 0
    ? Math.max(...resentmentEntries.map(([, v]) => v)) : 0;
  const resentment = getResentmentFlavor(maxWorkerResent);

  if (fatigue.tone === 'crash')
    return `${worker.name}已经站不稳了。`;
  if (fatigue.tone === 'critical' && assignedShift)
    return `${worker.name}咬着牙说："我能撑。"但你看到他的手在抖。`;
  if (resentment.tone === 'critical') {
    const entry = resentmentEntries.find(([, v]) => v >= 35);
    if (entry) {
      const [a, b] = entry[0].split('-').map(Number);
      const otherId = a === worker.id ? b : a;
      const other = state.workers.find(w => w.id === otherId);
      return `${worker.name}瞪了${other?.name || '某人'}一眼，没有说话。`;
    }
  }
  if (assignedShift && assignedShift.danger >= 3)
    return `${worker.name}深吸一口气，走向车间深处。`;
  if (fatigue.tone === 'danger')
    return `${worker.name}揉了揉肩膀，没说什么。`;
  if (!assignedShift)
    return `${worker.name}在旁边等着。`;
  return null;
}

// 预览反馈

function getPreviewFlavor(worker, shift, state) {
  const lines = [];

  const base = worker.skill * 5;
  const contribution = worker.fatigue >= 50 ? Math.max(1, Math.floor(base * 0.6)) : base;
  const fatigueGain = shift.danger * 10;
  const riskGain = shift.danger * 3;

  lines.push(`工分 +${contribution}${worker.fatigue >= 50 ? ' (疲劳减产)' : ''}`);
  lines.push(`疲劳 +${fatigueGain}`);
  lines.push(`风险 +${riskGain}`);

  const newFatigue = worker.fatigue + fatigueGain;
  if (newFatigue >= 80) {
    lines.push(`⚠ ${worker.name}将崩溃!`);
  } else if (newFatigue >= 40) {
    lines.push(`⚠ 疲劳将扩散给其他人`);
  }

  const assignedShifts = state.shifts.filter(s => s.assignedId !== null && s.id !== shift.id);
  for (const other of assignedShifts) {
    const diff = shift.danger - other.danger;
    if (Math.abs(diff) >= 1) {
      const otherWorker = state.workers.find(w => w.id === other.assignedId);
      if (otherWorker) {
        const who = diff > 0 ? worker.name : otherWorker.name;
        lines.push(`⚠ ${who}会觉得不公平`);
      }
    }
  }

  return lines;
}

// 结算叙述

const OUTCOME_NARRATION = {
  ok: '本轮结束了。配额还差得远，明天还要继续。',
  quota_met: '配额达标了。但工人们的脸色，不是数字能衡量的。',
  fatigue_crash: '有人倒下了。车间里安静了一瞬，然后工头叫人把他抬走。排班还得继续。',
  resentment_crash: '终于有人忍不了了。不是当面爆发——是一封举报信，悄悄地递了上去。',
  risk_crash: '事故发生了。检查组来了，名单被翻了底朝天。所有人的排班记录都摊在桌上。',
};

function getSettlementDetail(outcome, state) {
  const warnings = [];

  for (const w of state.workers) {
    if (!w.alive) continue;
    const f = getFatigueFlavor(w.fatigue);
    if (f.tone === 'critical' || f.tone === 'crash') {
      warnings.push(`${w.name}：${f.label} (${w.fatigue})`);
    }
  }

  for (const [key, val] of Object.entries(state.resentment)) {
    if (val >= 25) {
      const [a, b] = key.split('-').map(Number);
      const wa = state.workers.find(w => w.id === a);
      const wb = state.workers.find(w => w.id === b);
      const f = getResentmentFlavor(val);
      warnings.push(`${wa?.name}→${wb?.name}：${f.label} (${val})`);
    }
  }

  return {
    narration: OUTCOME_NARRATION[outcome] || '',
    warnings,
  };
}

// 怨恨连线描述

function getResentmentEdgeText(fromId, toId, value, state) {
  const from = state.workers.find(w => w.id === fromId);
  const to = state.workers.find(w => w.id === toId);
  const flavor = getResentmentFlavor(value);

  const texts = {
    ok: `${from?.name}和${to?.name}之间没什么问题。`,
    warn: `${from?.name}看${to?.name}的眼神变了。`,
    danger: `${from?.name}开始躲着${to?.name}走。`,
    critical: `${from?.name}和${to?.name}之间，只差一个导火索。`,
  };

  return texts[flavor.tone] || texts.ok;
}

if (typeof module !== 'undefined') {
  module.exports = {
    FATIGUE_TIERS, RESENTMENT_TIERS, RISK_TIERS,
    getFatigueFlavor, getResentmentFlavor, getQuotaFlavor, getRiskFlavor,
    getWorkerReaction, getPreviewFlavor, getSettlementDetail,
    getResentmentEdgeText, OUTCOME_NARRATION,
  };
}
