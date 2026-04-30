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
  [PHASE.VIEW]:    '📋 查看工人状态',
  [PHASE.ASSIGN]:  '👆 选择工人，点击岗位安排替班',
  [PHASE.PREVIEW]: '👀 预览本次排班效果',
  [PHASE.CONFIRM]: '✅ 确认或重排',
  [PHASE.SETTLE]:  '📊 结算',
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
  statusBar().innerHTML = [
    `配额: <span>${state.quota}</span>`,
    `岗位风险: <span>${state.job_risk}</span>`,
    `最高怨恨: <span>${maxResentment(state)}</span>`,
    `轮次: <span>${state.round}</span>`,
  ].map(s => `<div class="stat">${s}</div>`).join('');
}

function renderPhaseLabel() {
  phaseLabel().textContent = PHASE_LABELS[state.phase] || '';
}

function renderWorkers() {
  workerList().innerHTML = state.workers.map(w => {
    const sel = w.id === state.selectedWorkerId ? ' selected' : '';
    const assigned = state.shifts.find(s => s.assignedId === w.id);
    const tag = assigned ? ` → ${assigned.name}` : '';
    let fatLabel = w.fatigue;
    if (contentFlavor) {
      const f = contentFlavor.getFatigueFlavor(w.fatigue);
      fatLabel = `${w.fatigue} (${f.label})`;
    }
    let reaction = '';
    if (contentFlavor) {
      const r = contentFlavor.getWorkerReaction(w, state);
      if (r) reaction = `<div class="reaction" style="font-size:11px;color:#c90;">${r}</div>`;
    }
    return `<div class="worker-card${sel}" data-wid="${w.id}">
      <div class="name">${w.name}${tag}</div>
      <div class="info">疲劳 ${fatLabel} | 技能 ${w.skill}</div>
      ${reaction}
    </div>`;
  }).join('');
}

function renderShifts() {
  shiftList().innerHTML = state.shifts.map(s => {
    const w = s.assignedId ? state.workers.find(x => x.id === s.assignedId) : null;
    const cls = w ? ' assigned' : '';
    const inner = w
      ? `<div class="label">${s.name} (危险 ${s.danger})</div><div class="assigned-worker">▸ ${w.name}</div>`
      : `<div class="label">${s.name} (危险 ${s.danger})</div><div style="color:#555;font-size:11px;">空岗</div>`;
    return `<div class="shift-slot${cls}" data-sid="${s.id}">${inner}</div>`;
  }).join('');
}

function renderPreview() {
  if (state.phase !== PHASE.PREVIEW) {
    previewPanel().innerHTML = '';
    return;
  }
  const lines = state.shifts.map(s => {
    if (!s.assignedId) return `<div>${s.name}: 空岗 — 无工分</div>`;
    const w = state.workers.find(x => x.id === s.assignedId);
    if (contentFlavor) {
      const fl = contentFlavor.getPreviewFlavor(w, s, state);
      return `<div><b>${s.name}: ${w.name}</b><br>${fl.join('<br>')}</div>`;
    }
    const base = w.skill * 5;
    const gain = w.fatigue >= 50 ? Math.max(1, Math.floor(base * 0.6)) : base;
    const fatigueGain = s.danger * 10;
    const riskGain = s.danger * 3;
    return `<div>${s.name}: ${w.name} → 工分 ${gain} / 疲劳 +${fatigueGain} / 风险 +${riskGain}</div>`;
  });
  previewPanel().innerHTML = '<b>预览:</b>' + lines.join('');
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
    statusBar().insertAdjacentHTML('afterend', `<div class="event-banner" style="padding:6px 10px;background:#2a1a00;color:#fa0;font-size:13px;">${state.currentEvent}</div>`);
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
  quota_met: '✓ 配额达成!',
  fatigue_crash: '⚠ 工人疲劳崩溃!',
  resentment_crash: '⚠ 怨恨爆发，工人举报!',
  risk_crash: '⚠ 岗位风险过高，被系统淘汰!',
};

function settle() {
  const outcome = settleRound(state);
  state.phase = PHASE.SETTLE;
  const label = OUTCOME_LABEL[outcome] || outcome;
  let narration = '';
  if (contentFlavor) {
    const d = contentFlavor.getSettlementDetail(outcome, state);
    narration = `<div style="color:#ccc;margin:8px 0;">${d.narration}</div>` +
      d.warnings.map(w => `<div style="color:#c90;font-size:12px;">⚠ ${w}</div>`).join('');
  }
  settlePanel().innerHTML = `
    <h2>${label}</h2>
    ${narration}
    <div class="result">配额剩余: ${state.quota}</div>
    <div class="result">岗位风险: ${state.job_risk}</div>
    <div class="result">最高怨恨: ${maxResentment(state)}</div>
    <div class="result">疲劳: ${state.workers.map(w => `${w.name}(${w.fatigue})`).join(' ')}</div>
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

// ─── Interaction: Worker Selection & Shift Assignment ───
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

// ─── Init ───
function init() {
  document.addEventListener('click', (e) => {
    onWorkerClick(e);
    onShiftClick(e);
    onActionClick(e);
  });
  render();
}

// ─── Content Integration (optional, graceful fallback) ───
let contentEvents, contentFlavor;
try {
  contentEvents = require('./content/events');
  contentFlavor = require('./content/flavor');
} catch (e) { contentEvents = contentFlavor = null; }

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
