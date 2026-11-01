/* ═══════════════════════════════════════════════════════════════
   ORION AI V5.0 — Orb Adaptive Interface + Multitarefa (pages/js/orion-v5.js)
   Carregado depois do app.js (que não foi alterado).

   1) MORPH: quando Configurações, ORION Code/API ou Multitarefa abrem, a Orb vira um painel que ocupa quase toda a tela
      e o arco passa a acompanhar a curva do painel. Ao fechar, volta a ser esfera. O visual está em orion.html.
   2) MULTITAREFA: organizador de tarefas funcional, salvo neste navegador (uma lista por conta).
      O ORION ainda NÃO executa tarefas sozinho — o painel diz isso; nada aqui simula execução.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const zone = $('orbZone'), orb = $('orb');
  if (!zone || !orb || !window.OrbFrame) return;

  /* ── 1. Orb Adaptive: esfera ⇄ painel ──
     A Orb vira painel em dois casos: (a) um módulo abre (Configurações, ORION Code/API, Multitarefa);
     (b) a resposta de uma pergunta ESCRITA chega (a resposta e as imagens ficam dentro do painel).
     Pergunta por VOZ: o ORION responde falando e nada aparece na tela. */
  const arc = document.createElement('div');
  arc.className = 'orb-arc'; arc.setAttribute('aria-hidden', 'true');
  zone.insertBefore(arc, orb);
  const body = document.body, cap = $('capBox'), form = $('askForm');
  const MODS = [['#settingsPanel', 'gearBtn'], ['#codePanel', 'codeBtn'], ['#taskPanel', 'taskBtn']];
  let morphed = false, moduleOpen = false, textMode = false, capOn = false, src = 'voice';

  function sync() {
    let any = false;
    MODS.forEach(([sel, btn]) => {
      const on = !!document.querySelector(sel + '.open'); any = any || on;
      const b = $(btn); if (b) b.classList.toggle('on', on);
    });
    // o chat não é usado dentro dos módulos: se estava aberto, fecha antes de abrir o painel
    if (any && !moduleOpen && body.classList.contains('chat-open')) { const c = $('chatBtn'); if (c) c.click(); }
    moduleOpen = any;
    const chatPanel = textMode && !any;
    body.classList.toggle('module-open', any);
    body.classList.toggle('chat-answer', chatPanel);
    const chatBtn = $('chatBtn'); if (chatBtn) { if (any) chatBtn.setAttribute('aria-disabled', 'true'); else chatBtn.removeAttribute('aria-disabled'); }
    const want = any || chatPanel;
    if (want === morphed) return;
    morphed = want;
    zone.classList.toggle('panel-open', want);
    orb.classList.toggle('panel', want);       // app.js: a Orb pára de desenhar a nebulosa enquanto é painel
    orb.classList.toggle('module', want);
  }
  new MutationObserver(sync).observe(body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });

  // origem da pergunta: só o formulário do chat é "escrita"; voz, "Hey ORION" e toque na Orb são "voz"
  form.addEventListener('submit', () => {
    if ($('askInput').value.trim() || !$('attachChip').hidden) src = 'text';
  }, true);
  new MutationObserver(() => {
    const on = cap.classList.contains('show');
    if (on && !capOn) {
      capOn = true;
      textMode = src === 'text';
      body.classList.toggle('voice-answer', !textMode);
      src = 'voice';
    } else if (!on && capOn) {
      capOn = false; textMode = false;
      body.classList.remove('voice-answer');
    }
    sync();
  }).observe(cap, { attributes: true, attributeFilter: ['class'] });
  // enquanto a pessoa lê a resposta no painel, o app.js não deve fechá-lo: repassa o "mouse em cima" para a Orb
  cap.addEventListener('pointerenter', () => orb.dispatchEvent(new PointerEvent('pointerenter')));
  cap.addEventListener('pointerleave', () => orb.dispatchEvent(new PointerEvent('pointerleave')));

  // a barra do chat e o atalho "/" não funcionam dentro dos módulos
  document.addEventListener('click', e => {
    if (moduleOpen && e.target.closest && e.target.closest('#chatBtn')) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
  document.addEventListener('keydown', e => {
    if (moduleOpen && e.key === '/' && !e.target.matches('input,textarea,select')) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);

  /* ── 2. Multitarefa ── */
  const LANGS = ['pt', 'en', 'es', 'fr', 'de', 'it'];
  const LOCALES = { pt: 'pt-BR', en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };
  const lang = () => { const l = (document.documentElement.lang || 'pt').slice(0, 2).toLowerCase(); return LANGS.includes(l) ? l : 'pt'; };
  const tr = (key, vars) => {   // texto do i18n.js (cai para o inglês)
    const D = window.ORION_I18N || {}; let s = (D[lang()] && D[lang()][key]) || (D.en && D.en[key]) || key;
    if (vars) for (const x in vars) s = s.split('{' + x + '}').join(vars[x]);
    return s;
  };
  const TASK_KEYS = ['name', 'sub', 'newTask', 'nTitle', 'nNote', 'nSteps', 'create', 'cancel', 'quick', 'add', 'pause', 'resume', 'complete', 'reopen', 'del', 'delAsk',
    'details', 'activity', 'goal', 'noGoal', 'steps', 'noSteps', 'stepPh', 'stepAdd', 'created', 'today', 'summary', 'sActive', 'sDone', 'sPaused', 'shortcuts',
    'clearDone', 'infoT', 'info', 'empty', 'lNew', 'lPause', 'lResume', 'lDone', 'lReopen', 'lStepOn', 'lStepOff', 'lStepAdd', 'progress'];
  const T = () => {
    const o = {}; TASK_KEYS.forEach(k => { o[k] = tr('task.' + k); });
    o.st = { running: tr('task.st.running'), paused: tr('task.st.paused'), done: tr('task.st.done') };
    o.active = n => tr(n === 1 ? 'task.active1' : 'task.activeN', { n });
    o.close = tr('code.close');
    return o;
  };

  const P = { plus: 'M12 5v14M5 12h14', play: 'M7 4.5v15l12-7.5z', pause: 'M8 5v14M16 5v14', check: 'M5 12.5l4.5 4.5L19 7.5', trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6', undo: 'M3 7v6h6M3.5 13A9 9 0 1 0 6 6.5', list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01' };
  const icon = (n, s = 15) => {
    const t = document.createElement('template');
    t.innerHTML = '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + P[n] + '"/></svg>';
    return t.content.firstChild;
  };
  const h = (tag, props, ...kids) => {
    const e = document.createElement(tag);
    for (const k in (props || {})) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach(c => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  };

  const uid = () => (window.ORION_USER && window.ORION_USER.uid) || 'anon';
  const KEY = () => 'orion_tasks_' + uid();
  const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  function clean(v) {
    if (!Array.isArray(v)) return [];
    return v.slice(0, 100).map(x => {
      if (!x || typeof x !== 'object') return null;
      return {
        id: String(x.id || rid()).slice(0, 24), title: String(x.title || '').slice(0, 80), note: String(x.note || '').slice(0, 400),
        status: ['running', 'paused', 'done'].includes(x.status) ? x.status : 'running', created: Number(x.created) || Date.now(), done: Number(x.done) || 0,
        steps: (Array.isArray(x.steps) ? x.steps : []).slice(0, 30).map(s => ({ text: String((s && s.text) || '').slice(0, 120), done: !!(s && s.done) })).filter(s => s.text),
        log: (Array.isArray(x.log) ? x.log : []).slice(-60).map(l => ({ t: Number(l && l.t) || 0, x: String((l && l.x) || '').slice(0, 160) })),
      };
    }).filter(x => x && x.title);
  }
  const load = () => { try { return clean(JSON.parse(localStorage.getItem(KEY()))); } catch (_) { return []; } };

  let tasks = [], sel = null, tab = 'details', showForm = false, bodyEl = null, countEl = null;
  const save = () => { try { localStorage.setItem(KEY(), JSON.stringify(tasks)); } catch (_) {} };
  const log = (t, x) => { t.log.push({ t: Date.now(), x }); if (t.log.length > 60) t.log.shift(); };
  const progress = t => (t.status === 'done' ? 100 : t.steps.length ? Math.round(t.steps.filter(s => s.done).length / t.steps.length * 100) : 0);
  const sameDay = ts => { const a = new Date(ts), b = new Date(); return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); };
  const when = ts => {
    const loc = LOCALES[lang()], hm = new Date(ts).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
    return sameDay(ts) ? T().today + ' ' + hm : new Date(ts).toLocaleDateString(loc, { day: '2-digit', month: 'short' }) + ' ' + hm;
  };
  const ensureSel = () => { if (!tasks.some(t => t.id === sel)) sel = tasks.length ? tasks[0].id : null; };
  const mutate = fn => { fn(); save(); ensureSel(); render(); };

  function create(title, note, stepsText) {
    title = String(title || '').trim().slice(0, 80);
    if (!title) return false;
    const t = { id: rid(), title, note: String(note || '').trim().slice(0, 400), status: 'running', created: Date.now(), done: 0, log: [],
      steps: String(stepsText || '').split('\n').map(s => s.trim().slice(0, 120)).filter(Boolean).slice(0, 30).map(text => ({ text, done: false })) };
    log(t, T().lNew);
    tasks.unshift(t); sel = t.id; showForm = false; save(); render();
    return true;
  }
  function setStatus(t, s) {
    if (t.status === s) return;
    const prev = t.status; t.status = s;
    if (s === 'done') { t.done = Date.now(); log(t, T().lDone); }
    else { t.done = 0; log(t, prev === 'done' ? T().lReopen : s === 'paused' ? T().lPause : T().lResume); }
  }

  const barEl = t => { const p = progress(t); return h('div', { class: 'bar' }, h('div', { class: 'bar-track', role: 'progressbar', 'aria-label': T().progress, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': p }, h('i', { style: 'width:' + p + '%' })), h('span', { class: 'pct' }, p + '%')); };
  const chipEl = t => h('span', { class: 'chip ' + t.status }, T().st[t.status]);
  const ctl = (name, label, fn, fk) => h('button', { class: 't-ctl', type: 'button', 'aria-label': label, title: label, 'data-fk': fk, onclick: e => { e.stopPropagation(); fn(); } }, icon(name));

  function cardEl(t) {
    const L = T();
    return h('article', { class: 'task-card' + (t.id === sel ? ' sel' : '') },
      h('div', { class: 'task-top' },
        h('button', { class: 'task-open', type: 'button', 'data-fk': 'o-' + t.id, 'aria-pressed': String(t.id === sel), onclick: () => { sel = t.id; render(); } }, t.title),
        h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': L.del + ': ' + t.title, title: L.del, 'data-fk': 'x-' + t.id, onclick: () => { if (confirm(L.delAsk)) mutate(() => { tasks = tasks.filter(x => x.id !== t.id); }); } }, icon('trash', 14))),
      chipEl(t), barEl(t),
      h('p', { class: 'task-note' }, t.note || ''),
      h('div', { class: 'task-foot' }, h('span', {}, when(t.created)),
        h('div', { class: 't-ctls' },
          t.status === 'done'
            ? ctl('undo', L.reopen, () => mutate(() => setStatus(t, 'running')), 'u-' + t.id)
            : [ctl(t.status === 'running' ? 'pause' : 'play', t.status === 'running' ? L.pause : L.resume, () => mutate(() => setStatus(t, t.status === 'running' ? 'paused' : 'running')), 'p-' + t.id),
               ctl('check', L.complete, () => mutate(() => setStatus(t, 'done')), 'c-' + t.id)])));
  }

  function detailEl(t) {
    const L = T();
    const tabBtn = (k, label) => h('button', { class: 't-tab', type: 'button', role: 'tab', 'aria-selected': String(tab === k), 'data-fk': 'tab-' + k, onclick: () => { tab = k; render(); } }, label);
    let pane;
    if (tab === 'details') {
      const stepInput = h('input', { class: 't-field', type: 'text', maxlength: 120, placeholder: L.stepPh, 'aria-label': L.stepPh, 'data-fk': 'sn' });
      const addStep = () => { const v = stepInput.value.trim(); if (!v || t.steps.length >= 30) return; mutate(() => { t.steps.push({ text: v.slice(0, 120), done: false }); log(t, L.lStepAdd + v.slice(0, 60)); }); };
      stepInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addStep(); } });
      pane = h('div', { class: 'td-pane' },
        h('div', {}, h('h4', {}, L.goal), h('p', {}, t.note || L.noGoal)),
        h('div', {}, h('h4', {}, L.steps),
          t.steps.length ? h('ul', { class: 't-steps' }, t.steps.map((s, i) => h('li', { class: 't-step' + (s.done ? ' ok' : '') },
            h('label', {}, h('input', { type: 'checkbox', checked: s.done, 'data-fk': 's-' + i, onchange: e => mutate(() => { s.done = e.target.checked; log(t, (s.done ? L.lStepOn : L.lStepOff) + s.text.slice(0, 60)); }) }), h('span', {}, s.text))))) : h('p', {}, L.noSteps),
          h('div', { class: 't-addstep' }, stepInput, h('button', { class: 'pill-btn sm', type: 'button', onclick: addStep }, L.stepAdd))),
        h('div', {}, h('h4', {}, L.created), h('p', {}, when(t.created))));
    } else {
      pane = h('div', { class: 'td-pane' }, h('ol', { class: 't-log' }, t.log.slice().reverse().map(l => h('li', {}, h('span', {}, l.x), h('time', {}, when(l.t))))));
    }
    return h('section', { class: 'task-detail t-box', 'aria-label': t.title },
      h('div', { class: 'td-head' }, h('h3', {}, t.title), chipEl(t), barEl(t)),
      h('div', { class: 't-tabs', role: 'tablist' }, tabBtn('details', L.details), tabBtn('activity', L.activity)), pane);
  }

  function formEl() {
    const L = T();
    const title = h('input', { class: 't-field', type: 'text', maxlength: 80, required: true, placeholder: L.nTitle, 'aria-label': L.nTitle, 'data-fk': 'f-title' });
    const note = h('textarea', { class: 't-field', rows: 2, maxlength: 400, placeholder: L.nNote, 'aria-label': L.nNote });
    const steps = h('textarea', { class: 't-field', rows: 3, placeholder: L.nSteps, 'aria-label': L.nSteps });
    return h('form', { class: 't-form t-box', novalidate: true, onsubmit: e => { e.preventDefault(); if (!create(title.value, note.value, steps.value)) title.focus(); } },
      title, note, steps,
      h('div', { class: 't-form-row' }, h('button', { class: 'pill-btn sm', type: 'button', onclick: () => { showForm = false; render(); } }, L.cancel), h('button', { class: 'pill-btn primary sm', type: 'submit' }, L.create)));
  }

  function render(focusForm) {
    if (!bodyEl) return;
    const L = T(), ae = document.activeElement, fk = ae && ae.dataset && ae.dataset.fk, top = bodyEl.scrollTop;
    const count = s => tasks.filter(t => t.status === s).length;
    countEl.replaceChildren(h('i'), document.createTextNode(L.active(count('running'))));
    const order = { running: 0, paused: 1, done: 2 };
    const list = tasks.slice().sort((a, b) => order[a.status] - order[b.status] || b.created - a.created);
    const main = h('div', { class: 'task-main' });
    if (showForm) main.append(formEl());
    if (!tasks.length) { if (!showForm) main.append(h('div', { class: 't-empty' }, L.empty)); }
    else { main.append(h('div', { class: 'task-grid' }, list.map(cardEl))); const cur = tasks.find(t => t.id === sel); if (cur) main.append(detailEl(cur)); }
    const doneToday = tasks.filter(t => t.status === 'done' && t.done && sameDay(t.done)).length;
    const side = h('aside', { class: 'task-side' },
      h('div', { class: 't-box t-sum' }, h('h4', {}, L.summary), h('div', {}, h('span', {}, L.sActive), h('b', {}, count('running'))), h('div', {}, h('span', {}, L.sDone), h('b', {}, doneToday)), h('div', {}, h('span', {}, L.sPaused), h('b', {}, count('paused')))),
      h('div', { class: 't-box t-short' }, h('h4', {}, L.shortcuts),
        h('button', { class: 'pill-btn sm', type: 'button', onclick: () => { showForm = true; render(true); } }, icon('plus', 13), L.newTask),
        h('button', { class: 'pill-btn sm', type: 'button', disabled: !tasks.some(t => t.status === 'done'), onclick: () => mutate(() => { tasks = tasks.filter(t => t.status !== 'done'); }) }, icon('trash', 13), L.clearDone)),
      h('div', { class: 't-box t-info' }, h('b', {}, L.infoT), L.info));
    bodyEl.replaceChildren(main, side);
    bodyEl.scrollTop = top;
    if (focusForm) { const f = bodyEl.querySelector('[data-fk="f-title"]'); if (f) f.focus(); }
    else if (fk) { const el = bodyEl.querySelector('[data-fk="' + fk.replace(/"/g, '') + '"]'); if (el) el.focus(); }
  }

  const taskBtn = $('taskBtn');
  if (!taskBtn) return;
  const panel = OrbFrame.create({
    id: 'taskPanel', icon: taskBtn.querySelector('svg').outerHTML, opener: taskBtn, foot: false,
    blocked: () => { const v = $('voiceScreen'); return !!(v && v.classList.contains('open')); },
    title: () => T().name, sub: () => T().sub, closeLabel: () => T().close,
    // só um painel por vez: fecha Configurações / ORION CODE pelo mesmo caminho do Esc do app.js
    beforeOpen: () => { if (document.querySelector('#settingsPanel.open, #codePanel.open')) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); },
    mount: card => {
      tasks = load(); sel = null; tab = 'details'; showForm = false; ensureSel();
      const head = card.querySelector('.set-head'), closeBtn = head.querySelector('.icon-btn');
      countEl = h('span', { class: 'task-count' });
      const newBtn = h('button', { class: 'pill-btn sm', type: 'button', onclick: () => { showForm = !showForm; render(showForm); } }, icon('plus', 13), h('span', {}, T().newTask));
      head.append(h('div', { class: 'task-actions' }, countEl, newBtn, closeBtn));
      bodyEl = card.querySelector('.orb-frame-body'); bodyEl.classList.add('task-body');
      const quick = h('input', { type: 'text', maxlength: 80, placeholder: T().quick, 'aria-label': T().quick });
      card.append(h('form', { class: 't-quick', onsubmit: e => { e.preventDefault(); if (create(quick.value)) quick.value = ''; } }, quick, h('button', { class: 'pill-btn sm', type: 'submit' }, T().add)));
      render();
    },
  });

  // abrir Configurações ou ORION Code enquanto a Multitarefa está aberta troca de painel (só um por vez)
  ['gearBtn', 'codeBtn'].forEach(id => { const b = $(id); if (b) b.addEventListener('click', () => { if (panel.isOpen()) panel.setOpen(false); }, true); });

  // o rótulo do botão acompanha o idioma da interface
  const label = () => { const n = T().name; taskBtn.setAttribute('aria-label', n); taskBtn.title = n; };
  label();
  new MutationObserver(label).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  window.ORION_TASK_PANEL = panel;
})();

/* ═══════════════════════════════════════════════════════════════
   Voz e Fala — dois arcos concêntricos em volta da Orb (puramente informativos)
   Arco interno = Ritmo da fala · arco externo = Expressividade (intensidade da voz). Cada um vai de 0% a 100%, a partir do topo, no sentido horário.
   Os dados vêm do áudio REAL da fala (window.ORION_AUDIO, definido no app.js: analisador do ElevenLabs). Com a voz de reserva do
   navegador não há dados de áudio, então os arcos ficam parados — nunca há animação simulada.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const svg = document.getElementById('vsRings'), screen = document.getElementById('voiceScreen');
  if (!svg || !screen) return;
  const NS = 'http://www.w3.org/2000/svg', C = 100;
  const mk = (tag, at) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); return e; };
  // viewBox 200: a Orb ocupa 100 (raio 50); arco interno r=64 = Ritmo (início de sílabas por segundo); externo r=80 = Expressividade (intensidade da voz)
  const rings = [{ r: 64, key: 'rate', up: 4, down: 2.2 }, { r: 80, key: 'level', up: 14, down: 5 }].map(d => {
    const g = mk('g', {});
    d.prog = mk('circle', { class: 'prog', cx: C, cy: C, r: d.r, pathLength: '100', transform: 'rotate(-90 ' + C + ' ' + C + ')', 'stroke-dasharray': '0 100', visibility: 'hidden' });
    d.tip = mk('circle', { class: 'tip', r: '3', cx: C, cy: C - d.r });   // fica no topo (0%) e acompanha o valor real
    g.append(mk('circle', { class: 'track', cx: C, cy: C, r: d.r }), d.prog, d.tip);
    svg.append(g); d.v = 0; return d;
  });
  const lang = () => (document.documentElement.lang || 'pt').slice(0, 2).toLowerCase();
  function label() {   // descrição para leitores de tela (os arcos em si não têm texto na tela)
    const D = window.ORION_I18N || {}, T = D[lang()] || D.en || {};
    svg.setAttribute('aria-label', (T['vs.pace'] || 'Pace') + ' · ' + (T['vs.expr'] || 'Expressivity'));
  }
  label();
  new MutationObserver(label).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  let raf = 0, last = 0;
  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
    const A = window.ORION_AUDIO;
    let lv = 0, rt = 0;
    if (A) { const l = A.level(); if (A.real()) { lv = l; rt = A.rate(); } }   // só dados reais
    const target = { level: lv, rate: rt };
    rings.forEach(d => {
      const t = target[d.key], k = 1 - Math.exp(-dt * (t > d.v ? d.up : d.down));
      d.v += (t - d.v) * k;
      const p = Math.max(0, Math.min(1, d.v)) * 100;
      d.prog.setAttribute('stroke-dasharray', p.toFixed(2) + ' 100');
      d.prog.setAttribute('visibility', p < 0.5 ? 'hidden' : 'visible');
      const ang = p * 3.6 * Math.PI / 180;
      d.tip.setAttribute('cx', (C + d.r * Math.sin(ang)).toFixed(2)); d.tip.setAttribute('cy', (C - d.r * Math.cos(ang)).toFixed(2));
    });
    raf = screen.classList.contains('open') ? requestAnimationFrame(loop) : 0;
  }
  new MutationObserver(() => { if (screen.classList.contains('open') && !raf) raf = requestAnimationFrame(loop); })
    .observe(screen, { attributes: true, attributeFilter: ['class'] });
})();
