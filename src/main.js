/**
 * 替班名单 — 最小主循环入口
 * Core Loop: 查看工人状态 -> 拖到岗位 -> 预览工分/疲劳 -> 确认排班 -> 结算崩溃/举报
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
    resource: 50,     // 工分/资源
    pressure: 0,      // 压力
    risk: 0,          // 风险
    relation: 50,     // 关系
    phase: PHASE.VIEW,
    selectedWorkerId: null,
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
    `资源: <span>${state.resource}</span>`,
    `压力: <span>${state.pressure}</span>`,
    `风险: <span>${state.risk}</span>`,
    `关系: <span>${state.relation}</span>`,
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
    return `<div class="worker-card${sel}" data-wid="${w.id}">
      <div class="name">${w.name}${tag}</div>
      <div class="info">疲劳 ${w.fatigue} | 技能 ${w.skill}</div>
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
    const gain = w.skill * 5;
    const fatigueGain = s.danger * 10;
    return `<div>${s.name}: ${w.name} → 工分 +${gain} / 疲劳 +${fatigueGain}</div>`;
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
function settleRound(st) {
  st.shifts.forEach(s => {
    if (!s.assignedId) return;
    const w = st.workers.find(x => x.id === s.assignedId);
    const gain = w.skill * 5;
    const fatigueGain = s.danger * 10;
    st.resource += gain;
    w.fatigue += fatigueGain;
    if (w.fatigue >= 50) {
      st.pressure += 10;
      st.risk += 5;
    }
    st.risk += s.danger * 2;
  });
  const emptyCount = st.shifts.filter(s => s.assignedId === null).length;
  st.relation -= emptyCount * 5;
  const anyCrash = st.workers.some(w => w.alive && w.fatigue >= 80);
  st.round += 1;
  let outcome = 'ok';
  if (anyCrash) outcome = 'fatigue_crash';
  if (st.relation <= 0) outcome = 'relation_crash';
  if (st.risk >= 100) outcome = 'risk_crash';
  return outcome;
}

const OUTCOME_LABEL = {
  ok: '本轮完成',
  fatigue_crash: '⚠ 工人疲劳崩溃!',
  relation_crash: '⚠ 关系崩溃!',
  risk_crash: '⚠ 风险过高，被系统淘汰!',
};

function settle() {
  const outcome = settleRound(state);
  state.phase = PHASE.SETTLE;
  const label = OUTCOME_LABEL[outcome] || outcome;
  settlePanel().innerHTML = `
    <h2>${label}</h2>
    <div class="result">资源: ${state.resource}</div>
    <div class="result">压力: ${state.pressure}</div>
    <div class="result">风险: ${state.risk}</div>
    <div class="result">关系: ${state.relation}</div>
    <div class="result">疲劳: ${state.workers.map(w => `${w.name}(${w.fatigue})`).join(' ')}</div>
    <button class="btn-primary" id="btn-next-round">下一轮</button>
  `;
  settleOverlay().classList.add('show');
  render();
}

function nextRound() {
  // Reset assignments for new round
  state.shifts.forEach(s => s.assignedId = null);
  state.selectedWorkerId = null;
  settleOverlay().classList.remove('show');
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
    // Unassign if clicking an assigned slot with no worker selected
    const shift = state.shifts.find(s => s.id === sid);
    if (shift) { shift.assignedId = null; render(); }
    return;
  }
  const shift = state.shifts.find(s => s.id === sid);
  if (!shift) return;
  // Remove worker from any other shift
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

// Browser init / Node.js export
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
} else if (typeof module !== 'undefined') {
  module.exports = { PHASE, createState, settleRound };
}
