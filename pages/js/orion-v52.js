/* ═══════════════════════════════════════════════════════════════
   ORION AI V5.2.0 — Planos e faturamento · ORION API · Resumo do Dia   (pages/js/orion-v52.js)

   Três painéis no mesmo padrão dos outros módulos (a Orb vira painel; orion-v5.js observa #planPanel, #apiPanel e #newsPanel):
     window.ORION_PLANS      → Planos e faturamento (abre pelo botão Upgrade das Configurações ou por uma voz de plano pago)
     window.ORION_API_PANEL  → ORION API: chaves, uso, exemplo e documentação (abre pelo painel </>)
     window.ORION_NEWS       → Resumo do Dia (botão do jornal no dock)

   Regras deste arquivo:
   - O site NÃO decide nada de plano, preço, cota ou pagamento: só mostra o que o servidor devolve e pede ações (assinar, cancelar,
     criar/revogar/girar chave). Voltar da página de pagamento NÃO ativa nada: o site só pergunta ao servidor se o plano mudou.
   - Todo texto vindo do servidor entra na tela por textContent (nunca como HTML) e todo link é conferido (http/https).
   - A chave de API completa existe só na tela, só depois de criada/girada, e some ao fechar o painel. Nunca é guardada no navegador.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const T = (k, v) => (typeof I18N !== 'undefined' ? I18N.t(k, v) : k);
  const LOCALE = () => (typeof I18N !== 'undefined' ? I18N.locale() : 'pt-BR');
  const LANG = () => (typeof I18N !== 'undefined' ? I18N.get() : 'pt');
  const BASE = () => ((typeof ORION_CONFIG !== 'undefined' && ORION_CONFIG.API_URL) || '').replace(/\/$/, '');
  const DOCS_URL = 'https://github.com/Janderfdev/orion/blob/main/docs/API.md';

  /* ── pequenos utilitários ── */
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
  const svg = path => {
    const t = document.createElement('template');
    t.innerHTML = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
    return t.content.firstChild;
  };
  const ICON = {
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    star: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
    code: '<path d="M8.5 6.5L3 12l5.5 5.5M15.5 6.5L21 12l-5.5 5.5M13.5 4.5l-3 15"/>',
    news: '<path d="M4 5h13a1 1 0 0 1 1 1v13H6a2 2 0 0 1-2-2V5z"/><path d="M18 9h2a1 1 0 0 1 1 1v7a2 2 0 0 1-2 2h-1"/><path d="M8 9h6M8 13h6M8 16h3"/>',
  };
  const money = cents => new Intl.NumberFormat(LOCALE(), { style: 'currency', currency: 'BRL' }).format((Number(cents) || 0) / 100);
  const num = n => new Intl.NumberFormat(LOCALE()).format(Number(n) || 0);
  const fmtDate = s => {
    if (!s) return '';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T12:00:00') : new Date(s);
    return isNaN(d) ? '' : new Intl.DateTimeFormat(LOCALE(), { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
  };
  const fmtWhen = s => {
    const d = new Date(s);
    return isNaN(d) ? '' : new Intl.DateTimeFormat(LOCALE(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
  };
  const fmtTime = d => new Intl.DateTimeFormat(LOCALE(), { hour: '2-digit', minute: '2-digit' }).format(d);
  const safeHref = u => (typeof u === 'string' && /^https?:\/\/[^\s]+$/i.test(u) && u.length <= 600 ? u : '');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const spinner = text => h('div', { class: 'v52-center', role: 'status' }, h('div', { class: 'v52-spin' }), text);

  /* ── conversa com o servidor (mesmo token do Firebase do resto do site) ── */
  function errCode(d, status) {
    if (d && d.error && typeof d.error.code === 'string') return d.error.code;                      // ORION API: {"error": {"code"}}
    if (d && typeof d.detail === 'string') { const m = /^[a-z]+:([a-z_]+)$/.exec(d.detail); if (m) return m[1]; }   // "billing:<código>" · "news:<código>"
    return 'http_' + status;
  }
  async function call(path, { method = 'GET', body, timeout = 30000 } = {}) {
    const base = BASE();
    if (!base) return { ok: false, status: 0, code: 'unavailable' };
    let tok = '';
    try { tok = window.ORION_GET_TOKEN ? await window.ORION_GET_TOKEN() : ''; } catch (_) {}
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(base + path, {
        method, signal: ctl.signal, body: body ? JSON.stringify(body) : undefined,
        headers: Object.assign({ Authorization: 'Bearer ' + tok }, body ? { 'Content-Type': 'application/json' } : {}),
      });
      let data = null;
      try { data = await res.json(); } catch (_) {}
      if (res.status === 401 && window.ORION_SIGNOUT) window.ORION_SIGNOUT();
      return res.ok ? { ok: true, status: res.status, data } : { ok: false, status: res.status, data, code: errCode(data, res.status) };
    } catch (e) {
      return { ok: false, status: 0, code: e && e.name === 'AbortError' ? 'timeout' : 'network' };
    } finally { clearTimeout(timer); }
  }
  const errText = (prefix, code) => { const k = prefix + '.err.' + code; const s = T(k); return s === k ? T(prefix + '.err.generic') : s; };

  /* ── fábrica de painéis: mesma estrutura do painel ORION CODE (settings-card + set-head) ── */
  const panels = [];
  function makePanel({ id, title, icon, opener, build }) {
    let panel = null, open = false, gen = 0;
    function close(refocus = true) {
      if (!panel || !open) return;
      open = false; gen++;
      const el = panel;
      el.classList.remove('open');
      setTimeout(() => { if (el !== panel || !open) el.remove(); if (el === panel && !open) panel = null; }, 450);
      if (refocus && opener) opener.focus();
    }
    function show(arg) {
      // só um painel por vez: o Esc fecha Configurações, ORION CODE, Multitarefa e os outros painéis daqui
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      if (panel) panel.remove();
      const myGen = ++gen;
      const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': T('code.close'), title: T('code.close'), onclick: () => close() }, svg(ICON.x));
      const body = h('div', { class: 'v52-body' });
      panel = h('div', { id, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id + 'Title' },
        h('div', { class: 'settings-card' },
          h('header', { class: 'set-head' }, h('span', { class: 'ico' }, svg(icon)), h('div', {}, h('h2', { id: id + 'Title' }, title()), h('p', { id: id + 'Sub' }, '')), closeBtn),
          body,
          h('div', { class: 'v52-foot' }, h('button', { class: 'pill-btn primary block', type: 'button', onclick: () => close() }, T('code.close')))));
      panel.addEventListener('click', e => { if (e.target === panel) close(); });
      document.body.appendChild(panel);
      void panel.offsetWidth;                         // força o layout: a transição roda e o painel já conta como "aberto" no mesmo instante (a Orb não pisca)
      panel.classList.add('open');
      open = true;
      setTimeout(() => { if (open && panel) closeBtn.focus(); }, 80);
      build({ body, sub: t => { const s = $(id + 'Sub'); if (s) s.textContent = t || ''; }, alive: () => open && gen === myGen && !!panel, arg });
    }
    const api = { open: show, close, isOpen: () => open, id };
    panels.push(api);
    return api;
  }
  const closeAll = () => panels.forEach(p => p.isOpen() && p.close(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') panels.forEach(p => p.isOpen() && p.close()); });
  ['chatBtn', 'gearBtn', 'codeBtn', 'taskBtn'].forEach(id => { const b = $(id); if (b) b.addEventListener('click', closeAll, true); });   // abrir outro módulo fecha estes

  /* ═══════════════ PLANOS E FATURAMENTO ═══════════════ */
  const CHECKOUT_HOST = /^https:\/\/([a-z0-9-]+\.)*mercadopago\.com(\.[a-z]{2})?\//i;

  const plansPanel = makePanel({
    id: 'planPanel', title: () => T('plans.title'), icon: ICON.star,
    build: async ctx => {
      const { body, sub, alive } = ctx;
      let msg = null;
      const setMsg = (text, kind) => { if (msg) { msg.textContent = text || ''; if (kind) msg.dataset.kind = kind; else delete msg.dataset.kind; } };
      sub(T('plans.sub'));

      async function load() {
        body.replaceChildren(spinner(T('plans.loading')));
        const [cat, me, cur] = await Promise.all([call('/plans'), call('/billing/me'), call('/plan')]);
        if (!alive()) return null;
        if (!cat.ok || !cat.data || !Array.isArray(cat.data.plans)) {
          body.replaceChildren(h('div', { class: 'v52-center' }, errText('plans', 'generic'), h('button', { class: 'pill-btn sm', type: 'button', onclick: () => run() }, T('news.refresh'))));
          return null;
        }
        return { cat: cat.data, me: me.ok ? me.data : null, cur: cur.ok ? cur.data : null };
      }

      function draw(d) {
        const billingOn = !!(d.cat.billing && d.me);
        const curPlan = (d.me && d.me.plan) || (d.cur && d.cur.plan) || 'free';
        msg = h('p', { class: 'v52-msg', role: 'status', 'aria-live': 'polite' });
        const buttons = [];

        const cards = d.cat.plans.map(p => {
          const items = [];
          if ((p.features || []).includes('chat')) items.push(h('li', {}, T('plans.chat')));
          items.push(h('li', {}, T('plans.perDay', { n: num(p.daily_questions) })));
          if ((p.features || []).includes('history')) items.push(h('li', {}, T('plans.history')));
          items.push(h('li', {}, p.voices > 1 ? T('plans.voiceN', { n: p.voices }) : T('plans.voice1')));
          if (p.api) { items.push(h('li', {}, T('plans.apiYes', { m: num(p.api.monthly) }))); items.push(h('li', {}, T('plans.apiRpm', { n: num(p.api.per_minute) }))); }
          else items.push(h('li', { class: 'no' }, T('plans.apiNo')));

          let btn = null;
          if (p.id === curPlan) btn = h('button', { class: 'pill-btn block', type: 'button', disabled: true }, T('plans.current'));
          else if (p.id !== 'free') {
            const can = p.purchasable && billingOn;
            btn = h('button', { class: 'pill-btn primary block', type: 'button', disabled: !can, onclick: () => subscribe(p) },
              !p.purchasable ? T('plans.soon') : !billingOn ? T('plans.unavailable') : T('plans.subscribe', { name: p.name }));
            if (can) buttons.push(btn);
          }
          const price = p.price_cents ? h('div', { class: 'v52-price' }, T('plans.price', { p: money(p.price_cents) })) : h('div', { class: 'v52-price' }, p.id === 'free' ? T('plans.free0') : h('small', {}, T('plans.noPrice')));
          return h('section', { class: 'v52-plan' + (p.id === curPlan ? ' cur' : ''), 'aria-label': p.name },
            h('span', { class: 'v52-badge' }, T('plans.badge.' + p.id)), h('h3', {}, p.name), h('p', { class: 'v52-sub' }, T('plans.tag.' + p.id)), price, h('ul', { class: 'v52-list' }, items), btn);
        });

        async function subscribe(p) {
          buttons.forEach(b => { b.disabled = true; });
          setMsg(T('plans.redirecting'));
          const r = await call('/billing/checkout', { method: 'POST', body: { plan: p.id }, timeout: 40000 });
          if (!alive()) return;
          const url = r.ok && r.data && r.data.checkout_url;
          if (url && CHECKOUT_HOST.test(url)) { window.location.assign(url); return; }       // só levamos o usuário à página de pagamento do Mercado Pago
          buttons.forEach(b => { b.disabled = false; });
          setMsg(errText('plans', r.ok ? 'provider_error' : r.code), 'err');
        }

        const nodes = [h('div', { class: 'v52-plans' }, cards), h('p', { class: 'v52-note' }, T('plans.secure')), msg];

        if (billingOn) {
          const st = d.me.subscription || 'none';
          const lines = [h('div', { class: 'v52-row' }, h('h3', {}, T('plans.mine')), h('span', { class: 'plan-chip' }, T('plans.st.' + st)))];
          if (d.me.cancel_at_period_end && d.me.until) lines.push(h('p', { class: 'v52-sub' }, T('plans.cancelEnd', { d: fmtDate(d.me.until) })));
          else if (d.me.until && curPlan !== 'free') lines.push(h('p', { class: 'v52-sub' }, T('plans.until', { d: fmtDate(d.me.until) })));
          if (st === 'authorized' || st === 'paused') {
            let sure = false, timer = 0;
            const cb = h('button', { class: 'pill-btn danger sm', type: 'button' }, T('plans.cancel'));
            cb.addEventListener('click', async () => {
              if (!sure) { sure = true; cb.textContent = T('plans.cancelSure'); clearTimeout(timer); timer = setTimeout(() => { sure = false; cb.textContent = T('plans.cancel'); }, 5000); return; }
              cb.disabled = true;
              const r = await call('/billing/cancel', { method: 'POST' });
              if (!alive()) return;
              if (r.ok) { await run(); setMsg(T('plans.cancelDone'), 'ok'); if (window.ORION_PLAN_REFRESH) window.ORION_PLAN_REFRESH(); }
              else { cb.disabled = false; setMsg(errText('plans', r.code), 'err'); }
            });
            lines.push(h('div', {}, cb));
          }
          nodes.push(h('div', { class: 'v52-box' }, lines));
          const tx = d.me.transactions || [];
          nodes.push(h('div', { class: 'v52-box' }, h('h3', {}, T('plans.hist')),
            tx.length ? h('ul', { class: 'v52-hist' }, tx.map(x => {
              const k = T('plans.tx.' + x.kind) === 'plans.tx.' + x.kind ? String(x.kind || '') : T('plans.tx.' + x.kind);
              return h('li', {}, h('span', { class: x.kind === 'charge_failed' ? 'bad' : '' }, k), h('span', {}, x.amount_cents ? money(x.amount_cents) : ''), h('span', { class: 'd' }, fmtDate(String(x.ts || '').slice(0, 10))));
            })) : h('p', { class: 'v52-sub' }, T('plans.noHist'))));
        }
        body.replaceChildren(...nodes);
      }

      async function run() { const d = await load(); if (d && alive()) draw(d); return d; }
      const first = await run();

      // voltou da página de pagamento: o site NÃO ativa nada; só pergunta ao servidor (que confirma pelo webhook do Mercado Pago)
      if (first && ctx.arg && ctx.arg.confirming) {
        const before = (first.me && first.me.plan) || 'free';
        setMsg(T('plans.confirming'));
        for (let i = 0; i < 10 && alive(); i++) {
          await sleep(4000);
          if (!alive()) return;
          const r = await call('/billing/me');
          if (r.ok && r.data && r.data.plan !== 'free' && (r.data.plan !== before || r.data.subscription === 'authorized')) {
            const d2 = await load();
            if (d2 && alive()) { draw(d2); setMsg(T('plans.confirmed', { name: ((d2.cat.plans.find(p => p.id === r.data.plan) || {}).name) || r.data.plan.toUpperCase() }), 'ok'); }
            if (window.ORION_PLAN_REFRESH) window.ORION_PLAN_REFRESH();
            return;
          }
        }
        if (alive()) setMsg(T('plans.notYet'));
      }
    },
  });

  /* ═══════════════ ORION API ═══════════════ */
  const ID_RE = /^[0-9a-f]{8}$/;
  const copyText = async text => {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (_) {
      const ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;left:-9999px;top:0;opacity:0' });
      ta.value = text; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
      ta.remove(); return ok;
    }
  };

  const apiPanel = makePanel({
    id: 'apiPanel', title: () => T('api.title'), icon: ICON.code, opener: null,
    build: async ctx => {
      const { body, sub, alive } = ctx;
      sub(T('api.sub'));
      body.replaceChildren(spinner(T('plans.loading')));
      let secret = null;                                 // { key, name } — só na memória e só enquanto o painel está aberto
      let msgEl = null;

      async function load() {
        const u = await call('/api/usage');
        if (!alive()) return null;
        if (!u.ok) { body.replaceChildren(h('div', { class: 'v52-center' }, errText('api', u.code), h('button', { class: 'pill-btn sm', type: 'button', onclick: () => run() }, T('news.refresh')))); return null; }
        let keys = [];
        if (u.data.api) {
          const k = await call('/api/keys');
          if (!alive()) return null;
          if (!k.ok) { body.replaceChildren(h('div', { class: 'v52-center' }, errText('api', k.code))); return null; }
          keys = Array.isArray(k.data.keys) ? k.data.keys : [];
        }
        return { usage: u.data, keys };
      }
      const setMsg = (t, kind) => { if (msgEl) { msgEl.textContent = t || ''; if (kind) msgEl.dataset.kind = kind; else delete msgEl.dataset.kind; } };

      function draw(d) {
        const u = d.usage;
        if (!u.api) {
          body.replaceChildren(h('div', { class: 'v52-box' }, h('h3', {}, T('api.title')), h('p', { class: 'v52-sub' }, T('api.needPlan')),
            h('div', {}, h('button', { class: 'pill-btn primary', type: 'button', onclick: () => plansPanel.open() }, T('api.seePlans')))));
          return;
        }
        msgEl = h('p', { class: 'v52-msg', role: 'status', 'aria-live': 'polite' });
        const pct = u.limit > 0 ? Math.min(100, Math.round((u.used / u.limit) * 100)) : 0;
        const bar = h('div', { class: 'v52-bar' + (pct >= 100 ? ' full' : pct >= 80 ? ' warn' : ''), role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct, 'aria-label': T('api.usage') }, h('i', {}));
        requestAnimationFrame(() => { const i = bar.firstChild; if (i) i.style.width = pct + '%'; });
        const usageBox = h('div', { class: 'v52-box' },
          h('div', { class: 'v52-row' }, h('h3', {}, T('api.usage')), h('span', { class: 'plan-chip' }, T('api.plan', { name: u.plan_name }))),
          h('p', { class: 'v52-sub' }, T('api.usageSub')),
          h('div', { class: 'v52-big' }, num(u.used), ' ', h('small', {}, '/ ' + num(u.limit) + '  ·  ' + pct + '%')), bar,
          h('p', { class: 'v52-sub' }, T('api.perMin', { n: num(u.per_minute) }) + '  ·  ' + T('api.resets', { d: fmtDate(u.resets_on) })));

        // ── chaves ──
        const keyItems = d.keys.filter(k => k && ID_RE.test(k.id || '')).map(k => {
          const act = (label, sureLabel, handler) => {
            let sure = false, timer = 0;
            const b = h('button', { class: 'pill-btn sm' + (label === T('api.revoke') ? ' danger' : ''), type: 'button' }, label);
            b.addEventListener('click', async () => {
              if (!sure) { sure = true; b.textContent = sureLabel; clearTimeout(timer); timer = setTimeout(() => { sure = false; b.textContent = label; }, 5000); return; }
              b.disabled = true; await handler(); if (alive() && b.isConnected) b.disabled = false;
            });
            return b;
          };
          return h('li', { class: 'v52-key' },
            h('div', {}, h('b', {}, String(k.name || '')), h('div', { class: 'v52-mono' }, String(k.prefix || '') + '…' + String(k.last4 || '')), h('p', { class: 'v52-sub' }, T('api.createdOn', { d: fmtDate(k.created) }))),
            h('div', { class: 'v52-actions' },
              act(T('api.rotate'), T('api.rotateSure'), async () => {
                const r = await call('/api/keys/' + k.id + '/rotate', { method: 'POST' });
                if (!alive()) return;
                if (r.ok && r.data && r.data.key) { secret = { key: r.data.key, name: r.data.name }; await run(); } else setMsg(errText('api', r.code), 'err');
              }),
              act(T('api.revoke'), T('api.revokeSure'), async () => {
                const r = await call('/api/keys/' + k.id + '/revoke', { method: 'POST' });
                if (!alive()) return;
                if (r.ok) await run(); else setMsg(errText('api', r.code), 'err');
              })));
        });

        let secretBox = null;
        if (secret) {
          const copyBtn = h('button', { class: 'pill-btn sm', type: 'button' }, T('api.copy'));
          copyBtn.addEventListener('click', async () => { if (await copyText(secret.key)) { copyBtn.textContent = T('api.copied'); setTimeout(() => { copyBtn.textContent = T('api.copy'); }, 1800); } });
          secretBox = h('div', { class: 'v52-box v52-secret', role: 'group', 'aria-label': T('api.newKey') },
            h('h3', {}, T('api.newKey')), h('div', { class: 'v52-mono', tabindex: '0' }, secret.key), h('p', { class: 'v52-sub' }, T('api.copyNow')),
            h('div', { class: 'v52-actions' }, copyBtn, h('button', { class: 'pill-btn sm', type: 'button', onclick: () => { secret = null; run(); } }, T('api.gotIt'))));
        }

        const full = d.keys.length >= (u.max_keys || 5);
        const input = h('input', { class: 'v52-input', type: 'text', maxlength: 40, placeholder: T('api.namePh'), 'aria-label': T('api.namePh'), disabled: full });
        const form = h('form', { class: 'v52-form', onsubmit: async e => {
          e.preventDefault();
          if (full) return;
          const btn = form.querySelector('button'); btn.disabled = true;
          const r = await call('/api/keys', { method: 'POST', body: { name: input.value.trim() } });
          if (!alive()) return;
          if (r.ok && r.data && r.data.key) { secret = { key: r.data.key, name: r.data.name }; await run(); } else { btn.disabled = false; setMsg(errText('api', r.code), 'err'); }
        } }, input, h('button', { class: 'pill-btn primary', type: 'submit', disabled: full }, T('api.create')));
        const keysBox = h('div', { class: 'v52-box' }, h('h3', {}, T('api.keys')), h('p', { class: 'v52-sub' }, T('api.keysSub')),
          keyItems.length ? h('ul', { class: 'v52-keys' }, keyItems) : h('p', { class: 'v52-sub' }, T('api.noKeys')),
          form, full ? h('p', { class: 'v52-sub' }, T('api.keyLimit', { n: u.max_keys })) : null, msgEl);

        // ── exemplo (endereço real do servidor; a chave é um marcador) ──
        const KEY = LANG() === 'pt' ? 'SUA_CHAVE' : 'YOUR_KEY', HELLO = LANG() === 'pt' ? 'Olá, ORION!' : 'Hello, ORION!', URL = BASE() + '/v1/chat';
        const SAMPLES = {
          curl: `curl ${URL} \\\n  -H "Authorization: Bearer ${KEY}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"message": "${HELLO}"}'`,
          Python: `import requests\n\nr = requests.post(\n    "${URL}",\n    headers={"Authorization": "Bearer ${KEY}"},\n    json={"message": "${HELLO}"},\n    timeout=60,\n)\nprint(r.json()["reply"])`,
          JavaScript: `const r = await fetch("${URL}", {\n  method: "POST",\n  headers: {\n    "Authorization": "Bearer ${KEY}",\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify({ message: "${HELLO}" }),\n});\nconsole.log((await r.json()).reply);`,
        };
        let cur = 'curl';
        const pre = h('pre', { class: 'v52-code', tabindex: '0' }, SAMPLES[cur]);
        const exCopy = h('button', { class: 'pill-btn sm', type: 'button' }, T('api.copy'));
        exCopy.addEventListener('click', async () => { if (await copyText(SAMPLES[cur])) { exCopy.textContent = T('api.copied'); setTimeout(() => { exCopy.textContent = T('api.copy'); }, 1800); } });
        const tabs = h('div', { class: 'v52-tabs', role: 'tablist' }, Object.keys(SAMPLES).map(k => h('button', { class: 'v52-tab', type: 'button', role: 'tab', 'aria-selected': String(k === cur), onclick: e => {
          cur = k; pre.textContent = SAMPLES[k]; tabs.querySelectorAll('.v52-tab').forEach(b => b.setAttribute('aria-selected', String(b === e.currentTarget)));
        } }, k)));
        const exBox = h('div', { class: 'v52-box' }, h('div', { class: 'v52-row' }, h('h3', {}, T('api.example')), exCopy), tabs, pre);

        // ── documentação ──
        const docsText = [
          'POST /v1/chat     {"message": "...", "model": "(opcional)"}',
          '  → {"id", "reply", "model", "sources", "usage": {"used", "limit"}}',
          'GET  /v1/models   → {"default", "models": [{"id", "label"}]}',
          'GET  /v1/usage    → uso e limites do mês', '',
          '400 invalid_request · model_unavailable', '401 invalid_api_key', '403 plan_required', '413 payload_too_large',
          '429 rate_limited (header Retry-After) · quota_exceeded', '500 internal_error', '502 provider_error', '503 provider_busy · model_unavailable · api_unavailable', '504 timeout',
        ].join('\n');
        const docs = h('details', { class: 'v52-box v52-docs' }, h('summary', {}, T('api.docs')),
          h('p', { class: 'v52-sub' }, T('api.docsIntro')), h('pre', { class: 'v52-code', tabindex: '0' }, docsText), h('p', { class: 'v52-sub' }, T('api.docsErrors')),
          h('p', { class: 'v52-sub' }, T('api.docsSecurity')),
          h('p', { class: 'v52-sub' }, h('a', { class: 'v52-link', href: DOCS_URL, target: '_blank', rel: 'noopener noreferrer' }, T('api.docsFull'))));

        body.replaceChildren(...[usageBox, secretBox, keysBox, exBox, docs].filter(Boolean));
      }
      async function run() { const d = await load(); if (d && alive()) draw(d); }
      await run();
    },
  });

  /* ═══════════════ RESUMO DO DIA ═══════════════ */
  const CATS = ['mundo', 'tecnologia', 'ia', 'ciencia', 'economia', 'negocios', 'atualidades'];
  const newsBtn = $('newsBtn');
  const newsPanel = makePanel({
    id: 'newsPanel', title: () => T('news.title'), icon: ICON.news, opener: newsBtn,
    build: async ctx => {
      const { body, sub, alive } = ctx;
      let data = null, active = null, busy = false;

      function draw() {
        const cats = data.categories || [];
        const byId = id => cats.find(c => c.id === id) || { id, items: [] };
        if (!active || !CATS.includes(active)) active = (cats.find(c => (c.items || []).length) || cats[0] || { id: 'mundo' }).id;
        const when = new Date(data.generated_at);
        sub(fmtDate(data.date) + (isNaN(when) ? '' : '  ·  ' + T('news.updated', { t: fmtTime(when) })));
        const refresh = h('button', { class: 'pill-btn sm', type: 'button', disabled: busy, onclick: () => load(true) }, T('news.refresh'));
        const tabs = h('div', { class: 'v52-tabs', role: 'tablist', 'aria-label': T('news.title') }, CATS.map(id => {
          const n = (byId(id).items || []).length;
          return h('button', { class: 'v52-tab', type: 'button', role: 'tab', 'aria-selected': String(id === active), onclick: () => { active = id; draw(); } }, T('news.cat.' + id) + (n ? ' · ' + n : ''));
        }));
        const items = (byId(active).items || []).map(it => {
          const href = safeHref(it.url);
          const srcs = (it.sources || []).map(s => ({ name: String(s.name || ''), url: safeHref(s.url) })).filter(s => s.name);
          const sources = [];
          srcs.forEach((s, i) => { if (i) sources.push(' · '); sources.push(s.url ? h('a', { class: 'v52-link', href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.name) : s.name); });
          const st = ['confirmed', 'developing', 'single'].includes(it.status) ? it.status : 'single';
          return h('li', { class: 'v52-new' },
            href ? h('a', { href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': String(it.title || '') + ' — ' + T('news.read') }, String(it.title || '')) : h('span', {}, String(it.title || '')),
            it.summary ? h('p', {}, String(it.summary)) : null,
            h('div', { class: 'v52-meta' },
              h('span', { class: 'v52-st', 'data-st': st }, st === 'confirmed' ? T('news.st.confirmed', { n: it.n_sources || srcs.length || 2 }) : T('news.st.' + st)),
              h('span', {}, sources), h('span', {}, fmtWhen(it.published)), it.lang === 'en' && LANG() !== 'en' ? h('span', {}, T('news.langEn')) : null));
        });
        const notes = [];
        if (data.stale) notes.push(h('p', { class: 'v52-msg', role: 'status', 'data-kind': 'err' }, T('news.stale')));
        if ((data.unavailable || []).length) notes.push(h('p', { class: 'v52-note' }, T('news.srcFail', { n: data.unavailable.length })));
        body.replaceChildren(h('div', { class: 'v52-row' }, tabs, refresh), ...notes,
          items.length ? h('ul', { class: 'v52-news' }, items) : h('div', { class: 'v52-center' }, T('news.empty')),
          h('p', { class: 'v52-note' }, T('news.note')));
      }

      async function load(refresh) {
        if (busy) return;
        busy = true;
        if (!data) body.replaceChildren(spinner(T('news.loading')));
        else draw();
        const r = await call('/news/daily' + (refresh ? '?refresh=true' : ''), { timeout: 40000 });
        busy = false;
        if (!alive()) return;
        if (r.ok && r.data && Array.isArray(r.data.categories)) { data = r.data; draw(); return; }
        if (data) { draw(); return; }
        sub('');
        body.replaceChildren(h('div', { class: 'v52-center' }, T('news.error'), h('button', { class: 'pill-btn sm', type: 'button', onclick: () => load(false) }, T('news.refresh'))));
      }
      sub('');
      await load(false);
    },
  });
  if (newsBtn) newsBtn.addEventListener('click', () => { if (newsPanel.isOpen()) newsPanel.close(); else newsPanel.open(); });

  /* ── exposição e retorno do pagamento ── */
  window.ORION_PLANS = { open: arg => plansPanel.open(arg) };
  window.ORION_API_PANEL = { open: () => apiPanel.open() };
  window.ORION_NEWS = { open: () => newsPanel.open() };

  try {
    const q = new URLSearchParams(location.search);
    if (q.get('checkout') === 'return') {              // voltou da página de pagamento do Mercado Pago
      history.replaceState(null, '', location.pathname);
      const go = () => setTimeout(() => plansPanel.open({ confirming: true }), 1600);   // espera a entrada do site terminar
      if (window.ORION_AUTH_READY) window.ORION_AUTH_READY.then(go); else go();
    }
  } catch (_) {}
})();
