/* Business OS: compatibility layer for legacy/business-os.html.
 * The legacy page was a claude.ai Artifact and called `window.claude.use('db' | 'mcp' | 'sample' | 'user')`.
 * This file provides the same objects, backed by this server:
 *   db     -> /api/v1/docs + /api/v1/sync (polling change feed, optimistic local writes)
 *   mcp    -> Make inbox calls go to the native InboxPilot API; Supermetrics to /api/integrations/supermetrics
 *   sample -> /api/ai/sample (Claude, streamed; the page's own tools run here in the browser)
 *   user   -> /api/v1/me
 */
(function () {
  'use strict';
  var POLL_MS = 3000;

  // deep link /app#biz:kidscare (or #biz:kidscare/sales): the legacy page restores its route from localStorage
  var hm = location.hash.match(/^#(biz:[a-z]+|[a-z]+)(?:\/([a-z]+))?$/);
  if (hm) { try { var nav = JSON.parse(localStorage.getItem('bos.nav') || '{}') || {}; nav.route = hm[1]; nav.tab = hm[2] || 'briefing'; localStorage.setItem('bos.nav', JSON.stringify(nav)); history.replaceState(null, '', location.pathname); } catch (e) {} }

  function apiErr(status, body) {
    var e = (body && body.error) || {};
    var code = e.code || (status === 401 ? 'unauthenticated' : status === 403 ? 'permission-denied' : status === 409 ? 'aborted' : 'error');
    var err = new Error(e.message || 'Request failed (' + status + ')');
    err.code = code; err.status = status;
    return err;
  }
  async function api(method, url, body) {
    var r = await fetch(url, { method: method, credentials: 'same-origin', headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
    if (r.status === 401) { location.href = '/login?next=' + encodeURIComponent(location.pathname); throw apiErr(401, null); }
    var data = null; try { data = await r.json(); } catch (e) {}
    if (!r.ok) throw apiErr(r.status, data);
    return data;
  }
  var enc = function (s) { return encodeURIComponent(s); };
  var docUrl = function (c, id) { return '/api/v1/docs/' + enc(c) + '/' + enc(id); };
  var genId = function () { var a = new Uint8Array(15); crypto.getRandomValues(a); return btoa(String.fromCharCode.apply(null, a)).replace(/[+/=]/g, function (c) { return c === '+' ? '-' : c === '/' ? '_' : ''; }).slice(0, 20); };
  var clone = function (x) { return x == null ? x : JSON.parse(JSON.stringify(x)); };

  /* ---------------- db ---------------- */
  var cache = {};     // collection -> Map(id -> data)
  var subs = {};      // collection -> [{cb, err}]
  var seq = 0, loaded = false, timer = null, polling = false, wantCols = new Set();

  function snapOf(c) {
    var m = cache[c] || new Map();
    var docs = []; m.forEach(function (d, id) { docs.push(docSnap(id, d)); });
    return { docs: docs, size: docs.length, empty: !docs.length, metadata: { fromCache: !loaded, hasPendingWrites: false }, forEach: function (f) { docs.forEach(f); } };
  }
  function docSnap(id, d) { return { id: id, exists: d != null, data: function () { return clone(d); }, get: function (k) { return d ? d[k] : undefined; } }; }
  function emit(c) { (subs[c] || []).forEach(function (s) { try { s.cb(snapOf(c)); } catch (e) { console.error(e); } }); }
  function put(c, id, d) { (cache[c] = cache[c] || new Map()).set(id, d); }

  async function poll() {
    if (polling || !wantCols.size) return;
    polling = true;
    try {
      var touched = new Set(), more = true;
      while (more) {
        var r = await api('GET', '/api/v1/sync?since=' + seq + '&cols=' + enc(Array.from(wantCols).join(',')));
        r.upserts.forEach(function (u) { put(u.collection, u.id, u.data); touched.add(u.collection); });
        r.deletes.forEach(function (d) { if (cache[d.collection]) cache[d.collection].delete(d.id); touched.add(d.collection); });
        seq = r.seq; more = r.more;
      }
      var first = !loaded; loaded = true;
      (first ? new Set(Array.from(wantCols)) : touched).forEach(emit);
    } catch (e) {
      Object.keys(subs).forEach(function (c) { (subs[c] || []).forEach(function (s) { s.err && s.err(e); }); });
    } finally { polling = false; }
  }
  function startPolling() {
    if (timer) return;
    setTimeout(poll, 0);
    timer = setInterval(function () { if (!document.hidden) poll(); }, POLL_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
  }
  // after a failed write, drop optimistic state by reloading that collection
  async function reloadCollection(c) {
    try { var r = await api('GET', '/api/v1/docs/' + enc(c) + '?limit=2000'); cache[c] = new Map(r.docs.map(function (d) { return [d.id, d.data]; })); emit(c); } catch (e) {}
  }

  function docRef(c, id) {
    return {
      id: id,
      get: async function () { try { var r = await api('GET', docUrl(c, id)); return docSnap(id, r.data); } catch (e) { if (e.status === 404) return docSnap(id, null); throw e; } },
      set: async function (data) { put(c, id, clone(data)); emit(c); try { await api('PUT', docUrl(c, id), data); poll(); } catch (e) { reloadCollection(c); throw e; } },
      update: async function (patch) { var cur = (cache[c] && cache[c].get(id)) || {}; put(c, id, Object.assign({}, cur, clone(patch))); emit(c); try { await api('PATCH', docUrl(c, id), patch); poll(); } catch (e) { reloadCollection(c); throw e; } },
      delete: async function () { if (cache[c]) cache[c].delete(id); emit(c); try { await api('DELETE', docUrl(c, id)); poll(); } catch (e) { reloadCollection(c); throw e; } },
      onSnapshot: function (cb, err) { return colRef(c).onSnapshot(function (s) { cb(docSnap(id, cache[c] && cache[c].get(id))); }, err); },
    };
  }
  function queryRef(c, q) {
    var self = {
      where: function (f, op, v) { return queryRef(c, Object.assign({}, q, { where: (q.where || []).concat([[f, op, v]]) })); },
      orderBy: function (f, d) { return queryRef(c, Object.assign({}, q, { order: (q.order || []).concat([f + ':' + (d || 'asc')]) })); },
      limit: function (n) { return queryRef(c, Object.assign({}, q, { limit: n })); },
      get: async function () {
        var url = '/api/v1/docs/' + enc(c) + '?limit=' + (q.limit || 2000);
        if (q.where) url += '&where=' + enc(JSON.stringify(q.where));
        (q.order || []).forEach(function (o) { url += '&orderBy=' + enc(o); });
        var r = await api('GET', url);
        var docs = r.docs.map(function (d) { return docSnap(d.id, d.data); });
        return { docs: docs, size: docs.length, empty: !docs.length, forEach: function (f) { docs.forEach(f); }, metadata: { fromCache: false } };
      },
      onSnapshot: function (cb, err) {
        (subs[c] = subs[c] || []).push({ cb: cb, err: err });
        wantCols.add(c);
        if (loaded) { loaded = false; seq = 0; } // a new collection: refetch everything once
        startPolling(); setTimeout(poll, 0);
        return function () { subs[c] = (subs[c] || []).filter(function (s) { return s.cb !== cb; }); };
      },
    };
    return self;
  }
  function colRef(c) {
    var q = queryRef(c, {});
    q.doc = function (id) { return docRef(c, id || genId()); };
    q.add = async function (data) { var id = genId(); var ref = docRef(c, id); put(c, id, clone(data)); emit(c); try { await api('PUT', docUrl(c, id) + '?version=0', data); poll(); } catch (e) { reloadCollection(c); throw e; } return ref; };
    return q;
  }
  var DB = { collection: colRef };

  /* ---------------- mcp (Make inbox + Supermetrics) ---------------- */
  async function makeTool(tool, input) {
    if (tool === 'data-store-records_list') {
      var res = await Promise.all([api('GET', '/api/inbox/messages?limit=' + Math.max(500, input.limit || 0)), api('GET', '/api/inbox/config')]);
      var recs = res[0].messages.map(function (m) {
        var d = Object.assign({}, m); delete d.key;
        // the legacy inbox stored `order` as a JSON string
        d.order = m.order && typeof m.order === 'object' ? JSON.stringify(m.order) : (m.order || '');
        return { key: m.key, data: d };
      });
      recs.unshift({ key: '_config', data: res[1] });
      return { payload: recs };
    }
    if (/^data-store-records_(update|replace|create)$/.test(tool)) {
      var data = Object.assign({}, input.data || {});
      if (input.key === '_config') { delete data.channel; delete data.ts; return { payload: await api('PATCH', '/api/inbox/config', data) }; }
      return { payload: await api('PATCH', '/api/inbox/messages', { mid: data.mid || input.key, status: data.status, human: data.status === 'done' ? false : undefined }) };
    }
    if (tool === 'scenarios_run') {
      var d2 = input.data || {};
      return { payload: await api('POST', '/api/inbox/send', { conv: d2.conv, text: d2.text }) };
    }
    var e = new Error('Not supported here: ' + tool); e.code = 'tool_error'; throw e;
  }
  var MCP = {
    callTool: async function (server, tool, input) {
      if (/^make$/i.test(server)) return makeTool(tool, input || {});
      if (/supermetrics/i.test(server)) {
        if (tool === 'get_async_query_results') return { payload: { success: false, error: 'No pending query' } };
        var r = await api('POST', '/api/integrations/supermetrics', { tool: tool, input: input });
        return { payload: r.payload, cache: { storedAt: Date.now() } };
      }
      var e = new Error('Unknown connector ' + server); e.code = 'server_not_connected'; throw e;
    },
    invalidate: function () {},
  };

  /* ---------------- sample (Claude) ---------------- */
  function fileToBlock(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { var s = String(fr.result); res({ type: 'image', source: { type: 'base64', media_type: file.type || 'image/jpeg', data: s.slice(s.indexOf(',') + 1) } }); };
      fr.onerror = rej; fr.readAsDataURL(file);
    });
  }
  async function streamTurn(body, signal, onDelta) {
    var r = await fetch('/api/ai/sample', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: signal });
    if (!r.ok) { var j = null; try { j = await r.json(); } catch (e) {} throw apiErr(r.status, j); }
    var reader = r.body.getReader(), dec = new TextDecoder(), buf = '', done = null;
    for (;;) {
      var x = await reader.read(); if (x.done) break;
      buf += dec.decode(x.value, { stream: true });
      var parts = buf.split('\n\n'); buf = parts.pop();
      parts.forEach(function (p) {
        if (p.indexOf('data: ') !== 0) return;
        var ev = JSON.parse(p.slice(6));
        if (ev.type === 'text') onDelta(ev.text);
        else if (ev.type === 'done') done = ev.message;
        else if (ev.type === 'error') { var e = new Error(ev.message || ev.code); e.code = ev.code; throw e; }
      });
    }
    if (!done) { var e2 = new Error('Stream ended early'); e2.code = 'error'; throw e2; }
    return done;
  }
  async function sample(messages, opts) {
    opts = opts || {};
    var msgs = messages.map(function (m) { return { role: m.role, content: m.content }; });
    if (opts.images && opts.images.length) {
      var blocks = await Promise.all(Array.from(opts.images).map(fileToBlock));
      var last = msgs[msgs.length - 1];
      last.content = blocks.concat(typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : last.content);
    }
    var tools = opts.tools || [];
    var defs = tools.map(function (t) { return { name: t.name, description: t.description || '', input_schema: t.inputSchema || t.input_schema || { type: 'object', properties: {} } }; });
    var text = '', truncated = false;
    try {
      for (var round = 0; round < 10; round++) {
        var base = text ? text + '\n\n' : '';
        var turnText = '';
        var msg = await streamTurn({ messages: msgs, tools: defs.length ? defs : undefined, tier: opts.modelTier === 'complex' ? 'complex' : 'default' }, opts.signal, function (d) {
          turnText += d; if (opts.onText) opts.onText({ text: base + turnText });
        });
        var said = msg.content.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
        if (said) text = base + said;
        if (msg.stop_reason === 'max_tokens') truncated = true;
        if (msg.stop_reason !== 'tool_use') break;
        msgs.push({ role: 'assistant', content: msg.content });
        var uses = msg.content.filter(function (b) { return b.type === 'tool_use'; });
        var results = await Promise.all(uses.map(async function (u) {
          var t = tools.find(function (x) { return x.name === u.name; });
          try {
            if (!t) throw new Error('Unknown tool ' + u.name);
            var out = await t.execute(u.input || {});
            return { type: 'tool_result', tool_use_id: u.id, content: typeof out === 'string' ? out : JSON.stringify(out) };
          } catch (e) { return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: String(e && e.message || e) }; }
        }));
        msgs.push({ role: 'user', content: results });
      }
    } catch (e) {
      if (e && e.name === 'AbortError') { var c = new Error('cancelled'); c.code = 'cancelled'; c.text = text; throw c; }
      if (e && !e.code) e.code = 'error';
      if (e) e.text = text;
      throw e;
    }
    return { text: text, truncated: truncated };
  }
  sample.limits = async function () { return { images: true, tools: true }; };

  /* ---------------- user ---------------- */
  var mePromise = null;
  var me = function () { return (mePromise = mePromise || api('GET', '/api/v1/me')); };
  var USER = { can: async function (perm) { var m = await me(); return perm === 'data.write' ? (m.scopes || []).indexOf('write') >= 0 : true; } };

  window.claude = {
    use: async function (cap) {
      if (cap === 'db') return DB;
      if (cap === 'mcp') return MCP;
      if (cap === 'sample') return sample;
      if (cap === 'user') return USER;
      return null;
    },
  };

  /* ---------------- helpers used by the small patches in src/lib/legacy/patches.ts ---------------- */
  window.__bos = {
    fetchUrl: function (url) { return api('POST', '/api/kb/fetch-url', { url: url }); },
    windowNote: function (ms) {
      var lastIn = ms.filter(function (m) { return m.dir === 'in'; }).map(function (m) { return Date.parse(m.ts); }).filter(Boolean).sort().pop();
      if (!lastIn) return 'Messenger e customer er shesh message er 24 ghontar moddhe reply dite hoy.';
      var left = (lastIn + 864e5 - Date.now()) / 36e5;
      if (left <= 0) return '⛔ 24 ghontar window bondho (shesh message ' + Math.round(-left + 24) + ' ghonta age) — Meta policy te ekhon reply jabe na.';
      var mins = Math.floor(left * 60);
      return '⏱ Reply window: ar ' + (mins >= 60 ? Math.floor(mins / 60) + ' ghonta ' : '') + (mins % 60) + ' minute (Meta 24h policy).';
    },
    importBox: function () {
      var wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px';
      var days = document.createElement('input'); days.type = 'number'; days.min = '1'; days.max = '365'; days.value = '30'; days.style.width = '5rem'; days.setAttribute('aria-label', 'Koto din');
      var b = document.createElement('button'); b.className = 'btn sm'; b.textContent = 'Purono message import';
      var note = document.createElement('span'); note.className = 'note';
      b.addEventListener('click', async function () {
        b.disabled = true; note.textContent = 'Queue hocche…';
        try {
          var j = await api('POST', '/api/inbox/import', { days: Number(days.value) || 30 });
          note.textContent = 'Background e cholche…';
          for (var i = 0; i < 120; i++) {
            await new Promise(function (r) { setTimeout(r, 3000); });
            var s = await api('GET', '/api/jobs?id=' + enc(j.job_id));
            if (s && s.status === 'done') { note.textContent = 'Hoye geche: ' + s.result.added + ' notun message (' + s.result.conversations + ' chat).'; break; }
            if (s && s.status === 'failed') { note.textContent = 'Hoyni: ' + s.error; break; }
          }
        } catch (e) { note.textContent = 'Hoyni: ' + e.message; }
        b.disabled = false;
      });
      wrap.append('Shesh ', days, ' din er Messenger message ', b, note);
      return wrap;
    },
  };

  /* small account bar: who is logged in, link to admin settings, logout */
  document.addEventListener('DOMContentLoaded', function () {
    me().then(function (m) {
      var bar = document.createElement('div');
      bar.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:50;font:12px system-ui;background:var(--panel,#fff);color:var(--ink,#222);border:1px solid var(--line,#ddd);border-radius:999px;padding:4px 10px;display:flex;gap:8px;align-items:center;opacity:.9';
      bar.innerHTML = '<span></span><a href="/settings">Settings</a><a href="/admin">Admin</a><a href="/logout">Logout</a>';
      bar.firstChild.textContent = m.email + ' · ' + m.role;
      document.body.appendChild(bar);
      if (m.role === 'staff') return;
      /* API / credit warning from the last hourly check (Settings → API o connection) */
      fetch('/api/health', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (h) {
        if (!h || (!h.bad && !h.warn)) return;
        var names = h.items.filter(function (i) { return i.status === 'bad' || i.status === 'warn'; }).map(function (i) { return i.name + ': ' + i.summary; }).join('\n');
        var a = document.createElement('a');
        a.href = '/settings'; a.title = names;
        a.textContent = (h.bad ? '⛔ ' + h.bad : '⚠️ ' + h.warn) + ' ta API te shomossa';
        a.style.cssText = 'font-weight:600;color:' + (h.bad ? '#d64545' : '#b7791f');
        bar.insertBefore(a, bar.firstChild);
        var me = document.querySelector('.me');
        if (me) { var dot = document.createElement('span'); dot.title = names; dot.textContent = h.bad ? '⛔' : '⚠️'; dot.style.cssText = 'margin-left:auto'; me.appendChild(dot); }
      }).catch(function () {});
    }).catch(function () {});
  });
})();
