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
  /* O app.js roda dentro de um bloco (standby): I18N e ORION_CONFIG não são globais. Ele expõe window.ORION_APP (ponte) e é só por ela
     que este módulo lê idioma, textos e o endereço do servidor. Sem a ponte, cai para os textos em português de window.ORION_I18N. */
  const APP = () => window.ORION_APP || null;
  const T = (k, v) => {
    const a = APP();
    if (a) return a.t(k, v);
    const D = window.ORION_I18N || {};
    let s = (D.pt && D.pt[k]) || (D.en && D.en[k]) || k;
    if (v) for (const x in v) s = s.split('{' + x + '}').join(v[x]);
    return s;
  };
  const LOCALE = () => (APP() ? APP().locale() : 'pt-BR');
  const LANG = () => (APP() ? APP().lang() : 'pt');
  const BASE = () => ((APP() && APP().apiUrl()) || '').replace(/\/$/, '');
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
  const svg = (path, size = 19) => {
    const t = document.createElement('template');
    t.innerHTML = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
    return t.content.firstChild;
  };
  const ICON = {
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    star: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
    code: '<path d="M8.5 6.5L3 12l5.5 5.5M15.5 6.5L21 12l-5.5 5.5M13.5 4.5l-3 15"/>',
    news: '<path d="M4 5h13a1 1 0 0 1 1 1v13H6a2 2 0 0 1-2-2V5z"/><path d="M18 9h2a1 1 0 0 1 1 1v7a2 2 0 0 1-2 2h-1"/><path d="M8 9h6M8 13h6M8 16h3"/>',
    bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>', chart: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18M10.6 5.2A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.1 3.9M6.5 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.6L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.6L20 16M20 20v-4h-4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    play: '<path d="M8 5l11 7-11 7z"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>', up: '<path d="M12 19V6M6 11l6-6 6 6"/>',
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
  function makePanel({ id, title, icon, opener, build, onClose }) {
    let panel = null, open = false, gen = 0;
    function close(refocus = true) {
      if (!panel || !open) return;
      open = false; gen++;
      if (onClose) { try { onClose(); } catch (_) {} }
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

  const ib = icon => h('span', { class: 'v52-ib' }, svg(icon, 18));
  const maskKey = (prefix, last4) => String(prefix || '') + '•'.repeat(28) + String(last4 || '');

  const apiPanel = makePanel({
    id: 'apiPanel', title: () => T('api.title'), icon: ICON.code, opener: null,
    build: async ctx => {
      const { body, sub, alive } = ctx;
      sub(T('api.hero'));
      const titleEl = $('apiPanelTitle');
      if (titleEl) titleEl.replaceChildren('ORION ', h('span', { class: 'v52-acc' }, 'API'));   // "API" em destaque (só DOM, sem HTML)
      body.replaceChildren(spinner(T('plans.loading')));
      let secret = null;                                 // { key, id, name } — só na memória e só enquanto o painel está aberto
      let revealed = false, data = null, msgEl = null;

      async function load() {
        const u = await call('/api/usage');
        if (!alive()) return null;
        if (!u.ok) { body.replaceChildren(h('div', { class: 'v52-center' }, errText('api', u.code), h('button', { class: 'pill-btn sm', type: 'button', onclick: () => run() }, T('news.refresh')))); return null; }
        let keys = [];
        if (u.data.api) {
          const k = await call('/api/keys');
          if (!alive()) return null;
          if (!k.ok) { body.replaceChildren(h('div', { class: 'v52-center' }, errText('api', k.code))); return null; }
          keys = (Array.isArray(k.data.keys) ? k.data.keys : []).filter(x => x && ID_RE.test(x.id || ''));
        }
        return { usage: u.data, keys };
      }
      const setMsg = (t, kind) => { if (msgEl) { msgEl.textContent = t || ''; if (kind) msgEl.dataset.kind = kind; else delete msgEl.dataset.kind; } };

      /* botão com confirmação em 2 cliques (revogar/regenerar mudam a chave que está em uso) */
      const sure = (icon, label, sureLabel, cls, handler) => {
        let armed = false, timer = 0;
        const b = h('button', { class: 'pill-btn sm' + (cls ? ' ' + cls : ''), type: 'button' }, svg(icon, 15), h('span', {}, label));
        const txt = b.lastChild;
        b.addEventListener('click', async () => {
          if (!armed) { armed = true; txt.textContent = sureLabel; clearTimeout(timer); timer = setTimeout(() => { armed = false; txt.textContent = label; }, 5000); return; }
          b.disabled = true; await handler(); if (alive() && b.isConnected) b.disabled = false;
        });
        return b;
      };
      const rotateKey = k => async () => {
        const r = await call('/api/keys/' + k.id + '/rotate', { method: 'POST' });
        if (!alive()) return;
        if (r.ok && r.data && r.data.key) { secret = { key: r.data.key, id: r.data.id, name: r.data.name }; revealed = false; await run(); } else setMsg(errText('api', r.code), 'err');
      };
      const revokeKey = k => async () => {
        const r = await call('/api/keys/' + k.id + '/revoke', { method: 'POST' });
        if (!alive()) return;
        if (r.ok) { if (secret && secret.id === k.id) secret = null; await run(); } else setMsg(errText('api', r.code), 'err');
      };
      const copyBtn = (getText, enabled, label) => {
        const b = h('button', { class: 'pill-btn primary', type: 'button', disabled: !enabled, title: enabled ? '' : T('api.copyHint') }, svg(ICON.copy, 16), h('span', {}, label || T('api.copy')));
        b.addEventListener('click', async () => { if (await copyText(getText())) { b.lastChild.textContent = T('api.copied'); setTimeout(() => { b.lastChild.textContent = label || T('api.copy'); }, 1800); } });
        return b;
      };
      const ring = pct => {
        const R = 52, C = 2 * Math.PI * R;
        const wrap = h('div', { class: 'v52-ring' + (pct >= 100 ? ' full' : pct >= 80 ? ' warn' : ''), role: 'img', 'aria-label': pct + '% ' + T('api.used2') });
        const t = document.createElement('template');
        t.innerHTML = '<svg viewBox="0 0 136 136" aria-hidden="true"><circle class="bg" cx="68" cy="68" r="' + R + '"/><circle class="fg" cx="68" cy="68" r="' + R + '" stroke-dasharray="' + C.toFixed(2) + '" stroke-dashoffset="' + C.toFixed(2) + '"/></svg>';
        wrap.append(t.content.firstChild, h('div', { class: 'mid' }, h('b', {}, pct + '%'), h('span', {}, T('api.used2'))));
        requestAnimationFrame(() => { const fg = wrap.querySelector('.fg'); if (fg) fg.style.strokeDashoffset = (C * (1 - pct / 100)).toFixed(2); });
        return wrap;
      };
      const card = (icon, title, subtitle, ...kids) => h('div', { class: 'v52-box' }, h('div', { class: 'v52-ch' }, ib(icon), h('div', {}, h('h3', {}, title), subtitle ? h('p', {}, subtitle) : null)), ...kids);

      function draw(d) {
        const u = d.usage;
        if (!u.api) {
          body.replaceChildren(h('div', { class: 'v52-box' }, h('h3', {}, T('api.title')), h('p', { class: 'v52-sub' }, T('api.needPlan')),
            h('div', {}, h('button', { class: 'pill-btn primary', type: 'button', onclick: () => plansPanel.open() }, T('api.seePlans')))));
          return;
        }
        msgEl = h('p', { class: 'v52-msg', role: 'status', 'aria-live': 'polite' });
        const keys = d.keys, primary = keys[0], others = keys.slice(1), full = keys.length >= (u.max_keys || 1);

        /* — Sua API Key — */
        const form = placeholder => {
          const input = h('input', { class: 'v52-input', type: 'text', maxlength: 40, placeholder, 'aria-label': placeholder });
          const f = h('form', { class: 'v52-form', onsubmit: async e => {
            e.preventDefault();
            const btn = f.querySelector('button'); btn.disabled = true;
            const r = await call('/api/keys', { method: 'POST', body: { name: input.value.trim() } });
            if (!alive()) return;
            if (r.ok && r.data && r.data.key) { secret = { key: r.data.key, id: r.data.id, name: r.data.name }; revealed = false; await run(); } else { btn.disabled = false; setMsg(errText('api', r.code), 'err'); }
          } }, input, h('button', { class: 'pill-btn primary', type: 'submit' }, T(keys.length ? 'api.addKey' : 'api.create')));
          return f;
        };
        const keyBits = [];
        if (!primary) {
          keyBits.push(h('p', { class: 'v52-sub' }, T('api.firstKey')), form(T('api.namePh')));
        } else {
          const mine = !!(secret && secret.id === primary.id);
          const shown = mine ? (revealed ? secret.key : maskKey(secret.key.slice(0, 10), secret.key.slice(-4))) : maskKey(primary.prefix, primary.last4);
          const eye = mine ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': T(revealed ? 'api.eyeHide' : 'api.eyeShow'), 'aria-pressed': String(revealed), title: T(revealed ? 'api.eyeHide' : 'api.eyeShow'),
            onclick: () => { revealed = !revealed; draw(data); } }, svg(revealed ? ICON.eyeOff : ICON.eye, 18)) : null;
          keyBits.push(
            h('div', { class: 'v52-keyrow' }, h('div', { class: 'v52-keyfield' }, h('span', { class: 'v52-mono', tabindex: '0' }, shown), eye), copyBtn(() => secret.key, mine)),
            h('p', { class: 'v52-sub' }, mine ? T('api.copyNow') : T('api.copyHint')),
            h('div', { class: 'v52-actions' }, sure(ICON.refresh, T('api.regen'), T('api.regenSure'), '', rotateKey(primary)), sure(ICON.trash, T('api.revokeKey'), T('api.revokeSure'), 'danger', revokeKey(primary)),
              mine ? h('button', { class: 'pill-btn sm', type: 'button', onclick: () => { secret = null; revealed = false; draw(data); } }, T('api.gotIt')) : null));
        }
        if (secret && primary && secret.id !== primary.id) {      // chave nova que não é a principal: aparece inteira aqui, uma vez
          const sb = h('div', { class: 'v52-box v52-secret', role: 'group', 'aria-label': T('api.newKey') },
            h('h3', {}, T('api.newKey')), h('div', { class: 'v52-mono', tabindex: '0' }, secret.key), h('p', { class: 'v52-sub' }, T('api.copyNow')),
            h('div', { class: 'v52-actions' }, copyBtn(() => secret.key, true), h('button', { class: 'pill-btn sm', type: 'button', onclick: () => { secret = null; draw(data); } }, T('api.gotIt'))));
          keyBits.push(sb);
        }
        if (others.length) {
          keyBits.push(h('h3', { class: 'v52-sub' }, T('api.others')), h('ul', { class: 'v52-others' }, others.map(k => h('li', { class: 'v52-key' },
            h('div', {}, h('b', {}, String(k.name || '')), h('div', { class: 'v52-mono' }, maskKey(k.prefix, k.last4)), h('p', { class: 'v52-sub' }, T('api.createdOn', { d: fmtDate(k.created) }))),
            h('div', { class: 'v52-actions' }, sure(ICON.refresh, T('api.rotate'), T('api.rotateSure'), '', rotateKey(k)), sure(ICON.trash, T('api.revoke'), T('api.revokeSure'), 'danger', revokeKey(k)))))));
        }
        if (primary && !full) keyBits.push(form(T('api.namePh')));
        if (primary && full && u.max_keys > 1) keyBits.push(h('p', { class: 'v52-sub' }, T('api.keyLimit', { n: u.max_keys })));
        if (primary && u.max_keys === 1) keyBits.push(h('p', { class: 'v52-sub' }, T('api.keyLimit', { n: 1 })));
        keyBits.push(msgEl);
        const keyCard = card(ICON.bolt, T('api.yourKey'), T('api.yourKeySub'), ...keyBits);

        /* — Uso da API — */
        const pct = u.limit > 0 ? Math.min(100, Math.round((u.used / u.limit) * 100)) : 0;
        const bar = h('div', { class: 'v52-bar' + (pct >= 100 ? ' full' : pct >= 80 ? ' warn' : ''), role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct, 'aria-label': T('api.usage') }, h('i', {}));
        requestAnimationFrame(() => { const i = bar.firstChild; if (i) i.style.width = pct + '%'; });
        const planMini = h('div', { class: 'v52-planmini' },
          h('div', { class: 'top' }, h('span', {}, T('plans.current')), h('span', { class: 'v52-badge' }, T('plans.badge.' + u.plan))),
          h('div', { class: 'v52-planname' }, u.plan_name), h('p', { class: 'v52-sub' }, T('plans.tag.' + u.plan)),
          h('p', { class: 'v52-sub' }, T('api.perMin', { n: num(u.per_minute) })),
          h('div', {}, h('button', { class: 'pill-btn sm', type: 'button', onclick: () => plansPanel.open() }, T('api.planDetails'))));
        const usageCard = card(ICON.chart, T('api.usage'), T('api.usageSub'),
          h('div', { class: 'v52-usage' }, ring(pct),
            h('div', { class: 'v52-stats' },
              h('div', { class: 'v52-stat' }, ib(ICON.chart), h('div', { style: 'flex:1;min-width:0' }, h('small', {}, T('api.reqMonth')), h('b', {}, num(u.used), ' ', h('i', {}, '/ ' + num(u.limit))), bar)),
              h('div', { class: 'v52-stat' }, ib(ICON.book), h('div', {}, h('small', {}, T('api.renewal')), h('b', {}, fmtDate(u.resets_on))))),
            planMini));

        /* — Exemplo de requisição (endereço real; a chave é só um marcador) — */
        const KEY = LANG() === 'pt' ? 'SUA_CHAVE' : 'YOUR_KEY', HELLO = LANG() === 'pt' ? 'Olá, ORION!' : 'Hello, ORION!', URL = BASE() + '/v1/chat';
        const SAMPLES = {
          curl: `curl ${URL} \\\n  -H "Authorization: Bearer ${KEY}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"message": "${HELLO}"}'`,
          Python: `import requests\n\nr = requests.post(\n    "${URL}",\n    headers={"Authorization": "Bearer ${KEY}"},\n    json={"message": "${HELLO}"},\n    timeout=60,\n)\nprint(r.json()["reply"])`,
          JavaScript: `const r = await fetch("${URL}", {\n  method: "POST",\n  headers: {\n    "Authorization": "Bearer ${KEY}",\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify({ message: "${HELLO}" }),\n});\nconsole.log((await r.json()).reply);`,
        };
        let cur = 'curl';
        const pre = h('pre', { class: 'v52-code num', tabindex: '0' });
        const paint = () => pre.replaceChildren(...SAMPLES[cur].split('\n').map(l => h('span', { class: 'l' }, l || ' ')));
        paint();
        const tabs = h('div', { class: 'v52-tabs', role: 'tablist' }, Object.keys(SAMPLES).map(k => h('button', { class: 'v52-tab', type: 'button', role: 'tab', 'aria-selected': String(k === cur), onclick: e => {
          cur = k; paint(); tabs.querySelectorAll('.v52-tab').forEach(b => b.setAttribute('aria-selected', String(b === e.currentTarget)));
        } }, k)));
        const exCard = h('div', { class: 'v52-box' }, h('div', { class: 'v52-row' }, h('div', { class: 'v52-ch' }, ib(ICON.code), h('div', {}, h('h3', {}, T('api.example')))), copyBtn(() => SAMPLES[cur], true)), tabs, pre);

        /* — coluna da direita: documentação e recursos — */
        const docsText = [
          'POST /v1/chat     {"message": "...", "model": "(opcional)"}',
          '  → {"id", "reply", "model", "sources", "usage": {"used", "limit"}}',
          'GET  /v1/models   → {"default", "models": [{"id", "label"}]}',
          'GET  /v1/usage    → uso e limites do mês', '',
          '400 invalid_request · model_unavailable', '401 invalid_api_key', '403 plan_required', '413 payload_too_large',
          '429 rate_limited (header Retry-After) · quota_exceeded', '500 internal_error', '502 provider_error', '503 provider_busy · model_unavailable · api_unavailable', '504 timeout',
        ].join('\n');
        const docsCard = card(ICON.book, T('api.docs'), T('api.docsCard'),
          h('a', { class: 'pill-btn primary block', href: DOCS_URL, target: '_blank', rel: 'noopener noreferrer', style: 'text-decoration:none;display:flex;align-items:center;justify-content:center' }, T('api.docsGo')),
          h('details', { class: 'v52-docs' }, h('summary', {}, T('api.quick')),
            h('p', { class: 'v52-sub' }, T('api.docsIntro')), h('pre', { class: 'v52-code', tabindex: '0' }, docsText), h('p', { class: 'v52-sub' }, T('api.docsErrors')), h('p', { class: 'v52-sub' }, T('api.docsSecurity'))));
        const resCard = card(ICON.bolt, T('api.resTitle'), '', h('ul', { class: 'v52-list' }, ['api.res1', 'api.res2', 'api.res3', 'api.res4', 'api.res5'].map(k => h('li', {}, T(k)))));

        body.replaceChildren(h('div', { class: 'v52-api' }, h('div', { class: 'v52-col' }, keyCard, usageCard, exCard), h('div', { class: 'v52-col' }, docsCard, resCard)), h('div', { class: 'v52-online' }, T('api.online')));
      }
      async function run() { const d = await load(); if (d && alive()) { data = d; draw(d); } }
      await run();
    },
  });

  /* ═══════════════ RESUMO DO DIA ═══════════════ */
  const CATS = ['mundo', 'tecnologia', 'ia', 'ciencia', 'economia', 'negocios', 'atualidades'];
  const SPEAK_ORDER = ['mundo', 'tecnologia', 'economia', 'ia', 'ciencia', 'negocios', 'atualidades'];
  const SPEAK_MAX = 480;                               // caracteres falados (a voz custa cota de TTS): só as principais manchetes
  const newsBtn = $('newsBtn');
  let briefSpeaking = false;                           // o ORION está lendo o resumo agora?

  /* Texto que o ORION fala: só o que as fontes publicaram (manchetes reais), até 4 categorias, na língua da interface quando houver. */
  function briefText(d) {
    const lang = LANG(), parts = [];
    const day = new Date(String(d.date || '') + 'T12:00:00');
    parts.push(T('news.say.intro', { d: isNaN(day) ? '' : new Intl.DateTimeFormat(LOCALE(), { day: 'numeric', month: 'long' }).format(day) }));
    let used = 0;
    for (const id of SPEAK_ORDER) {
      if (used >= 4) break;
      const cat = (d.categories || []).find(c => c.id === id), items = (cat && cat.items) || [];
      const it = items.find(i => i.lang === lang) || items[0];
      const title = it && String(it.title || '').trim().slice(0, 140);
      if (!title) continue;
      const foreign = it.lang !== lang ? T('news.say.foreign') + ' ' : '';
      const next = T('news.cat.' + id) + ': ' + foreign + title + (/[.!?…]$/.test(title) ? '' : '.') + (it.status === 'developing' ? ' ' + T('news.say.dev') : '');
      if (parts.join(' ').length + next.length + 1 > SPEAK_MAX) break;
      parts.push(next); used++;
    }
    return used ? parts.join(' ') : '';
  }
  const stopBrief = () => { if (briefSpeaking && window.ORION_APP && window.ORION_APP.stopSpeak) window.ORION_APP.stopSpeak(); briefSpeaking = false; };
  const newsPanel = makePanel({
    id: 'newsPanel', title: () => T('news.title'), icon: ICON.news, opener: newsBtn, onClose: () => stopBrief(),
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
        const canSay = !!(window.ORION_APP && window.ORION_APP.speak);
        const listen = canSay ? h('button', { class: 'pill-btn sm', type: 'button', 'aria-pressed': String(briefSpeaking), onclick: () => (briefSpeaking ? endListen() : startListen()) },
          svg(briefSpeaking ? ICON.stop : ICON.play, 14), h('span', {}, T(briefSpeaking ? 'news.stop' : 'news.listen'))) : null;
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
        body.replaceChildren(h('div', { class: 'v52-row' }, tabs, h('div', { class: 'v52-actions' }, listen, refresh)), ...notes,
          items.length ? h('ul', { class: 'v52-news' }, items) : h('div', { class: 'v52-center' }, T('news.empty')),
          h('p', { class: 'v52-note' }, T('news.note')));
      }

      function startListen() {
        const txt = data && briefText(data);
        if (!txt || !window.ORION_APP || !window.ORION_APP.speak) return false;
        briefSpeaking = !!window.ORION_APP.speak(txt, () => { briefSpeaking = false; if (alive() && data) draw(); });   // a própria Orb fala: mesma voz e mesmos estados de uma resposta
        if (alive() && data) draw();
        return briefSpeaking;
      }
      function endListen() { stopBrief(); if (alive() && data) draw(); }

      async function load(refresh) {
        if (busy) return;
        busy = true;
        if (!data) body.replaceChildren(spinner(T('news.loading')));
        else draw();
        const r = await call('/news/daily' + (refresh ? '?refresh=true' : ''), { timeout: 40000 });
        busy = false;
        if (!alive()) return;
        if (r.ok && r.data && Array.isArray(r.data.categories)) { const first = !data; data = r.data; draw(); if (first && !refresh) startListen(); return; }   // ao abrir, o ORION lê o resumo
        if (data) { draw(); return; }
        sub('');
        body.replaceChildren(h('div', { class: 'v52-center' }, T('news.error'), h('button', { class: 'pill-btn sm', type: 'button', onclick: () => load(false) }, T('news.refresh'))));
      }
      sub('');
      await load(false);
    },
  });
  if (newsBtn) newsBtn.addEventListener('click', () => { if (newsPanel.isOpen()) newsPanel.close(); else newsPanel.open(); });

  /* ═══════════════ BARRA DE BOTÕES "TIPO iPHONE" ═══════════════
     Com um módulo aberto (body.module-open, marcado por orion-v5.js), a barra do dock some e fica só uma barrinha fina no centro,
     como o indicador do iPhone: ela não cobre mais o conteúdo. Toque/clique/Enter (ou arrastar para cima) mostra a barra de novo;
     ela se recolhe sozinha depois de alguns segundos, ao escolher um botão, com Esc ou ao fechar o módulo. */
  (function dockHandle() {
    const nav = document.querySelector('.dock');
    if (!nav) return;
    const handle = h('button', { id: 'dockHandle', class: 'dock-handle', type: 'button', 'aria-expanded': 'false', 'aria-label': T('dock.show'), title: T('dock.show') });
    document.body.appendChild(handle);
    let timer = 0, swiped = false, y0 = null;
    const set = on => {
      document.body.classList.toggle('dock-open', on);
      handle.setAttribute('aria-expanded', String(on));
      clearTimeout(timer);
      if (on) timer = setTimeout(() => set(false), 4500);
    };
    handle.addEventListener('click', e => {
      if (swiped) { swiped = false; return; }
      const on = !document.body.classList.contains('dock-open');
      set(on);
      if (on && e.detail === 0) { const b = nav.querySelector('.dock-btn'); if (b) b.focus(); }   // por teclado: o foco já vai para a barra
    });
    handle.addEventListener('pointerdown', e => { y0 = e.clientY; });
    handle.addEventListener('pointerup', e => { if (y0 !== null && y0 - e.clientY > 12) { swiped = true; set(true); } y0 = null; });
    nav.addEventListener('pointermove', () => { if (document.body.classList.contains('dock-open')) set(true); });   // mexendo na barra: não recolhe
    nav.addEventListener('focusin', () => { if (document.body.classList.contains('dock-open')) set(true); });
    nav.addEventListener('click', e => { if (e.target.closest('.dock-btn')) setTimeout(() => set(false), 120); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
    new MutationObserver(() => {
      if (!document.body.classList.contains('module-open')) set(false);        // nenhum módulo aberto: a barra volta ao normal
      handle.setAttribute('aria-label', T('dock.show')); handle.title = T('dock.show');
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  })();

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
