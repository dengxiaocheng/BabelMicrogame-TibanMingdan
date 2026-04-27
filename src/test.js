const { describe, it } = require('node:test');
const assert = require('node:assert');
const { PHASE, createState, settleRound } = require('./main.js');

// ─── State Structure ───
describe('createState', () => {
  it('has all required state fields', () => {
    const st = createState();
    for (const key of ['resource', 'pressure', 'risk', 'relation', 'round']) {
      assert.equal(typeof st[key], 'number', `missing or invalid: ${key}`);
    }
  });

  it('provides 4 workers and 3 shifts', () => {
    const st = createState();
    assert.equal(st.workers.length, 4);
    assert.equal(st.shifts.length, 3);
  });

  it('workers have id, name, fatigue, skill, alive', () => {
    const st = createState();
    for (const w of st.workers) {
      assert.ok(w.id);
      assert.ok(w.name);
      assert.equal(typeof w.fatigue, 'number');
      assert.equal(typeof w.skill, 'number');
      assert.equal(w.alive, true);
    }
  });

  it('shifts have id, name, danger, assignedId', () => {
    const st = createState();
    for (const s of st.shifts) {
      assert.ok(s.id);
      assert.ok(s.name);
      assert.equal(typeof s.danger, 'number');
      assert.equal(s.assignedId, null);
    }
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

// ─── Settlement Logic ───
describe('settleRound', () => {
  it('gains resource from assigned workers (skill * 5)', () => {
    const st = createState();
    st.shifts[0].assignedId = 1; // 老王 skill=3 → +15
    const prev = st.resource;
    settleRound(st);
    assert.equal(st.resource, prev + 15);
  });

  it('adds fatigue based on shift danger (danger * 10)', () => {
    const st = createState();
    st.shifts[2].assignedId = 1; // 夜班 danger=3 → +30
    settleRound(st);
    assert.equal(st.workers[0].fatigue, 30);
  });

  it('penalizes relation for empty shifts (-5 each)', () => {
    const st = createState();
    settleRound(st);
    assert.equal(st.relation, 50 - 3 * 5); // 35
  });

  it('increases risk from shift danger (danger * 2)', () => {
    const st = createState();
    st.shifts[1].assignedId = 2; // 白班B danger=2 → risk +4
    settleRound(st);
    assert.ok(st.risk >= 4);
  });

  it('adds pressure and risk when fatigue >= 50', () => {
    const st = createState();
    st.workers[0].fatigue = 45;
    st.shifts[2].assignedId = 1; // 夜班 danger=3 → +30 fatigue = 75 ≥ 50
    settleRound(st);
    assert.ok(st.pressure > 0);
    assert.ok(st.risk > 6); // base 6 from danger + 5 from fatigue
  });

  it('returns ok for a normal round', () => {
    const st = createState();
    st.shifts[0].assignedId = 1;
    assert.equal(settleRound(st), 'ok');
  });

  it('detects fatigue crash (fatigue >= 80)', () => {
    const st = createState();
    st.workers[0].fatigue = 75;
    st.shifts[0].assignedId = 1; // danger=1 → +10 = 85
    const outcome = settleRound(st);
    assert.equal(outcome, 'fatigue_crash');
  });

  it('detects relation crash (relation <= 0)', () => {
    const st = createState();
    st.relation = 5;
    // All shifts empty → -15, relation = -10
    assert.equal(settleRound(st), 'relation_crash');
  });

  it('detects risk crash (risk >= 100)', () => {
    const st = createState();
    st.risk = 96;
    st.shifts[2].assignedId = 1; // danger=3 → +6 = 102
    assert.equal(settleRound(st), 'risk_crash');
  });

  it('increments round', () => {
    const st = createState();
    settleRound(st);
    assert.equal(st.round, 2);
  });
});
