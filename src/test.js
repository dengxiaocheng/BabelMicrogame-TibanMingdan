const { describe, it } = require('node:test');
const assert = require('node:assert');
const { PHASE, createState, settleRound, maxResentment } = require('./main.js');
const { pickEvent, applyEvent, EVENTS } = require('./content/events');
const {
  getFatigueFlavor, getResentmentFlavor, getQuotaFlavor, getRiskFlavor,
  getWorkerReaction, getPreviewFlavor, getSettlementDetail,
  getResentmentEdgeText, OUTCOME_NARRATION,
} = require('./content/flavor');

// ─── State Structure ───
describe('createState', () => {
  it('has all Direction Lock required states', () => {
    const st = createState();
    assert.equal(typeof st.quota, 'number', 'missing quota');
    assert.equal(typeof st.job_risk, 'number', 'missing job_risk');
    assert.ok(st.resentment && typeof st.resentment === 'object', 'missing resentment');
  });

  it('has fatigue on each worker', () => {
    const st = createState();
    for (const w of st.workers) {
      assert.equal(typeof w.fatigue, 'number', `${w.name} missing fatigue`);
    }
  });

  it('has shift assignments with danger', () => {
    const st = createState();
    assert.equal(st.shifts.length, 3);
    for (const s of st.shifts) {
      assert.equal(typeof s.danger, 'number');
      assert.equal(s.assignedId, null);
    }
  });

  it('provides 4 workers', () => {
    const st = createState();
    assert.equal(st.workers.length, 4);
  });
});

// ─── Phase Constants ───
describe('PHASE', () => {
  it('covers the full core loop', () => {
    assert.ok(PHASE.VIEW);
    assert.ok(PHASE.ASSIGN);
    assert.ok(PHASE.PREVIEW);
    assert.ok(PHASE.CONFIRM);
    assert.ok(PHASE.SETTLE);
  });
});

// ─── maxResentment helper ───
describe('maxResentment', () => {
  it('returns 0 for empty resentment', () => {
    assert.equal(maxResentment(createState()), 0);
  });

  it('returns max value from network', () => {
    const st = createState();
    st.resentment = { '1-2': 10, '1-3': 25, '2-3': 5 };
    assert.equal(maxResentment(st), 25);
  });
});

// ─── Settlement: Quota (Survival Pressure) ───
describe('settleRound — quota', () => {
  it('reduces quota by skill*5 for assigned workers', () => {
    const st = createState();
    st.shifts[0].assignedId = 1; // 老王 skill=3 → -15
    const prev = st.quota;
    settleRound(st);
    assert.equal(st.quota, prev - 15);
  });

  it('reduces quota contribution when worker fatigued (fatigue >= 50)', () => {
    const st = createState();
    st.workers[0].fatigue = 50;
    st.shifts[0].assignedId = 1; // 老王 skill=3, base=15, reduced=9
    const prev = st.quota;
    settleRound(st);
    assert.equal(st.quota, prev - 9);
  });

  it('returns quota_met when quota <= 0 after contributions', () => {
    const st = createState();
    st.quota = 10;
    st.shifts[0].assignedId = 1; // skill=3 → 15 > 10
    assert.equal(settleRound(st), 'quota_met');
  });

  it('returns ok when quota not met but no crash', () => {
    const st = createState();
    st.shifts[0].assignedId = 1; // -15, quota stays at 10
    assert.equal(settleRound(st), 'ok');
  });
});

// ─── Settlement: Fatigue (Survival Pressure) ───
describe('settleRound — fatigue', () => {
  it('adds fatigue based on shift danger (danger * 10)', () => {
    const st = createState();
    st.shifts[2].assignedId = 1; // 夜班 danger=3 → +30
    settleRound(st);
    assert.equal(st.workers[0].fatigue, 30);
  });

  it('spreads fatigue to other workers when >= 40 (diffusion)', () => {
    const st = createState();
    st.workers[0].fatigue = 35; // +30 = 65 >= 40 → spread
    st.shifts[2].assignedId = 1;
    settleRound(st);
    // spread = floor(65 * 0.1) = 6
    assert.ok(st.workers[1].fatigue >= 20 + 6, '小李 should gain spread fatigue');
    assert.ok(st.workers[2].fatigue >= 10 + 6, '阿强 should gain spread fatigue');
  });

  it('returns fatigue_crash when any worker fatigue >= 80', () => {
    const st = createState();
    st.workers[0].fatigue = 75;
    st.shifts[0].assignedId = 1; // danger=1 → +10 = 85
    assert.equal(settleRound(st), 'fatigue_crash');
  });
});

// ─── Settlement: Job Risk (Risk Pressure) ───
describe('settleRound — job_risk', () => {
  it('accumulates job_risk from dangerous shifts (danger * 3)', () => {
    const st = createState();
    st.shifts[1].assignedId = 2; // 白班B danger=2 → +6
    settleRound(st);
    assert.equal(st.job_risk, 6);
  });

  it('returns risk_crash when job_risk >= 100', () => {
    const st = createState();
    st.job_risk = 94;
    st.shifts[2].assignedId = 1; // danger=3 → +9 = 103
    assert.equal(settleRound(st), 'risk_crash');
  });
});

// ─── Settlement: Resentment (Risk Pressure) ───
describe('settleRound — resentment', () => {
  it('assigned workers resent idle workers (inequality)', () => {
    const st = createState();
    st.shifts[2].assignedId = 1; // 老王 → 夜班 danger=3, others idle
    settleRound(st);
    // 老王 resents 小李(2), 阿强(3), 大刘(4): +3*3=9 each
    assert.equal(st.resentment['1-2'], 9);
    assert.equal(st.resentment['1-3'], 9);
    assert.equal(st.resentment['1-4'], 9);
  });

  it('high-danger assigned resents low-danger assigned (unfairness)', () => {
    const st = createState();
    st.shifts[2].assignedId = 1; // 老王 → 夜班 danger=3
    st.shifts[0].assignedId = 2; // 小李 → 白班A danger=1
    settleRound(st);
    // diff=2, 老王 resents 小李: +2*2=4
    assert.ok(st.resentment['1-2'] >= 4);
  });

  it('returns resentment_crash when any pair >= 50', () => {
    const st = createState();
    st.resentment = { '1-2': 45 };
    st.shifts[2].assignedId = 1; // 老王 resents idle 小李: +9 → 54
    assert.equal(settleRound(st), 'resentment_crash');
  });
});

// ─── Settlement: Dual Pressure ───
describe('settleRound — dual pressure', () => {
  it('every assignment affects both quota (survival) and job_risk (risk)', () => {
    const st = createState();
    const prevQuota = st.quota;
    const prevRisk = st.job_risk;
    st.shifts[0].assignedId = 1;
    settleRound(st);
    assert.ok(st.quota < prevQuota, 'quota should decrease (survival)');
    assert.ok(st.job_risk > prevRisk, 'job_risk should increase (risk)');
  });

  it('empty shifts create quota pressure AND resentment pressure', () => {
    const st = createState();
    st.shifts[0].assignedId = 1; // only one assigned, 2 empty
    settleRound(st);
    assert.ok(st.quota > 0, 'quota should remain (survival pressure)');
    assert.ok(maxResentment(st) > 0, 'resentment should build (risk pressure)');
  });

  it('fatigue diffusion links survival (fatigue) to relationship (spread)', () => {
    const st = createState();
    st.workers[0].fatigue = 35;
    st.shifts[2].assignedId = 1; // danger=3 → fatigue 65, spreads 6
    settleRound(st);
    const anySpread = st.workers.some(w => {
      if (w.id === 1) return false;
      const base = w.id === 2 ? 20 : w.id === 3 ? 10 : 5;
      return w.fatigue > base;
    });
    assert.ok(anySpread, 'fatigue should spread to other workers');
  });
});

// ─── Round Progression ───
describe('settleRound — round', () => {
  it('increments round', () => {
    const st = createState();
    settleRound(st);
    assert.equal(st.round, 2);
  });
});

// ═══════════════════════════════════════════════════
// Integration: state + content + full loop
// ═══════════════════════════════════════════════════

// ─── Event Integration ───
describe('integration — events', () => {
  it('pickEvent returns null before round 2', () => {
    const st = createState();
    assert.equal(pickEvent(st), null);
  });

  it('pickEvent returns an event when round >= 2 and conditions met', () => {
    const st = createState();
    st.round = 2;
    const ev = pickEvent(st);
    // May or may not find one depending on conditions, but should not throw
    assert.ok(ev === null || typeof ev.text === 'function');
  });

  it('applyEvent mutates state and returns narrative text', () => {
    const st = createState();
    st.round = 3;
    // Force heatwave (no target, always eligible at round 3-6)
    const heatwave = EVENTS.find(e => e.id === 'heatwave');
    const text = applyEvent(st, heatwave);
    assert.equal(typeof text, 'string');
    assert.ok(text.length > 0, 'event should produce narrative text');
    assert.ok(st.workers.every(w => w.fatigue >= 8), 'heatwave adds fatigue to all');
  });

  it('event application preserves state invariants', () => {
    const st = createState();
    st.round = 3;
    const ev = pickEvent(st);
    if (ev) {
      applyEvent(st, ev);
      assert.ok(st.quota >= 0);
      assert.ok(st.round === 3, 'applyEvent should not change round');
    }
  });
});

// ─── Flavor Integration ───
describe('integration — flavor', () => {
  it('getWorkerReaction returns text for fatigued worker', () => {
    const st = createState();
    st.workers[0].fatigue = 60;
    st.shifts[0].assignedId = 1;
    const reaction = getWorkerReaction(st.workers[0], st);
    assert.ok(typeof reaction === 'string', 'should return reaction text');
  });

  it('getPreviewFlavor returns actionable lines', () => {
    const st = createState();
    const lines = getPreviewFlavor(st.workers[0], st.shifts[2], st);
    assert.ok(Array.isArray(lines));
    assert.ok(lines.length >= 3, 'should show contribution, fatigue, risk');
  });

  it('getSettlementDetail produces narration for each outcome', () => {
    for (const outcome of ['ok', 'quota_met', 'fatigue_crash', 'resentment_crash', 'risk_crash']) {
      const st = createState();
      const detail = getSettlementDetail(outcome, st);
      assert.ok(detail.narration.length > 0, `${outcome} should have narration`);
      assert.ok(Array.isArray(detail.warnings), `${outcome} should have warnings array`);
    }
  });

  it('OUTCOME_NARRATION covers all game-ending outcomes', () => {
    for (const key of ['fatigue_crash', 'resentment_crash', 'risk_crash']) {
      assert.ok(OUTCOME_NARRATION[key], `${key} missing narration`);
    }
  });

  it('flavor tiers match crash thresholds', () => {
    // fatigue crash at 80 → should be in critical or crash tier
    const f = getFatigueFlavor(80);
    assert.ok(f.tone === 'critical' || f.tone === 'crash', '80 fatigue should be critical/crash');
    // resentment crash at 50
    const r = getResentmentFlavor(50);
    assert.ok(r.tone === 'critical', '50 resentment should be critical');
    // risk crash at 100
    const k = getRiskFlavor(100);
    assert.ok(k.tone === 'critical', '100 risk should be critical');
  });
});

// ─── Full Multi-Round Loop ───
describe('integration — full loop', () => {
  it('can complete a full round: assign → settle → event → next round', () => {
    const st = createState();
    // Round 1: assign 2 workers
    st.shifts[0].assignedId = 1; // 老王 → 白班A
    st.shifts[1].assignedId = 2; // 小李 → 白班B
    const outcome = settleRound(st);
    assert.equal(st.round, 2);
    assert.ok(['ok', 'quota_met'].includes(outcome), 'should not crash with safe assignments');

    // Trigger event for round 2
    const ev = pickEvent(st);
    if (ev) applyEvent(st, ev);

    // Round 2: assign again
    st.shifts[0].assignedId = 3; // 阿强 → 白班A
    st.shifts[1].assignedId = 4; // 大刘 → 白班B
    const outcome2 = settleRound(st);
    assert.equal(st.round, 3);
    assert.ok(typeof outcome2 === 'string');
  });

  it('fatigue crash ends the game (not ok)', () => {
    const st = createState();
    st.workers[0].fatigue = 75;
    st.shifts[0].assignedId = 1; // danger=1 → +10 = 85 → crash
    const outcome = settleRound(st);
    assert.equal(outcome, 'fatigue_crash');
    // Verify settlement detail works for this outcome
    const detail = getSettlementDetail(outcome, st);
    assert.ok(detail.narration.includes('倒下'));
  });

  it('resentment crash ends the game', () => {
    const st = createState();
    st.resentment = { '1-2': 45 };
    st.shifts[2].assignedId = 1; // 老王 resents idle 小李: +9 → 54
    const outcome = settleRound(st);
    assert.equal(outcome, 'resentment_crash');
    const detail = getSettlementDetail(outcome, st);
    assert.ok(detail.narration.includes('举报'));
  });

  it('risk crash ends the game', () => {
    const st = createState();
    st.job_risk = 94;
    st.shifts[2].assignedId = 1; // danger=3 → +9 = 103
    const outcome = settleRound(st);
    assert.equal(outcome, 'risk_crash');
    const detail = getSettlementDetail(outcome, st);
    assert.ok(detail.narration.includes('事故'));
  });

  it('quota met is a valid ending', () => {
    const st = createState();
    st.quota = 10;
    st.shifts[0].assignedId = 1; // skill=3 → 15 > 10
    const outcome = settleRound(st);
    assert.equal(outcome, 'quota_met');
    const detail = getSettlementDetail(outcome, st);
    assert.ok(detail.narration.length > 0);
  });

  it('dual pressure: assignments reduce quota AND increase risk simultaneously', () => {
    const st = createState();
    const prevQ = st.quota;
    const prevR = st.job_risk;
    st.shifts[0].assignedId = 1;
    st.shifts[1].assignedId = 2;
    settleRound(st);
    assert.ok(st.quota < prevQ, 'quota decreased (survival)');
    assert.ok(st.job_risk > prevR, 'risk increased (risk)');
  });
});
