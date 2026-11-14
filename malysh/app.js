import { FilesetResolver, AudioClassifier, AudioEmbedder } from './vendor/mediapipe/audio_bundle.mjs';
import { REASONS, REASON_KEYS, loadBaseModel, meanEmbedding, packEmb, unpackEmb, predict } from './reasons.js';

/* =========================================================
   Группы звуков. YAMNet знает 521 звук — собираем нужные.
   ========================================================= */
const GROUPS = {
  cry:     { name: 'Плач',            emoji: '😭', labels: ['Baby cry, infant cry', 'Crying, sobbing', 'Wail, moan', 'Screaming'] },
  whimper: { name: 'Хныканье',        emoji: '🥺', labels: ['Whimper'] },
  coo:     { name: 'Гуление',         emoji: '👶', labels: ['Babbling', 'Child speech, kid speaking'] },
  laugh:   { name: 'Смех',            emoji: '😊', labels: ['Baby laughter', 'Laughter', 'Giggle'] },
  cough:   { name: 'Кашель',          emoji: '😮‍💨', labels: ['Cough', 'Throat clearing'] },
  sneeze:  { name: 'Чихание',         emoji: '🤧', labels: ['Sneeze'] },
  hiccup:  { name: 'Икота',           emoji: '🫧', labels: ['Hiccup'] },
  burp:    { name: 'Отрыжка',         emoji: '💨', labels: ['Burping, eructation'] },
  fart:    { name: 'Газики',          emoji: '💨', labels: ['Fart'] },
  breath:  { name: 'Сопение, дыхание', emoji: '😴', labels: ['Breathing', 'Snoring', 'Snort', 'Gasp', 'Sigh'] },
  speech:  { name: 'Голоса взрослых', emoji: '🗣️', labels: ['Speech', 'Conversation', 'Narration, monologue', 'Female speech, woman speaking', 'Male speech, man speaking', 'Whispering'] },
  media:   { name: 'Музыка / ТВ',     emoji: '🎵', labels: ['Music', 'Television', 'Lullaby', 'Music for children', 'Singing'] },
  noise:   { name: 'Белый шум / техника', emoji: '🌬️', labels: ['White noise', 'Pink noise', 'Noise', 'Hum', 'Vacuum cleaner', 'Mechanical fan', 'Air conditioning', 'Hair dryer'] },
  silence: { name: 'Тишина',          emoji: '🌙', labels: ['Silence'] },
};
const LABEL_TO_GROUP = {};
for (const [g, def] of Object.entries(GROUPS)) for (const l of def.labels) LABEL_TO_GROUP[l] = g;

// Звуки малыша, которые пишем в журнал (кроме плача — он отдельно)
const LOGGABLE = ['whimper', 'cough', 'sneeze', 'hiccup', 'burp', 'fart', 'laugh', 'coo'];

const MANUAL = {
  feed:   { name: 'Покормили',  emoji: '🍼' },
  sleep:  { name: 'Уснула',     emoji: '😴' },
  wake:   { name: 'Проснулась', emoji: '☀️' },
  diaper: { name: 'Подгузник',  emoji: '🧷' },
  burp:   { name: 'Срыгнула',   emoji: '💨' },
  calm:   { name: 'Успокоили',  emoji: '🤗' },
};

/* =========================================================
   Хранилище
   ========================================================= */
const store = {
  get(key, def) {
    try { const v = localStorage.getItem('malysh.' + key); return v == null ? def : JSON.parse(v); }
    catch { return def; }
  },
  set(key, val) {
    try { localStorage.setItem('malysh.' + key, JSON.stringify(val)); } catch {}
  },
};

const settings = Object.assign(
  { sens: 6, sound: false, flash: true, ntfy: '', cooldown: 60 },
  store.get('settings', {}),
);
const saveSettings = () => store.set('settings', settings);

let log = store.get('log', []);            // [{t, kind: 'sound'|'manual', type, dur?}]
const saveLog = () => { if (log.length > 3000) log = log.slice(-3000); store.set('log', log); };

/* =========================================================
   DOM
   ========================================================= */
const $ = (s) => document.querySelector(s);
const el = {
  status: $('#status'), big: $('#bigState'), bigEmoji: $('#bigEmoji'), bigLabel: $('#bigLabel'), bigSub: $('#bigSub'),
  meter: $('#meterFill'), btn: $('#btnListen'), live: $('#liveList'), hint: $('#hint'), hintList: $('#hintList'),
  since: $('#since'), hintSrc: $('#hintSrc'), fb: $('#feedback'), fbWhen: $('#fbWhen'), fbChips: $('#fbChips'), logList: $('#logList'), stats: $('#todayStats'), flash: $('#flash'), toast: $('#toast'),
};

function toast(msg, ms = 2500) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.toast.classList.remove('show'), ms);
}

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (t) => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
function ago(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return m + ' мин';
  const h = Math.floor(m / 60);
  return h + ' ч ' + (m % 60) + ' мин';
}
function durText(sec) {
  if (sec < 60) return Math.round(sec) + ' с';
  return Math.floor(sec / 60) + ' мин ' + Math.round(sec % 60) + ' с';
}

/* =========================================================
   Вкладки
   ========================================================= */
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
  if (b.dataset.tab === 'log') renderLog();
}));

/* =========================================================
   Модель
   ========================================================= */
let classifier = null, embedder = null;
async function loadModel() {
  if (classifier && embedder) return classifier;
  setBig('⏳', 'Загружаю модели…', 'Первый раз ~25 МБ, потом работает без интернета');
  const base = new URL('./vendor/mediapipe/wasm', location.href).href;
  const fileset = await FilesetResolver.forAudioTasks(base);
  classifier = await AudioClassifier.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: new URL('./models/yamnet.tflite', location.href).href },
    maxResults: 80,
  });
  embedder = await AudioEmbedder.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: new URL('./models/yamnet_embedder.tflite', location.href).href },
    l2Normalize: true,
  });
  await loadBaseModel(new URL('./models/cry_reason.json', location.href).href);
  return classifier;
}

/* =========================================================
   Микрофон и анализ
   ========================================================= */
let ctx, stream, source, proc, sink, ring, ringPos = 0, sr = 16000;
let timer = null, listening = false, level = 0;

async function startListening() {
  el.btn.disabled = true;
  try {
    // AudioContext создаём сразу по нажатию — иначе iOS его не запустит
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    await ctx.resume();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    await loadModel();

    sr = ctx.sampleRate;
    ring = new Float32Array(Math.round(sr * 0.975)); // ровно одно окно YAMNet
    ringPos = 0;
    source = ctx.createMediaStreamSource(stream);
    proc = ctx.createScriptProcessor(4096, 1, 1);
    sink = ctx.createGain(); sink.gain.value = 0;
    proc.onaudioprocess = (e) => {
      const d = e.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < d.length; i++) {
        ring[ringPos] = d[i];
        ringPos = (ringPos + 1) % ring.length;
        sum += d[i] * d[i];
      }
      level = Math.sqrt(sum / d.length);
    };
    source.connect(proc); proc.connect(sink); sink.connect(ctx.destination);
    stream.getAudioTracks()[0].addEventListener('ended', () => interrupted('микрофон отключён'));

    listening = true;
    frames = []; cryActive = false;
    timer = setInterval(tick, 500);
    requestWakeLock();
    el.btn.textContent = '■ Остановить';
    el.btn.classList.add('stop');
    el.status.textContent = 'слушаю';
    el.status.classList.add('on');
    setBig('🌙', 'Слушаю…', 'Тихо');
  } catch (err) {
    console.error(err);
    stopListening(true);
    const msg = err && err.name === 'NotAllowedError'
      ? 'Нет доступа к микрофону. Разрешите его в настройках Safari для этого сайта.'
      : 'Не получилось запустить: ' + (err && err.message || err);
    setBig('⚠️', 'Ошибка', msg);
  } finally {
    el.btn.disabled = false;
  }
}

function stopListening(silent) {
  listening = false;
  clearInterval(timer); timer = null;
  if (cryActive) endCry();
  try { proc && (proc.onaudioprocess = null, proc.disconnect()); } catch {}
  try { source && source.disconnect(); } catch {}
  try { stream && stream.getTracks().forEach((t) => t.stop()); } catch {}
  try { ctx && ctx.close(); } catch {}
  ctx = stream = source = proc = null;
  releaseWakeLock();
  el.btn.textContent = '▶︎ Начать слушать';
  el.btn.classList.remove('stop');
  el.status.textContent = 'не слушаю';
  el.status.classList.remove('on');
  el.meter.style.width = '0';
  if (!silent) setBig('🌙', 'Пауза', 'Нажмите «Начать слушать»');
}

function interrupted(why) {
  if (!listening) return;
  stopListening(true);
  setBig('⚠️', 'Слушание прервано', why + '. Нажмите «Начать слушать» ещё раз.');
  notifyRemote('Слушание прервано: ' + why, 'warning', 'default');
}

el.btn.addEventListener('click', () => (listening ? stopListening() : startListening()));

/* ---------- один шаг анализа (каждые 0.5 с) ---------- */
let frames = [];            // история кадров: {t, scores}
let cryActive = false, cryStart = 0, cryLastSeen = 0, cryPeak = 0, cryEmbs = [], lastReasonRender = 0;
let lastAlert = 0;
const lastLogged = {};      // группа -> время последней записи в журнал

const threshold = () => 0.55 - (settings.sens - 1) * 0.05; // 1 → 0.55 … 10 → 0.10

function tick() {
  if (!listening || !classifier || !ctx) return;
  if (ctx.state !== 'running') { ctx.resume().catch(() => {}); return; }

  el.meter.style.width = Math.min(100, level * 400) + '%';

  // разворачиваем кольцевой буфер в хронологическом порядке
  const buf = new Float32Array(ring.length);
  buf.set(ring.subarray(ringPos));
  buf.set(ring.subarray(0, ringPos), ring.length - ringPos);

  let res;
  try { res = classifier.classify(buf, sr); } catch (e) { console.error(e); return; }
  if (!res || !res.length) return;
  // буфер = одно окно → первый результат; хвостовые окна добиты нулями, их не берём
  const cats = res[0].classifications[0].categories;

  const scores = {};
  for (const c of cats) {
    const g = LABEL_TO_GROUP[c.categoryName];
    if (g) scores[g] = Math.max(scores[g] || 0, c.score);
  }
  // очень тихо → считаем тишиной (модель иногда «додумывает» звуки)
  if (level < 0.002) scores.silence = Math.max(scores.silence || 0, 0.9);

  const now = Date.now();
  // признаки звука для «почему плачет» — только когда похоже на плач
  if ((scores.cry || 0) >= threshold() * 0.8 || (scores.whimper || 0) >= threshold()) {
    try {
      const er = embedder.embed(buf, sr);
      const v = er && er[0] && er[0].embeddings[0].floatEmbedding;
      if (v) { cryEmbs.push(Float32Array.from(v)); if (!cryActive && cryEmbs.length > 4) cryEmbs.shift(); }
    } catch (e) { console.warn(e); }
  } else if (!cryActive && frames.length && now - frames[frames.length - 1].t > 0 && (scores.cry || 0) < 0.05) {
    cryEmbs = [];
  }
  frames.push({ t: now, scores });
  if (frames.length > 20) frames.shift();

  detect(now, scores);
  renderLive(scores);
}

function detect(now, scores) {
  const thr = threshold();
  const recent = frames.slice(-3);
  const cryHits = recent.filter((f) => (f.scores.cry || 0) >= thr).length;

  if (!cryActive && cryHits >= 2) {
    cryActive = true; cryStart = recent[0].t; cryLastSeen = now; cryPeak = scores.cry || 0;
    onCryStart();
  } else if (cryActive) {
    if ((scores.cry || 0) >= thr) { cryLastSeen = now; cryPeak = Math.max(cryPeak, scores.cry); }
    if (now - cryLastSeen > 8000) endCry();
  }

  if (cryActive) {
    setBig('😭', 'Плачет', 'уже ' + durText((now - cryStart) / 1000), 'cry');
    if (now - lastReasonRender > 2000) { lastReasonRender = now; renderHint(true); }
    return;
  }

  // Другие звуки малыша: нужен уверенный сигнал 2 кадра подряд
  const soundThr = Math.max(thr, 0.25);
  let shown = null;
  for (const g of LOGGABLE) {
    const ok = recent.slice(-2).length === 2 && recent.slice(-2).every((f) => (f.scores[g] || 0) >= soundThr);
    if (ok) {
      shown = g;
      if (!lastLogged[g] || now - lastLogged[g] > 30000) {
        lastLogged[g] = now;
        addLog({ t: now, kind: 'sound', type: g });
      }
      break;
    }
  }
  if (shown) {
    setBig(GROUPS[shown].emoji, GROUPS[shown].name, 'слышу сейчас', 'other');
  } else {
    // самый громкий из «фоновых»
    const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    const g = top && top[1] > 0.3 ? top[0] : 'silence';
    setBig('🌙', 'Всё спокойно', g === 'silence' ? 'Тихо' : GROUPS[g].name, 'quiet');
  }
}

function onCryStart() {
  const now = Date.now();
  renderHint(true);
  if (now - lastAlert < settings.cooldown * 1000) return;
  lastAlert = now;
  if (settings.flash) { el.flash.classList.remove('on'); void el.flash.offsetWidth; el.flash.classList.add('on'); }
  if (settings.sound) chime();
  if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
  const reasons = currentPrediction().ranked.slice(0, 3).map((r) => `• ${r.name} — ${Math.round(r.p * 100)}%`).join('\n');
  notifyRemote('Малыш плачет (' + hhmm(now) + ')' + (reasons ? '\n' + reasons : ''), 'baby', 'high');
}

function endCry() {
  cryActive = false;
  const dur = Math.max(1, (cryLastSeen - cryStart) / 1000);
  const id = 'c' + cryStart;
  const emb = meanEmbedding(cryEmbs);
  const pred = currentPrediction();
  if (emb) { const all = store.get('cryemb', {}); all[id] = packEmb(emb); store.set('cryemb', all); }
  cryEmbs = [];
  addLog({ t: cryStart, kind: 'sound', type: 'cry', dur: Math.round(dur), id, guess: pred.ranked[0].key });
  renderFeedback();
}

/* =========================================================
   Сигналы
   ========================================================= */
function chime() {
  try {
    const c = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = c.currentTime;
    [880, 660, 880].forEach((f, i) => {
      const o = c.createOscillator(); const g = c.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0, t0 + i * 0.35);
      g.gain.linearRampToValueAtTime(0.4, t0 + i * 0.35 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.35 + 0.3);
      o.connect(g); g.connect(c.destination);
      o.start(t0 + i * 0.35); o.stop(t0 + i * 0.35 + 0.32);
    });
  } catch {}
}

async function notifyRemote(text, tags, priority) {
  const topic = (settings.ntfy || '').trim();
  if (!topic) return false;
  const url = 'https://ntfy.sh/' + encodeURIComponent(topic) +
    '?title=' + encodeURIComponent('Малыш слышит') +
    '&tags=' + encodeURIComponent(tags) + '&priority=' + encodeURIComponent(priority);
  try { const r = await fetch(url, { method: 'POST', body: text }); return r.ok; }
  catch (e) { console.warn('ntfy', e); return false; }
}

/* ---------- экран не гаснет ---------- */
let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch (e) { console.warn('wakeLock', e); }
}
function releaseWakeLock() { try { wakeLock && wakeLock.release(); } catch {} wakeLock = null; }

document.addEventListener('visibilitychange', () => {
  if (!listening) return;
  if (document.visibilityState === 'visible') {
    if (!wakeLock) requestWakeLock();
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
    const track = stream && stream.getAudioTracks()[0];
    if (!track || track.readyState !== 'live') interrupted('приложение было свёрнуто');
  } else {
    // iOS отключит микрофон — предупредим второй телефон
    notifyRemote('Приложение свёрнуто — слушание может остановиться', 'warning', 'default');
  }
});

/* =========================================================
   Подсказки «почему плачет»
   ========================================================= */
function lastOf(type, kind = 'manual') {
  for (let i = log.length - 1; i >= 0; i--) if (log[i].type === type && log[i].kind === kind) return log[i].t;
  return null;
}

// отмеченные вами эпизоды плача → «опыт с вашим ребёнком»
function personalExamples() {
  const all = store.get('cryemb', {});
  return log.filter((e) => e.type === 'cry' && e.reason && e.reason !== 'unknown' && all[e.id])
    .map((e) => ({ reason: e.reason, emb: unpackEmb(all[e.id]) }));
}

function currentPrediction(emb = meanEmbedding(cryEmbs)) {
  const now = Date.now();
  const tummy = log.some((e) => e.kind === 'sound' && e.t > now - 10 * 60000 && ['hiccup', 'burp', 'fart'].includes(e.type));
  return predict(emb, personalExamples(), {
    now, feed: lastOf('feed'), diaper: lastOf('diaper'), sleep: lastOf('sleep'), wake: lastOf('wake'), tummySounds: tummy,
  });
}

function renderHint(show) {
  if (!show) { el.hint.classList.add('hidden'); return; }
  const pred = currentPrediction();
  el.hintList.innerHTML = '';
  pred.ranked.slice(0, 4).forEach((r, i) => {
    const li = document.createElement('li');
    li.className = 'reason' + (i === 0 ? ' best' : '');
    li.innerHTML = `<div class="rrow"><span></span><span class="bar"><i style="width:${Math.round(r.p * 100)}%"></i></span><span class="pct">${Math.round(r.p * 100)}%</span></div><div class="tip small muted"></div>`;
    li.querySelector('span').textContent = `${r.emoji} ${r.name}`;
    li.querySelector('.tip').textContent = r.tip;
    el.hintList.appendChild(li);
  });
  const src = pred.sources;
  const parts = [];
  if (src.sound) parts.push('звук плача');
  if (src.why.length) parts.push('время: ' + src.why.join(', '));
  parts.push(src.personalN ? `ваш опыт: ${src.personalN} отмеч. эпизодов` : 'ваш опыт: пока нет отметок');
  el.hintSrc.textContent = 'Учтено — ' + parts.join(' · ');
  el.hint.classList.remove('hidden');
}

/* ---------- «Что помогло?» после плача ---------- */
function pendingCry() {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.type === 'cry' && e.kind === 'sound') return !e.reason && Date.now() - e.t < 6 * 3600000 ? e : null;
  }
  return null;
}
function renderFeedback() {
  const e = pendingCry();
  if (!e) { el.fb.classList.add('hidden'); return; }
  el.fbWhen.textContent = `Плач в ${hhmm(e.t)}, ${durText(e.dur || 0)}` +
    (e.guess ? ` · приложение думало: ${REASONS[e.guess].name.toLowerCase()}` : '');
  el.fb.classList.remove('hidden');
}
el.fbChips.innerHTML = REASON_KEYS.map((k) => `<button class="btn chip" data-reason="${k}">${REASONS[k].emoji} ${REASONS[k].name}</button>`).join('') +
  '<button class="btn chip ghost" data-reason="unknown">🤷 Не понятно</button>';
el.fbChips.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-reason]'); if (!b) return;
  const e = pendingCry(); if (!e) return;
  e.reason = b.dataset.reason; saveLog();
  renderFeedback(); renderHint(false);
  const n = personalExamples().length;
  toast(e.reason === 'unknown' ? 'Хорошо, пропустим' : `Запомнила! Отмеченных эпизодов: ${n}`);
  if (document.querySelector('#tab-log.active')) renderLog();
});

/* =========================================================
   Отрисовка
   ========================================================= */
function setBig(emoji, label, sub, mode = 'idle') {
  el.bigEmoji.textContent = emoji;
  el.bigLabel.textContent = label;
  el.bigSub.textContent = sub || '';
  el.big.className = 'big-state ' + mode;
}

function renderLive(scores) {
  const items = Object.entries(scores).filter(([, v]) => v >= 0.05).sort((a, b) => b[1] - a[1]).slice(0, 5);
  el.live.innerHTML = '';
  if (!items.length) { el.live.innerHTML = '<li class="muted">—</li>'; return; }
  for (const [g, v] of items) {
    const li = document.createElement('li');
    if (g === 'cry') li.className = 'cry';
    li.innerHTML = `<span>${GROUPS[g].emoji} ${GROUPS[g].name}</span><span class="bar"><i style="width:${Math.round(v * 100)}%"></i></span><span class="pct">${Math.round(v * 100)}%</span>`;
    el.live.appendChild(li);
  }
}

function addLog(entry) {
  log.push(entry);
  log.sort((a, b) => a.t - b.t);
  saveLog();
  renderSince();
  if (document.querySelector('#tab-log.active')) renderLog();
}

function entryText(e) {
  if (e.kind === 'manual') return `${MANUAL[e.type].emoji} ${MANUAL[e.type].name}`;
  const g = GROUPS[e.type];
  return `${g.emoji} ${g.name}` + (e.dur ? ` · ${durText(e.dur)}` : '') +
    (e.reason && REASONS[e.reason] ? ` → ${REASONS[e.reason].emoji} ${REASONS[e.reason].name.toLowerCase()}` : '');
}

function renderLog() {
  el.logList.innerHTML = '';
  if (!log.length) { el.logList.innerHTML = '<li class="muted">Пока пусто</li>'; renderStats(); return; }
  let day = '';
  for (let i = log.length - 1; i >= 0 && i > log.length - 400; i--) {
    const e = log[i];
    const d = new Date(e.t).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
    if (d !== day) {
      day = d;
      const h = document.createElement('li'); h.className = 'day'; h.textContent = d; el.logList.appendChild(h);
    }
    const li = document.createElement('li');
    li.innerHTML = `<span class="t">${hhmm(e.t)}</span><span></span>`;
    li.lastChild.textContent = entryText(e);
    el.logList.appendChild(li);
  }
  renderStats();
}

function renderStats() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = log.filter((e) => e.t >= start.getTime());
  const cries = today.filter((e) => e.kind === 'sound' && e.type === 'cry');
  const cryMin = Math.round(cries.reduce((s, e) => s + (e.dur || 0), 0) / 60);
  const feeds = today.filter((e) => e.kind === 'manual' && e.type === 'feed').length;
  const diapers = today.filter((e) => e.kind === 'manual' && e.type === 'diaper').length;

  // сон: пары «уснула → проснулась» за сегодня
  let sleepMs = 0, from = null;
  for (const e of log) {
    if (e.kind !== 'manual') continue;
    if (e.type === 'sleep') from = e.t;
    if (e.type === 'wake' && from != null) {
      const a = Math.max(from, start.getTime());
      if (e.t > a) sleepMs += e.t - a;
      from = null;
    }
  }
  if (from != null) sleepMs += Date.now() - Math.max(from, start.getTime());
  const sh = Math.floor(sleepMs / 3600000), sm = Math.round((sleepMs % 3600000) / 60000);

  el.stats.innerHTML = `
    <div class="stat"><div class="v">${cries.length}</div><div class="k">эпизодов плача · ${cryMin} мин</div></div>
    <div class="stat"><div class="v">${feeds}</div><div class="k">кормлений</div></div>
    <div class="stat"><div class="v">${sh} ч ${sm} м</div><div class="k">сна (по отметкам)</div></div>
    <div class="stat"><div class="v">${diapers}</div><div class="k">подгузников</div></div>`;
}

function renderSince() {
  const now = Date.now();
  const rows = [['feed', '🍼 С кормления'], ['diaper', '🧷 С подгузника']];
  const sleep = lastOf('sleep'), wake = lastOf('wake');
  let html = rows.map(([k, label]) => {
    const t = lastOf(k);
    return t ? `<div>${label}: <b>${ago(now - t)}</b> (в ${hhmm(t)})</div>` : '';
  }).join('');
  if (sleep && (!wake || sleep > wake)) html += `<div>😴 Спит: <b>${ago(now - sleep)}</b></div>`;
  else if (wake) html += `<div>☀️ Бодрствует: <b>${ago(now - wake)}</b></div>`;
  el.since.innerHTML = html;
  renderFeedback();
}

/* ---------- ручные отметки ---------- */
document.querySelectorAll('[data-log]').forEach((b) => b.addEventListener('click', () => {
  const type = b.dataset.log;
  addLog({ t: Date.now(), kind: 'manual', type });
  toast(`${MANUAL[type].emoji} ${MANUAL[type].name} — ${hhmm(Date.now())}`);
  if (type === 'calm' && !cryActive) renderHint(false);
}));

$('#btnClear').addEventListener('click', () => {
  if (!confirm('Удалить весь журнал?')) return;
  log = []; saveLog(); renderLog(); renderSince();
});

/* =========================================================
   Настройки
   ========================================================= */
const sens = $('#sens'), sensVal = $('#sensVal');
sens.value = settings.sens; sensVal.textContent = settings.sens;
sens.addEventListener('input', () => { settings.sens = +sens.value; sensVal.textContent = sens.value; saveSettings(); });

const optSound = $('#optSound'), optFlash = $('#optFlash'), ntfy = $('#ntfyTopic'), cooldown = $('#cooldown');
optSound.checked = settings.sound; optFlash.checked = settings.flash;
ntfy.value = settings.ntfy; cooldown.value = String(settings.cooldown);
optSound.addEventListener('change', () => { settings.sound = optSound.checked; saveSettings(); if (settings.sound) chime(); });
optFlash.addEventListener('change', () => { settings.flash = optFlash.checked; saveSettings(); });
ntfy.addEventListener('change', () => { settings.ntfy = ntfy.value.trim(); saveSettings(); });
cooldown.addEventListener('change', () => { settings.cooldown = +cooldown.value; saveSettings(); });
$('#btnTestNtfy').addEventListener('click', async () => {
  settings.ntfy = ntfy.value.trim(); saveSettings();
  if (!settings.ntfy) return toast('Сначала впишите тему');
  toast((await notifyRemote('Тест: уведомления работают 👍', 'white_check_mark', 'default')) ? 'Отправлено' : 'Не удалось отправить');
});

/* ---------- старт ---------- */
renderSince();
setInterval(renderSince, 30000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
