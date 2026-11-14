/* =========================================================
   «Почему плачет?» — три источника:
   1) звук: модель, обученная на открытом наборе Donate-a-Cry
      (поверх признаков YAMNet);
   2) время: дневник кормлений, сна, подгузников;
   3) опыт с вашим ребёнком: после плача вы отмечаете, что помогло,
      и приложение запоминает, как звучит именно её плач.
   ========================================================= */

export const REASONS = {
  hungry: { name: 'Голод',                  emoji: '🍼', tip: 'Предложите грудь или бутылочку' },
  belly:  { name: 'Животик / боль',         emoji: '😣', tip: 'Тёплая пелёнка на живот, «велосипед» ножками, выкладывание на живот' },
  burp:   { name: 'Нужно срыгнуть',         emoji: '💨', tip: 'Подержите столбиком 5–10 минут' },
  diaper: { name: 'Подгузник',              emoji: '🧷', tip: 'Проверьте и смените подгузник' },
  temp:   { name: 'Жарко / холодно',        emoji: '🌡️', tip: 'Потрогайте шею или спинку: должна быть тёплой, но не влажной' },
  tired:  { name: 'Устала, хочет спать',    emoji: '😴', tip: 'Приглушите свет, укачайте, белый шум' },
  hold:   { name: 'Хочет на ручки',         emoji: '🤗', tip: 'Возьмите на руки, прижмите к себе' },
};
export const REASON_KEYS = Object.keys(REASONS);

// классы набора Donate-a-Cry → наши причины
const BASE_MAP = {
  hungry: { hungry: 1 },
  belly_pain: { belly: 1 },
  burping: { burp: 1 },
  tired: { tired: 1 },
  discomfort: { diaper: 0.4, temp: 0.3, hold: 0.3 },
};

let baseModel = null;
export async function loadBaseModel(url) {
  try { baseModel = await (await fetch(url)).json(); } catch (e) { console.warn('cry model', e); }
}

/* ---------- векторы ---------- */
export function meanEmbedding(list) {
  if (!list.length) return null;
  const d = list[0].length, m = new Float32Array(d);
  for (const v of list) for (let i = 0; i < d; i++) m[i] += v[i];
  let n = 0; for (let i = 0; i < d; i++) n += m[i] * m[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < d; i++) m[i] /= n;
  return m;
}
// хранение в компактном виде (int8)
export const packEmb = (v) => Array.from(v, (x) => Math.max(-127, Math.min(127, Math.round(x * 127 * 4))));
export const unpackEmb = (a) => Float32Array.from(a, (x) => x / (127 * 4));

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
function softmax(obj, temp = 1) {
  const keys = Object.keys(obj), mx = Math.max(...keys.map((k) => obj[k]));
  const ex = {}; let s = 0;
  for (const k of keys) { ex[k] = Math.exp((obj[k] - mx) / temp); s += ex[k]; }
  for (const k of keys) ex[k] /= s;
  return ex;
}
function normalize(p) {
  let s = 0; for (const k of REASON_KEYS) s += p[k] || 0;
  const out = {}; for (const k of REASON_KEYS) out[k] = (p[k] || 0) / (s || 1);
  return out;
}

/* 1) по звуку */
function fromSound(emb) {
  if (!baseModel || !emb) return null;
  const logits = {};
  baseModel.classes.forEach((c, i) => { logits[c] = dot(baseModel.W[i], emb) + baseModel.b[i]; });
  const pc = softmax(logits);
  const p = {};
  for (const [c, prob] of Object.entries(pc)) for (const [r, w] of Object.entries(BASE_MAP[c] || {})) p[r] = (p[r] || 0) + prob * w;
  // мягкое сглаживание: модель обучена на чужих детях и данных мало
  for (const k of REASON_KEYS) p[k] = 0.5 * (p[k] || 0) + 0.5 / REASON_KEYS.length;
  return normalize(p);
}

/* 3) по опыту с вашим ребёнком: похожесть на прошлые отмеченные эпизоды */
function fromPersonal(emb, examples) {
  if (!emb || !examples.length) return null;
  const sims = {};
  for (const ex of examples) {
    const s = dot(emb, ex.emb);
    (sims[ex.reason] = sims[ex.reason] || []).push(s);
  }
  const score = {}, known = [];
  for (const k of REASON_KEYS) {
    const arr = (sims[k] || []).sort((a, b) => b - a).slice(0, 3);
    if (arr.length) { score[k] = arr.reduce((a, b) => a + b, 0) / arr.length; known.push(score[k]); }
  }
  // причины без отметок — нейтральны (среднее), а не «невозможны»
  const neutral = known.reduce((a, b) => a + b, 0) / known.length;
  for (const k of REASON_KEYS) if (score[k] == null) score[k] = neutral;
  return softmax(score, 0.04);
}

/* 2) по времени */
function fromContext(ctx) {
  const f = {}; for (const k of REASON_KEYS) f[k] = 1;
  const why = [];
  const m = (t) => (t == null ? null : (ctx.now - t) / 60000);
  const feed = m(ctx.feed), diaper = m(ctx.diaper), wake = m(ctx.wake), sleep = m(ctx.sleep);

  if (feed != null) {
    if (feed >= 120) { f.hungry *= 3.5; why.push(`с кормления ${fmt(feed)}`); }
    else if (feed >= 90) { f.hungry *= 2; why.push(`с кормления ${fmt(feed)}`); }
    else if (feed <= 45) { f.hungry *= 0.35; f.burp *= feed <= 30 ? 2.5 : 1.6; f.belly *= 1.3; why.push(`ела ${fmt(feed)} назад`); }
  }
  if (diaper != null) {
    if (diaper >= 150) { f.diaper *= 2.5; why.push(`подгузник ${fmt(diaper)} назад`); }
    else if (diaper >= 90) f.diaper *= 1.5;
    else if (diaper <= 20) f.diaper *= 0.3;
  }
  const awake = wake != null && (sleep == null || ctx.wake > ctx.sleep);
  if (awake && wake >= 50) { f.tired *= wake >= 90 ? 3.5 : 2.3; why.push(`не спит ${fmt(wake)}`); }
  if (ctx.tummySounds) { f.belly *= 1.8; f.burp *= 1.5; why.push('недавно икота/газики'); }
  const h = new Date(ctx.now).getHours();
  if (h >= 18 && h <= 23) f.belly *= 1.3; // колики чаще вечером
  return { f, why };
}

function fmt(min) {
  min = Math.round(min);
  return min < 60 ? `${min} мин` : `${Math.floor(min / 60)} ч ${min % 60} мин`;
}

/**
 * Итоговая оценка причин.
 * emb — признаки текущего плача (или null), examples — [{emb, reason}], ctx — дневник.
 */
export function predict(emb, examples, ctx) {
  const sound = fromSound(emb);
  const personal = fromPersonal(emb, examples);
  const { f, why } = fromContext(ctx);

  // чем больше отмеченных примеров, тем больше веры опыту с вашим ребёнком
  const kinds = new Set(examples.map((e) => e.reason)).size;
  const wP = personal ? Math.min(0.85, examples.length / 20) * (kinds >= 2 ? 1 : 0.3) : 0;
  const wS = sound ? 1 - wP : 0;

  const p = {};
  for (const k of REASON_KEYS) {
    const prior = (k === 'hungry' ? 1.6 : k === 'hold' ? 1.1 : 1); // самое частое у новорождённых — голод
    let v = prior * f[k];
    if (sound) v *= Math.pow(sound[k] * REASON_KEYS.length, wS);
    if (personal && wP) v *= Math.pow(personal[k] * REASON_KEYS.length, wP);
    p[k] = v;
  }
  const probs = normalize(p);
  const ranked = REASON_KEYS.map((k) => ({ key: k, p: probs[k], ...REASONS[k] })).sort((a, b) => b.p - a.p);
  return {
    ranked,
    sources: { sound: !!sound, personalN: examples.length, personalWeight: wP, why },
  };
}
