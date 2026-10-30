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
  const TXT = {
    pt: {
      name: 'Multitarefa', sub: 'Várias tarefas. Um só ORION.', close: 'Fechar',
      active: n => (n === 1 ? '1 tarefa ativa' : n + ' tarefas ativas'), newTask: 'Nova tarefa', nTitle: 'Título da tarefa',
      nNote: 'Objetivo (opcional)', nSteps: 'Passos, um por linha (opcional)', create: 'Criar tarefa', cancel: 'Cancelar',
      quick: 'Adicione uma tarefa e pressione Enter', add: 'Adicionar',
      st: { running: 'Em andamento', paused: 'Pausada', done: 'Concluída' },
      pause: 'Pausar', resume: 'Retomar', complete: 'Concluir', reopen: 'Reabrir', del: 'Excluir', delAsk: 'Excluir esta tarefa?',
      details: 'Detalhes', activity: 'Atividade', goal: 'Objetivo', noGoal: 'Sem objetivo descrito.', steps: 'Passos', noSteps: 'Nenhum passo ainda.',
      stepPh: 'Novo passo', stepAdd: 'Adicionar passo', created: 'Criada', today: 'Hoje às', summary: 'Resumo',
      sActive: 'Tarefas ativas', sDone: 'Concluídas hoje', sPaused: 'Em pausa', shortcuts: 'Atalhos', clearDone: 'Limpar concluídas',
      infoT: 'Organize e acompanhe', info: 'As tarefas ficam salvas neste navegador. O ORION ainda não executa tarefas sozinho.',
      empty: 'Nenhuma tarefa ainda. Crie a primeira em “Nova tarefa”.',
      lNew: 'Tarefa criada', lPause: 'Pausada', lResume: 'Retomada', lDone: 'Concluída', lReopen: 'Reaberta',
      lStepOn: 'Passo concluído: ', lStepOff: 'Passo reaberto: ', lStepAdd: 'Passo adicionado: ', progress: 'Progresso',
    },
    en: {
      name: 'Multitasking', sub: 'Many tasks. One ORION.', close: 'Close',
      active: n => (n === 1 ? '1 active task' : n + ' active tasks'), newTask: 'New task', nTitle: 'Task title',
      nNote: 'Goal (optional)', nSteps: 'Steps, one per line (optional)', create: 'Create task', cancel: 'Cancel',
      quick: 'Add a task and press Enter', add: 'Add',
      st: { running: 'In progress', paused: 'Paused', done: 'Done' },
      pause: 'Pause', resume: 'Resume', complete: 'Complete', reopen: 'Reopen', del: 'Delete', delAsk: 'Delete this task?',
      details: 'Details', activity: 'Activity', goal: 'Goal', noGoal: 'No goal described.', steps: 'Steps', noSteps: 'No steps yet.',
      stepPh: 'New step', stepAdd: 'Add step', created: 'Created', today: 'Today at', summary: 'Summary',
      sActive: 'Active tasks', sDone: 'Done today', sPaused: 'Paused', shortcuts: 'Shortcuts', clearDone: 'Clear completed',
      infoT: 'Organize and track', info: 'Tasks are saved in this browser. ORION does not run tasks on its own yet.',
      empty: 'No tasks yet. Create the first one with “New task”.',
      lNew: 'Task created', lPause: 'Paused', lResume: 'Resumed', lDone: 'Completed', lReopen: 'Reopened',
      lStepOn: 'Step done: ', lStepOff: 'Step reopened: ', lStepAdd: 'Step added: ', progress: 'Progress',
    },
  };
  const lang = () => (/^en/i.test(document.documentElement.lang) ? 'en' : 'pt');
  const T = () => TXT[lang()];

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
    const loc = lang() === 'en' ? 'en-US' : 'pt-BR', hm = new Date(ts).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
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
   Voice & Speech — dois arcos em volta da Orb
   Arco interno = Ritmo · arco externo = Expressividade. Cada um vai de 0% a 100%, a partir do topo, no sentido horário.
   Arraste o arco (mouse, toque) ou use as setas do teclado. Os valores reais ficam nos campos #vsPace e #vsExpr,
   que o app.js já lê e salva — os arcos só os controlam e os refletem.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const svg = $('vsRings'), screen = $('voiceScreen'), pace = $('vsPace'), expr = $('vsExpr');
  if (!svg || !screen || !pace || !expr) return;
  const NS = 'http://www.w3.org/2000/svg', C = 110;
  const mk = (tag, at) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); return e; };

  const defs = [
    { inp: pace, r: 66, color: '#5F59A8', name: 'vsPaceName', fmt: v => v.toFixed(2) + '×' },
    { inp: expr, r: 86, color: '#8782C2', name: 'vsExprName', fmt: (v, p) => Math.round(p) + '%' },
  ];
  const readP = d => { const i = d.inp, min = +i.min, max = +i.max; return Math.min(1, Math.max(0, (+i.value - min) / (max - min))) * 100; };
  const fire = (d, type) => d.inp.dispatchEvent(new Event(type, { bubbles: true }));

  function paint(d, force) {
    const p = readP(d), off = d.inp.disabled;
    if (!force && p === d.last && off === d.off) return;
    d.last = p; d.off = off;
    d.prog.setAttribute('stroke-dasharray', p.toFixed(2) + ' 100');
    d.prog.style.visibility = p < 0.4 ? 'hidden' : 'visible';
    const a = p * 3.6 * Math.PI / 180;
    d.tip.setAttribute('cx', (C + d.r * Math.sin(a)).toFixed(2));
    d.tip.setAttribute('cy', (C - d.r * Math.cos(a)).toFixed(2));
    d.g.setAttribute('aria-valuenow', String(Math.round(p)));
    d.g.setAttribute('aria-valuetext', d.fmt(+d.inp.value, p));
    d.g.setAttribute('aria-disabled', String(off));
    d.g.classList.toggle('off', off);
    d.g.tabIndex = off ? -1 : 0;
  }
  function setP(d, p) {
    if (d.inp.disabled) return;
    p = Math.min(100, Math.max(0, p));
    const min = +d.inp.min, max = +d.inp.max;
    const v = Math.round((min + p / 100 * (max - min)) * 100) / 100;
    if (v === +d.inp.value) return;
    d.inp.value = String(v);
    fire(d, 'input'); paint(d);
  }
  function angleP(e) {   // posição do ponteiro → % ao longo do círculo, a partir do topo
    const r = svg.getBoundingClientRect();
    let deg = Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180 / Math.PI;
    if (deg < 0) deg += 360;
    return deg / 3.6;
  }

  defs.forEach(d => {
    d.g = mk('g', { class: 'vs-ring', role: 'slider', tabindex: '0', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-orientation': 'horizontal', 'aria-labelledby': d.name });
    d.g.append(
      mk('circle', { class: 'track', cx: C, cy: C, r: d.r }),
      d.prog = mk('circle', { class: 'prog', cx: C, cy: C, r: d.r, pathLength: '100', stroke: d.color, transform: 'rotate(-90 ' + C + ' ' + C + ')', 'stroke-dasharray': '0 100' }),
      d.tip = mk('circle', { class: 'tip', r: '7', cx: C, cy: C - d.r }),
      mk('circle', { class: 'hit', cx: C, cy: C, r: d.r }));
    svg.append(d.g);

    d.g.addEventListener('pointerdown', e => {
      if (d.inp.disabled) return;
      d.drag = true; d.g.setPointerCapture(e.pointerId); e.preventDefault();
      setP(d, angleP(e));
    });
    d.g.addEventListener('pointermove', e => {
      if (!d.drag) return;
      let p = angleP(e); const prev = readP(d);
      if (prev > 85 && p < 15) p = 100;       // não "dá a volta" de 100% para 0% (e vice-versa)
      else if (prev < 15 && p > 85) p = 0;
      setP(d, p);
    });
    const end = () => { if (!d.drag) return; d.drag = false; fire(d, 'change'); };
    d.g.addEventListener('pointerup', end);
    d.g.addEventListener('pointercancel', end);
    d.g.addEventListener('keydown', e => {
      const step = e.shiftKey ? 10 : 2, k = e.key;
      let p = readP(d);
      if (k === 'ArrowRight' || k === 'ArrowUp') p += step;
      else if (k === 'ArrowLeft' || k === 'ArrowDown') p -= step;
      else if (k === 'PageUp') p += 10;
      else if (k === 'PageDown') p -= 10;
      else if (k === 'Home') p = 0;
      else if (k === 'End') p = 100;
      else return;
      e.preventDefault(); e.stopPropagation();
      setP(d, p); fire(d, 'change');
    });
    paint(d, true);
  });

  // reflete os valores do app.js (que escreve nos campos ao abrir a tela e ao trocar de idioma) enquanto a tela está aberta
  let raf = 0;
  const loop = () => { defs.forEach(d => paint(d)); raf = screen.classList.contains('open') ? requestAnimationFrame(loop) : 0; };
  new MutationObserver(() => { if (screen.classList.contains('open') && !raf) raf = requestAnimationFrame(loop); })
    .observe(screen, { attributes: true, attributeFilter: ['class'] });
})();
