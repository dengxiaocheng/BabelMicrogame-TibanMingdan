// 替班名单 — 事件池 (dual-pressure: 每个事件推动生存+关系两类压力)

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function workerName(st, id) {
  return st.workers.find(w => w.id === id)?.name || '???';
}

// ─── 事件定义 ───
// emotion 标记该事件主要服务的核心情绪
// dual 类型事件同时推动两类压力

const EVENTS = [
  // 疲劳扩散
  {
    id: 'sleepless',
    emotion: 'fatigue',
    roundMin: 2, roundMax: 3,
    condition: (st) => st.workers.some(w => w.alive && w.fatigue < 20),
    pickTarget: (st) => pick(st.workers.filter(w => w.alive && w.fatigue < 20)).id,
    text: (st, tid) =>
      `${workerName(st, tid)}整夜没合眼，眼眶下面挂着青黑色的影子。今天这班，怕是不好上。`,
    apply: (st, tid) => {
      st.workers.find(w => w.id === tid).fatigue += 15;
    },
  },
  {
    id: 'fever',
    emotion: 'fatigue',
    roundMin: 3, roundMax: 5,
    condition: (st) => st.workers.some(w => w.alive && w.fatigue < 40),
    pickTarget: (st) => pick(st.workers.filter(w => w.alive && w.fatigue < 40)).id,
    text: (st, tid) =>
      `${workerName(st, tid)}用手撑着墙站起来，额头滚烫。没人能替，但身体已经不答应了。`,
    apply: (st, tid) => {
      st.workers.find(w => w.id === tid).fatigue += 25;
    },
  },
  {
    id: 'heatwave',
    emotion: 'fatigue',
    roundMin: 3, roundMax: 6,
    condition: () => true,
    pickTarget: () => null,
    text: () =>
      '车间闷得像蒸笼。空气粘稠得让人喘不过气，每多待一刻，就多一分危险。',
    apply: (st) => {
      st.workers.forEach(w => { if (w.alive) w.fatigue += 8; });
    },
  },

  // 怨恨网络
  {
    id: 'gossip',
    emotion: 'resentment',
    roundMin: 2, roundMax: 4,
    condition: (st) => Object.keys(st.resentment).length > 0,
    pickTarget: (st) => pick(Object.keys(st.resentment)),
    text: (st, key) => {
      const [a, b] = key.split('-').map(Number);
      return `你路过走廊，听到${workerName(st, a)}在跟${workerName(st, b)}嘀咕："凭什么总是我们干最累的活？"`;
    },
    apply: (st, key) => {
      st.resentment[key] = (st.resentment[key] || 0) + 8;
    },
  },
  {
    id: 'favoritism',
    emotion: 'resentment',
    roundMin: 3, roundMax: 6,
    condition: (st) => {
      const fatigues = st.workers.filter(w => w.alive).map(w => w.fatigue);
      return Math.max(...fatigues) - Math.min(...fatigues) > 20;
    },
    pickTarget: (st) => {
      const alive = st.workers.filter(w => w.alive);
      alive.sort((a, b) => a.fatigue - b.fatigue);
      return alive[0].id;
    },
    text: (st, tid) => {
      const others = st.workers.filter(w => w.alive && w.id !== tid);
      return `${others.map(w => w.name).join('和')}注意到${workerName(st, tid)}总是被派到最轻松的岗位。眼神里藏着说不出口的不满。`;
    },
    apply: (st, tid) => {
      for (const w of st.workers) {
        if (w.alive && w.id !== tid) {
          const key = `${w.id}-${tid}`;
          st.resentment[key] = (st.resentment[key] || 0) + 6;
        }
      }
    },
  },
  {
    id: 'stand_together',
    emotion: 'resentment',
    roundMin: 4, roundMax: 7,
    condition: (st) => Object.values(st.resentment).some(v => v >= 15),
    pickTarget: (st) => {
      let maxKey = null, maxVal = 0;
      for (const [k, v] of Object.entries(st.resentment)) {
        if (v > maxVal) { maxKey = k; maxVal = v; }
      }
      return maxKey;
    },
    text: (st, key) => {
      const [a] = key.split('-').map(Number);
      return `${workerName(st, a)}低声说："再这样下去，不如一起不干了。"几个人沉默着，但眼神已经交换了默契。`;
    },
    apply: (st, key) => {
      const [a, b] = key.split('-').map(Number);
      st.resentment[key] = (st.resentment[key] || 0) + 12;
      for (const w of st.workers) {
        if (w.alive && w.id !== a && w.id !== b) {
          st.resentment[`${a}-${w.id}`] = (st.resentment[`${a}-${w.id}`] || 0) + 5;
          st.resentment[`${b}-${w.id}`] = (st.resentment[`${b}-${w.id}`] || 0) + 5;
        }
      }
    },
  },

  // 配额压力
  {
    id: 'quota_up',
    emotion: 'quota',
    roundMin: 3, roundMax: 6,
    condition: (st) => st.quota > 0,
    pickTarget: () => null,
    text: () =>
      '工头拍着桌子："今天再加十个工分，不然别下班。"车间里一片沉默。',
    apply: (st) => { st.quota += 10; },
  },
  {
    id: 'inspection',
    emotion: 'dual',
    roundMin: 4, roundMax: 8,
    condition: (st) => st.round >= 4,
    pickTarget: () => null,
    text: () =>
      '上面来人了。今天必须达标，而且不能出事。每个人的动作都被盯着。',
    apply: (st) => { st.quota += 8; st.job_risk += 5; },
  },

  // 岗位风险
  {
    id: 'machine_old',
    emotion: 'risk',
    roundMin: 3, roundMax: 5,
    condition: (st) => st.shifts.some(s => s.danger < 4),
    pickTarget: (st) => pick(st.shifts.filter(s => s.danger < 4)).id,
    text: (st, sid) => {
      const shift = st.shifts.find(s => s.id === sid);
      return `${shift.name}那台老机器又发出怪声了。没人敢说，但每个人都知道——今天那个岗位更危险了。`;
    },
    apply: (st, sid) => { st.shifts.find(s => s.id === sid).danger += 1; },
  },
  {
    id: 'hidden_danger',
    emotion: 'risk',
    roundMin: 5, roundMax: 8,
    condition: (st) => st.job_risk < 60,
    pickTarget: () => null,
    text: () =>
      '昨天的事故报告被压下来了。隐患没消除，所有人都假装没看见。',
    apply: (st) => { st.job_risk += 15; },
  },

  // 双重压力
  {
    id: 'injury',
    emotion: 'dual',
    roundMin: 4, roundMax: 6,
    condition: (st) => st.workers.some(w => w.alive && w.fatigue >= 30 && w.fatigue < 60),
    pickTarget: (st) => pick(st.workers.filter(w => w.alive && w.fatigue >= 30 && w.fatigue < 60)).id,
    text: (st, tid) =>
      `${workerName(st, tid)}被掉落的零件砸到了手。还好没大碍，但今天干不了重活了。少一个人，其他人要多扛。`,
    apply: (st, tid) => {
      st.workers.find(w => w.id === tid).fatigue += 20;
      for (const other of st.workers) {
        if (other.alive && other.id !== tid) {
          st.resentment[`${other.id}-${tid}`] = (st.resentment[`${other.id}-${tid}`] || 0) + 4;
        }
      }
    },
  },
  {
    id: 'boss_order',
    emotion: 'dual',
    roundMin: 5, roundMax: 8,
    condition: (st) => st.workers.some(w => w.alive),
    pickTarget: (st) => {
      const alive = st.workers.filter(w => w.alive);
      alive.sort((a, b) => b.skill - a.skill);
      return alive[0].id;
    },
    text: (st, tid) =>
      `工头指着排班表："今晚${workerName(st, tid)}必须上夜班，没得商量。"没人敢吱声。`,
    apply: (st, tid) => {
      const nightShift = st.shifts.reduce((a, b) => a.danger > b.danger ? a : b);
      nightShift.assignedId = tid;
      for (const w of st.workers) {
        if (w.alive && w.id !== tid) w.fatigue += 5;
      }
    },
  },
];

/**
 * Pick the most appropriate event for the current round.
 * Priority: events that amplify the currently weakest pressure,
 * ensuring both fatigue (survival) and resentment (risk) build over time.
 */
function pickEvent(state) {
  const eligible = EVENTS.filter(e =>
    state.round >= e.roundMin &&
    state.round <= e.roundMax &&
    e.condition(state)
  );

  if (eligible.length === 0) return null;

  const maxFat = Math.max(...state.workers.filter(w => w.alive).map(w => w.fatigue));
  const maxRes = Math.max(0, ...Object.values(state.resentment));

  let priority;
  if (maxFat < 20 && maxRes < 10) {
    priority = ['fatigue', 'resentment', 'dual', 'quota', 'risk'];
  } else if (maxRes < 15) {
    priority = ['resentment', 'dual', 'fatigue', 'quota', 'risk'];
  } else if (maxFat < 40) {
    priority = ['fatigue', 'dual', 'quota', 'risk', 'resentment'];
  } else {
    priority = ['dual', 'quota', 'risk', 'fatigue', 'resentment'];
  }

  const sorted = [...eligible].sort((a, b) => {
    return priority.indexOf(a.emotion) - priority.indexOf(b.emotion);
  });

  return pick(sorted.slice(0, Math.min(2, sorted.length)));
}

/**
 * Apply event to state, return narrative text for display.
 */
function applyEvent(state, event) {
  const targetId = event.pickTarget(state);
  const text = event.text(state, targetId);
  event.apply(state, targetId);
  return text;
}

if (typeof module !== 'undefined') {
  module.exports = { EVENTS, pickEvent, applyEvent };
}
