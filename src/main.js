/**
 * 替班名单 — 核心状态与一次结算
 * Core Loop: 查看工人状态 -> 拖到岗位 -> 预览工分/疲劳 -> 确认排班 -> 结算崩溃/举报
 *
 * Required State (Direction Lock): quota, fatigue, job_risk, resentment, shift
 *
 * Dual-pressure design:
 *   Every state change simultaneously affects:
 *   - Survival/resource pressure (quota, fatigue)
 *   - Relationship/risk pressure (job_risk, resentment)
 */

// ─── Phases ───
const PHASE = {
  VIEW: 'VIEW',           // 查看工人状态
  ASSIGN: 'ASSIGN',       // 拖到岗位
  PREVIEW: 'PREVIEW',     // 预览工分/疲劳
  CONFIRM: 'CONFIRM',     // 确认排班
  SETTLE: 'SETTLE',       // 结算崩溃/举报
};

const PHASE_LABELS = {
  [PHASE.VIEW]:    '查看工人状态',
  [PHASE.ASSIGN]:  '拖动工人到岗位',
  [PHASE.PREVIEW]: '预览本次排班效果',
  [PHASE.CONFIRM]: '确认或重排',
  [PHASE.SETTLE]:  '结算',
};

// ─── Game State ───
function createState() {
  return {
    round: 1,
    phase: PHASE.VIEW,
    selectedWorkerId: null,

    // Direction Lock required states
    quota: 25,          // 配额: 本轮需要达成的工分目标
    job_risk: 0,        // 岗位风险: 累积危险作业风险 (>=100 被系统淘汰)
    currentEvent: null,  // 当前轮事件文本 (content 提供)
    resentment: {},     // 怨恨网络: "fromId-toId" -> 怨恨值 (>=50 举报爆发)
    // fatigue: per-worker (workers[].fatigue)
    // shift: assignment state (shifts[].assignedId)

    workers: [
      { id: 1, name: '老王', fatigue: 0,  skill: 3, alive: true },
      { id: 2, name: '小李', fatigue: 20, skill: 2, alive: true },
      { id: 3, name: '阿强', fatigue: 10, skill: 2, alive: true },
      { id: 4, name: '大刘', fatigue: 5,  skill: 1, alive: true },
    ],
    shifts: [
      { id: 1, name: '白班A', danger: 1, assignedId: null },
      { id: 2, name: '白班B', danger: 2, assignedId: null },
      { id: 3, name: '夜班',  danger: 3, assignedId: null },
    ],
  };
}

let state = createState();

// ─── Helpers ───
function maxResentment(st) {
  const vals = Object.values(st.resentment || {});
  return vals.length ? Math.max(...vals) : 0;
}

function fatigueColor(f) {
  if (f >= 70) return '#e94560';
  if (f >= 40) return '#f0a500';
  if (f >= 20) return '#ffd700';
  return '#4caf50';
}

function dangerColor(d) {
  if (d >= 3) return '#e94560';
  if (d >= 2) return '#f0a500';
  return '#4caf50';
}

// ─── DOM Refs ───
const $ = (sel) => document.querySelector(sel);
const statusBar   = () => $('#status-bar');
const phaseLabel   = () => $('#phase-label');
const workerList   = () => $('#worker-list');
const shiftList    = () => $('#shift-list');
const previewPanel = () => $('#preview-panel');
const actionBar    = () => $('#action-bar');
const settleOverlay = () => $('#settle-overlay');
const settlePanel  = () => $('#settle-panel');

// ─── Render Helpers ───
function renderStatusBar() {
  const quotaMax = 20 + state.round * 5;
  const quotaPct = Math.min(100, Math.max(0, (state.quota / quotaMax) * 100));
  const quotaColor = quotaPct > 60 ? '#e94560' : quotaPct > 30 ? '#f0a500' : '#4caf50';
  const riskPct = Math.min(100, state.job_risk);
  const riskColor = riskPct > 60 ? '#e94560' : riskPct > 30 ? '#f0a500' : '#4caf50';
  const maxRes = maxResentment(state);
  const resPct = Math.min(100, (maxRes / 50) * 100);
  const resColor = resPct > 60 ? '#e94560' : resPct > 30 ? '#f0a500' : '#4caf50';

  statusBar().innerHTML = `
    <div class="pressure-stat">
      <div class="stat-label">配额目标</div>
      <div class="stat-value" style="color:${quotaColor}">${state.quota}</div>
      <div class="pressure-bar"><div class="pressure-fill" style="width:${quotaPct}%;background:${quotaColor}"></div></div>
    </div>
    <div class="pressure-stat">
      <div class="stat-label">岗位风险</div>
      <div class="stat-value" style="color:${riskColor}">${state.job_risk}<span style="font-size:12px;color:#888">/100</span></div>
      <div class="pressure-bar"><div class="pressure-fill" style="width:${riskPct}%;background:${riskColor}"></div></div>
    </div>
    <div class="pressure-stat">
      <div class="stat-label">最高怨恨</div>
      <div class="stat-value" style="color:${resColor}">${maxRes}<span style="font-size:12px;color:#888">/50</span></div>
      <div class="pressure-bar"><div class="pressure-fill" style="width:${resPct}%;background:${resColor}"></div></div>
    </div>
    <div class="pressure-stat">
      <div class="stat-label">轮次</div>
      <div class="stat-value">${state.round}</div>
    </div>`;
}

function renderPhaseLabel() {
  const label = PHASE_LABELS[state.phase] || '';
  let extra = '';
  if (state.phase === PHASE.VIEW) {
    // Build pressure callout showing core shortage and worker/shift status
    const fatigued = state.workers.filter(w => w.alive && w.fatigue >= 30);
    const emptyCount = state.shifts.filter(s => s.assignedId === null).length;
    const totalSkill = state.workers.filter(w => w.alive).reduce((s, w) => s + w.skill, 0);
    const maxOutput = totalSkill * 5;
    const items = [`需要完成 <b>${state.quota}</b> 工分（全员上限 ${maxOutput}）`];
    if (fatigued.length > 0)
      items.push(`${fatigued.map(w => `${w.name}(疲劳${w.fatigue})`).join('、')} 状态不佳`);
    if (emptyCount === state.shifts.length)
      items.push(`所有 ${emptyCount} 个岗位空缺 — 点击"开始排班"拖入工人`);
    extra = `<div class="pressure-callout"><div class="callout-title">本轮压力</div>${items.map(i => `<div class="callout-item">• ${i}</div>`).join('')}</div>`;
  }
  phaseLabel().innerHTML = `<div>${label}</div>${extra}`;
}

function renderWorkers() {
  const draggable = state.phase === PHASE.ASSIGN;
  workerList().innerHTML = state.workers.map(w => {
    const sel = w.id === state.selectedWorkerId ? ' selected' : '';
    const dragCls = draggable ? ' draggable' : '';
    const dragAttr = draggable ? 'draggable="true"' : '';
    const assigned = state.shifts.find(s => s.assignedId === w.id);
    const tag = assigned ? ` → ${assigned.name}` : '';
    const fatPct = Math.min(100, w.fatigue);
    const fatCol = fatigueColor(w.fatigue);

    let fatLabel = String(w.fatigue);
    if (contentFlavor) {
      const f = contentFlavor.getFatigueFlavor(w.fatigue);
      fatLabel = `${w.fatigue} ${f.label}`;
    }
    let reaction = '';
    if (contentFlavor) {
      const r = contentFlavor.getWorkerReaction(w, state);
      if (r) reaction = `<div class="reaction">${r}</div>`;
    }

    // Resentment dots
    let resDots = '';
    const resEntries = Object.entries(state.resentment)
      .filter(([key]) => key.startsWith(`${w.id}-`) || key.endsWith(`-${w.id}`));
    if (resEntries.length > 0) {
      resDots = '<div class="resentment-row">' + resEntries.map(([, v]) => {
        const c = v >= 35 ? '#e94560' : v >= 15 ? '#f0a500' : '#4caf50';
        return `<span class="resentment-dot" style="background:${c}" title="怨恨 ${v}"></span>`;
      }).join('') + '</div>';
    }

    return `<div class="worker-card${sel}${dragCls}" data-wid="${w.id}" ${dragAttr}>
      <div class="card-header"><span class="name">${w.name}</span>${tag ? `<span class="assigned-tag">${tag}</span>` : ''}</div>
      <div class="fatigue-bar-wrap"><div class="fatigue-bar-fill" style="width:${fatPct}%;background:${fatCol}"></div></div>
      <div class="card-info">疲劳 ${fatLabel} | 技能 ${w.skill}</div>
      ${resDots}${reaction}
    </div>`;
  }).join('');
}

function renderShifts() {
  const accepting = state.phase === PHASE.ASSIGN;
  shiftList().innerHTML = state.shifts.map(s => {
    const w = s.assignedId ? state.workers.find(x => x.id === s.assignedId) : null;
    const cls = w ? ' assigned' : '';
    const dropCls = accepting ? ' droppable' : '';
    const dColor = dangerColor(s.danger);

    let inner;
    if (w) {
      inner = `<div class="slot-header">
        <span class="slot-name">${s.name}</span>
        <span class="danger-badge" style="background:${dColor}">危险 ${s.danger}</span>
      </div>
      <div class="assigned-worker">▸ ${w.name}</div>`;
    } else {
      const showWarning = state.phase === PHASE.VIEW || state.phase === PHASE.PREVIEW;
      inner = `<div class="slot-header">
        <span class="slot-name">${s.name}</span>
        <span class="danger-badge" style="background:${dColor}">危险 ${s.danger}</span>
      </div>
      <div class="drop-hint">${accepting ? '拖入工人' : '空岗'}</div>
      ${showWarning ? '<div class="empty-warning">无人值班</div>' : ''}`;
    }

    return `<div class="shift-slot${cls}${dropCls}" data-sid="${s.id}">
      ${inner}
      <div class="slot-preview" data-preview-sid="${s.id}"></div>
    </div>`;
  }).join('');
}

function renderPreview() {
  if (state.phase !== PHASE.PREVIEW) {
    previewPanel().innerHTML = '';
    return;
  }

  let totalContribution = 0;
  let totalRiskGain = 0;
  const conflicts = [];

  const lines = state.shifts.map(s => {
    if (!s.assignedId) {
      conflicts.push(`${s.name}无人 — 零产出`);
      return `<div class="preview-line empty">${s.name}: <b>空岗</b> — 无工分产出</div>`;
    }
    const w = state.workers.find(x => x.id === s.assignedId);
    const base = w.skill * 5;
    const contribution = w.fatigue >= 50 ? Math.max(1, Math.floor(base * 0.6)) : base;
    const fatigueGain = s.danger * 10;
    const riskGain = s.danger * 3;
    const newFatigue = w.fatigue + fatigueGain;

    totalContribution += contribution;
    totalRiskGain += riskGain;

    if (w.fatigue >= 50) conflicts.push(`${w.name}疲劳减产 (仅60%工分)`);
    if (newFatigue >= 80) conflicts.push(`${w.name}将崩溃! (疲劳${w.fatigue}→${newFatigue})`);
    else if (newFatigue >= 40) conflicts.push(`${w.name}疲劳将扩散给其他人`);

    // Resentment unfairness preview
    const otherAssigned = state.shifts.filter(os => os.assignedId !== null && os.id !== s.id);
    for (const other of otherAssigned) {
      const diff = s.danger - other.danger;
      if (Math.abs(diff) >= 2) {
        const otherW = state.workers.find(x => x.id === other.assignedId);
        if (otherW) conflicts.push(`${diff > 0 ? w.name : otherW.name}觉得不公平 (危险差${Math.abs(diff)})`);
      }
    }

    const warns = [];
    if (newFatigue >= 80) warns.push('<span class="preview-warn">崩溃!</span>');
    else if (newFatigue >= 40) warns.push('<span class="preview-warn">扩散</span>');
    if (w.fatigue >= 50) warns.push('<span class="preview-warn">减产</span>');

    return `<div class="preview-line">
      <b>${s.name}: ${w.name}</b>
      <span class="preview-stat">工分 +${contribution}</span>
      <span class="preview-stat">疲劳 +${fatigueGain}</span>
      <span class="preview-stat">风险 +${riskGain}</span>
      ${warns.join('')}
    </div>`;
  });

  const quotaAfter = Math.max(0, state.quota - totalContribution);
  const quotaOk = quotaAfter <= 0;
  const riskAfter = state.job_risk + totalRiskGain;

  const summaryHtml = `<div class="preview-summary">
    <span class="${quotaOk ? 'ok' : 'danger'}">配额: ${state.quota} → ${quotaAfter} ${quotaOk ? '达标' : '未达标'}</span>
    <span class="${riskAfter >= 80 ? 'danger' : ''}">风险: ${state.job_risk} → ${riskAfter}</span>
  </div>`;

  let conflictHtml = '';
  if (conflicts.length > 0) {
    conflictHtml = `<div class="conflict-panel">
      <div class="conflict-title">冲突预警</div>
      ${conflicts.map(c => `<div class="conflict-item">• ${c}</div>`).join('')}
    </div>`;
  }

  previewPanel().innerHTML = summaryHtml + lines.join('') + conflictHtml;
}

function renderActions() {
  const bar = actionBar();
  switch (state.phase) {
    case PHASE.VIEW:
      bar.innerHTML = '<button class="btn-primary" id="btn-start-assign">开始排班</button>';
      break;
    case PHASE.ASSIGN:
      bar.innerHTML = '<button class="btn-primary" id="btn-preview">预览排班</button>' +
                      '<button class="btn-secondary" id="btn-reset">重置</button>';
      break;
    case PHASE.PREVIEW:
      bar.innerHTML = '<button class="btn-primary" id="btn-confirm">确认排班</button>' +
                      '<button class="btn-secondary" id="btn-back-assign">返回修改</button>';
      break;
    case PHASE.CONFIRM:
      bar.innerHTML = '<button class="btn-primary" id="btn-settle">结算</button>';
      break;
    case PHASE.SETTLE:
      bar.innerHTML = '';
      break;
  }
}

// ─── Main Render ───
function render() {
  renderStatusBar();
  if (state.currentEvent) {
    const existing = document.querySelector('.event-banner');
    if (existing) existing.remove();
    statusBar().insertAdjacentHTML('afterend',
      `<div class="event-banner">${state.currentEvent}</div>`);
  }
  renderPhaseLabel();
  renderWorkers();
  renderShifts();
  renderPreview();
  renderActions();
}

// ─── Core Loop Phase Transitions ───
function startAssign() {
  state.phase = PHASE.ASSIGN;
  state.selectedWorkerId = null;
  render();
}

function goToPreview() {
  const anyAssigned = state.shifts.some(s => s.assignedId !== null);
  if (!anyAssigned) return;
  state.phase = PHASE.PREVIEW;
  render();
}

function backToAssign() {
  state.phase = PHASE.ASSIGN;
  render();
}

function resetAssignments() {
  state.shifts.forEach(s => s.assignedId = null);
  state.selectedWorkerId = null;
  render();
}

function confirmSchedule() {
  state.phase = PHASE.CONFIRM;
  render();
}

// ─── Pure Settlement Logic (no DOM) ───
//
// Dual-pressure: every assignment changes BOTH:
//   Survival side: quota contribution, fatigue accumulation
//   Risk side:     job_risk increase, resentment building
//
function settleRound(st) {
  const assignedIds = new Set();
  const assignments = [];

  // 1. Process assignments → quota (survival) + fatigue (survival) + job_risk (risk)
  for (const s of st.shifts) {
    if (!s.assignedId) continue;
    const w = st.workers.find(x => x.id === s.assignedId);
    if (!w || !w.alive) continue;

    assignedIds.add(w.id);
    assignments.push({ worker: w, shift: s });

    // Survival: quota contribution (fatigued workers produce 60%)
    const base = w.skill * 5;
    const contribution = w.fatigue >= 50 ? Math.max(1, Math.floor(base * 0.6)) : base;
    st.quota = Math.max(0, st.quota - contribution);

    // Survival: fatigue accumulation
    w.fatigue += s.danger * 10;

    // Risk: job risk from dangerous assignments
    st.job_risk += s.danger * 3;
  }

  // 2. Identify idle workers
  const idleWorkers = st.workers.filter(w => w.alive && !assignedIds.has(w.id));

  // 3. Risk: resentment — assigned resents idle (inequality pressure)
  for (const { worker: aw, shift: as } of assignments) {
    for (const iw of idleWorkers) {
      const key = `${aw.id}-${iw.id}`;
      st.resentment[key] = (st.resentment[key] || 0) + as.danger * 3;
    }
  }

  // 4. Risk: resentment — high-danger resents low-danger (unfairness pressure)
  if (assignments.length >= 2) {
    const sorted = [...assignments].sort((a, b) => b.shift.danger - a.shift.danger);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const diff = sorted[i].shift.danger - sorted[j].shift.danger;
        if (diff > 0) {
          const key = `${sorted[i].worker.id}-${sorted[j].worker.id}`;
          st.resentment[key] = (st.resentment[key] || 0) + diff * 2;
        }
      }
    }
  }

  // 5. Survival+Risk link: fatigue diffusion
  //    High fatigue (>=40) spreads floor(fatigue*0.1) to all other alive workers
  for (const { worker: aw } of assignments) {
    if (aw.fatigue >= 40) {
      const spread = Math.floor(aw.fatigue * 0.1);
      for (const w of st.workers) {
        if (w.id !== aw.id && w.alive) {
          w.fatigue += spread;
        }
      }
    }
  }

  // 6. Check crash conditions
  let fatigueCrash = false;
  for (const w of st.workers) {
    if (w.alive && w.fatigue >= 80) {
      fatigueCrash = true;
    }
  }

  let resentmentCrash = false;
  for (const val of Object.values(st.resentment)) {
    if (val >= 50) {
      resentmentCrash = true;
      break;
    }
  }

  // 7. Advance round
  st.round += 1;

  // 8. Outcome priority: fatigue > resentment > risk > quota > ok
  if (fatigueCrash) return 'fatigue_crash';
  if (resentmentCrash) return 'resentment_crash';
  if (st.job_risk >= 100) return 'risk_crash';
  if (st.quota <= 0) return 'quota_met';
  return 'ok';
}

const OUTCOME_LABEL = {
  ok: '本轮完成 — 配额未达标',
  quota_met: '配额达成!',
  fatigue_crash: '工人疲劳崩溃!',
  resentment_crash: '怨恨爆发，工人举报!',
  risk_crash: '岗位风险过高，被系统淘汰!',
};

function settle() {
  const outcome = settleRound(state);
  state.phase = PHASE.SETTLE;
  const label = OUTCOME_LABEL[outcome] || outcome;
  let narration = '';
  if (contentFlavor) {
    const d = contentFlavor.getSettlementDetail(outcome, state);
    narration = `<div style="color:#ccc;margin:8px 0;">${d.narration}</div>` +
      d.warnings.map(w => `<div style="color:#c90;font-size:12px;">${w}</div>`).join('');
  }

  // Post-settlement fatigue bars
  const workerBars = state.workers.map(w => {
    const c = fatigueColor(w.fatigue);
    const pct = Math.min(100, w.fatigue);
    return `<div style="margin:4px 0;text-align:left;">
      <span style="font-size:12px;">${w.name} 疲劳 ${w.fatigue}</span>
      <div class="settle-bar-wrap"><div class="settle-bar-fill" style="width:${pct}%;background:${c}"></div></div>
    </div>`;
  }).join('');

  settlePanel().innerHTML = `
    <h2>${label}</h2>
    ${narration}
    <div style="margin:10px 0;">配额剩余: <b style="color:${state.quota > 0 ? '#e94560' : '#4caf50'}">${state.quota}</b></div>
    <div style="margin:10px 0;">岗位风险: <b style="color:${dangerColor(state.job_risk / 3)}">${state.job_risk}</b></div>
    <div style="margin:10px 0;">最高怨恨: <b style="color:${state.resentment ? '#f0a500' : '#4caf50'}">${maxResentment(state)}</b></div>
    ${workerBars}
    <button class="btn-primary" id="btn-next-round">下一轮</button>
  `;
  settleOverlay().classList.add('show');
  render();
}

function nextRound() {
  state.shifts.forEach(s => s.assignedId = null);
  state.selectedWorkerId = null;
  state.quota = 20 + state.round * 5;
  settleOverlay().classList.remove('show');
  triggerRoundEvent(state);
  state.phase = PHASE.VIEW;
  render();
}

// ─── Interaction: Click Selection (fallback for touch) ───
function onWorkerClick(e) {
  if (state.phase !== PHASE.ASSIGN) return;
  const card = e.target.closest('.worker-card');
  if (!card) return;
  const wid = Number(card.dataset.wid);
  state.selectedWorkerId = (state.selectedWorkerId === wid) ? null : wid;
  render();
}

function onShiftClick(e) {
  if (state.phase !== PHASE.ASSIGN) return;
  const slot = e.target.closest('.shift-slot');
  if (!slot) return;
  const sid = Number(slot.dataset.sid);
  if (state.selectedWorkerId === null) {
    const shift = state.shifts.find(s => s.id === sid);
    if (shift) { shift.assignedId = null; render(); }
    return;
  }
  const shift = state.shifts.find(s => s.id === sid);
  if (!shift) return;
  state.shifts.forEach(s => { if (s.assignedId === state.selectedWorkerId) s.assignedId = null; });
  shift.assignedId = state.selectedWorkerId;
  state.selectedWorkerId = null;
  render();
}

function onActionClick(e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.id;
  if (id === 'btn-start-assign') startAssign();
  else if (id === 'btn-preview') goToPreview();
  else if (id === 'btn-reset') resetAssignments();
  else if (id === 'btn-back-assign') backToAssign();
  else if (id === 'btn-confirm') confirmSchedule();
  else if (id === 'btn-settle') settle();
  else if (id === 'btn-next-round') nextRound();
}

// ─── Drag and Drop (Desktop) ───
let draggedWorkerId = null;

function onDragStart(e) {
  if (state.phase !== PHASE.ASSIGN) { e.preventDefault(); return; }
  const card = e.target.closest('.worker-card');
  if (!card) return;
  draggedWorkerId = Number(card.dataset.wid);
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(draggedWorkerId));
  card.classList.add('dragging');
  showDragPreviews(draggedWorkerId);
}

function onDragOver(e) {
  if (state.phase !== PHASE.ASSIGN || !draggedWorkerId) return;
  const slot = e.target.closest('.shift-slot');
  if (!slot) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  slot.classList.add('drag-over');
}

function onDragLeave(e) {
  const slot = e.target.closest('.shift-slot');
  if (slot) slot.classList.remove('drag-over');
}

function onDrop(e) {
  e.preventDefault();
  const slot = e.target.closest('.shift-slot');
  if (!slot) return;
  slot.classList.remove('drag-over');
  const sid = Number(slot.dataset.sid);
  const wid = Number(e.dataTransfer.getData('text/plain'));
  if (!wid || state.phase !== PHASE.ASSIGN) return;
  const shift = state.shifts.find(s => s.id === sid);
  if (!shift) return;
  state.shifts.forEach(s => { if (s.assignedId === wid) s.assignedId = null; });
  shift.assignedId = wid;
  clearDragPreviews();
  draggedWorkerId = null;
  render();
}

function onDragEnd() {
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  clearDragPreviews();
  draggedWorkerId = null;
}

function showDragPreviews(wid) {
  const w = state.workers.find(x => x.id === wid);
  if (!w) return;
  for (const s of state.shifts) {
    const el = document.querySelector(`[data-preview-sid="${s.id}"]`);
    if (!el) continue;
    const base = w.skill * 5;
    const contribution = w.fatigue >= 50 ? Math.max(1, Math.floor(base * 0.6)) : base;
    const fatigueGain = s.danger * 10;
    const riskGain = s.danger * 3;
    const newFatigue = w.fatigue + fatigueGain;
    let warns = [];
    if (newFatigue >= 80) warns.push('崩溃!');
    else if (newFatigue >= 40) warns.push('扩散');
    el.innerHTML = `<div class="live-preview">工分 +${contribution}${w.fatigue >= 50 ? ' (减产)' : ''} | 疲劳 +${fatigueGain} | 风险 +${riskGain}${warns.length ? ' | ' + warns.join(' ') : ''}</div>`;
  }
}

function clearDragPreviews() {
  document.querySelectorAll('.slot-preview').forEach(el => el.innerHTML = '');
}

// ─── Touch Drag (Mobile) ───
let touchDragId = null;
let touchGhost = null;

function onTouchStart(e) {
  if (state.phase !== PHASE.ASSIGN) return;
  const card = e.target.closest('.worker-card');
  if (!card || !card.classList.contains('draggable')) return;
  touchDragId = Number(card.dataset.wid);
  const rect = card.getBoundingClientRect();
  touchGhost = card.cloneNode(true);
  touchGhost.style.cssText = `position:fixed;width:${rect.width}px;opacity:0.8;pointer-events:none;z-index:1000;background:#0f3460;border:2px solid #e94560;border-radius:6px;padding:10px;font-size:13px;color:#e0e0e0;`;
  document.body.appendChild(touchGhost);
  card.classList.add('dragging');
  showDragPreviews(touchDragId);
  const touch = e.touches[0];
  touchGhost.style.left = (touch.clientX - rect.width / 2) + 'px';
  touchGhost.style.top = (touch.clientY - 30) + 'px';
}

function onTouchMove(e) {
  if (!touchDragId || !touchGhost) return;
  e.preventDefault();
  const touch = e.touches[0];
  const gw = touchGhost.offsetWidth;
  touchGhost.style.left = (touch.clientX - gw / 2) + 'px';
  touchGhost.style.top = (touch.clientY - 30) + 'px';
  document.querySelectorAll('.shift-slot.drag-over').forEach(el => el.classList.remove('drag-over'));
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  const slot = el && el.closest('.shift-slot');
  if (slot) slot.classList.add('drag-over');
}

function onTouchEnd(e) {
  if (!touchDragId) return;
  if (touchGhost) { touchGhost.remove(); touchGhost = null; }
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  const touch = e.changedTouches[0];
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  const slot = el && el.closest('.shift-slot');
  if (slot) {
    const sid = Number(slot.dataset.sid);
    const shift = state.shifts.find(s => s.id === sid);
    if (shift) {
      state.shifts.forEach(s => { if (s.assignedId === touchDragId) s.assignedId = null; });
      shift.assignedId = touchDragId;
    }
  }
  clearDragPreviews();
  touchDragId = null;
  render();
}

// ─── Init ───
function init() {
  document.addEventListener('click', (e) => {
    onWorkerClick(e);
    onShiftClick(e);
    onActionClick(e);
  });
  document.addEventListener('dragstart', onDragStart);
  document.addEventListener('dragover', onDragOver);
  document.addEventListener('dragleave', onDragLeave);
  document.addEventListener('drop', onDrop);
  document.addEventListener('dragend', onDragEnd);
  document.addEventListener('touchstart', onTouchStart, { passive: false });
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('touchend', onTouchEnd);
  render();
}

// ─── Content Integration (optional, graceful fallback) ───
let contentEvents, contentFlavor;
// Browser: detect globals from events.js / flavor.js loaded via <script>
if (typeof pickEvent === 'function') {
  contentEvents = { pickEvent, applyEvent };
  contentFlavor = { getFatigueFlavor, getResentmentFlavor, getQuotaFlavor, getRiskFlavor,
    getWorkerReaction, getPreviewFlavor, getSettlementDetail, getResentmentEdgeText };
} else if (typeof require !== 'undefined') {
  try {
    contentEvents = require('./content/events');
    contentFlavor = require('./content/flavor');
  } catch (e) { contentEvents = contentFlavor = null; }
}

function triggerRoundEvent(st) {
  if (!contentEvents) return;
  st.currentEvent = null;
  const ev = contentEvents.pickEvent(st);
  if (ev) st.currentEvent = contentEvents.applyEvent(st, ev);
}

// Browser init / Node.js export
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
} else if (typeof module !== 'undefined') {
  module.exports = { PHASE, createState, settleRound, maxResentment };
}
