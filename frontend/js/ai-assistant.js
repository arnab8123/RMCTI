/* RMCTI AI assistant page. Mounted by app.js for data-role="admin" data-page="assistant". */
(function () {
  const md = window.AiMarkdown;
  const esc = md.esc;
  const q = (s, r = document) => r.querySelector(s);

  const SUGGESTIONS = [
    { icon: '👥', title: 'All students', hint: 'Names with IDs and phones', prompt: 'Give me the names of all students with their IDs and phone numbers' },
    { icon: '🧑‍🏫', title: 'All teachers', hint: 'Who teaches what', prompt: 'Give me the names of all teachers with the courses they teach' },
    { icon: '₹', title: 'Fee status', hint: 'Fee, paid and remaining', prompt: "Who hasn't paid this month's fee? Show fee, paid and remaining" },
    { icon: '🗓️', title: "Today's classes", hint: 'Time, teacher and room', prompt: "Show today's classes" },
    { icon: '📊', title: 'Monthly summary', hint: 'Collection and attendance', prompt: "Give me this month's fee collection and attendance summary" },
    { icon: '✍️', title: 'Register a student', hint: 'Just tell me the details', prompt: 'I want to register a new student' },
  ];

  const WORKING = ['Thinking…', 'Checking your records…', 'Almost there…', 'Still working, this one needs a few lookups…'];

  function mount() {
    const chat = q('[data-ai-chat]');
    const form = q('[data-ai-form]');
    const input = q('[data-ai-input]');
    const send = q('[data-ai-send]');
    if (!chat || !form || !input) return;

    let busy = false;
    let messages = [];            // {role:'user'|'assistant', text}
    const user = (() => { try { return JSON.parse(sessionStorage.getItem('user') || '{}'); } catch (_) { return {}; } })();
    const first = String(user.name || user.username || '').split(/\s+/)[0] || 'there';

    // ---- status pill -------------------------------------------------------------------
    const pill = q('[data-ai-status]');
    Api.get('/admin/assistant/status').then((s) => {
      if (!pill) return;
      pill.className = 'ai-pill ' + (s.configured ? 'ok' : 'warn');
      pill.innerHTML = s.configured ? `<i></i>Gemini connected` : `<i></i>API key missing`;
      pill.title = s.configured ? `Model: ${s.model}` : 'Set GEMINI_API_KEY on the server';
    }).catch(() => { if (pill) { pill.className = 'ai-pill warn'; pill.innerHTML = '<i></i>Status unknown'; } });

    // ---- helpers -----------------------------------------------------------------------
    const scrollDown = () => requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });
    const copy = async (text, btn) => {
      try { await navigator.clipboard.writeText(text); } catch (_) {
        const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
      }
      if (btn) { const old = btn.textContent; btn.textContent = 'Copied ✓'; setTimeout(() => { btn.textContent = old; }, 1400); }
    };

    function emptyState() {
      const el = document.createElement('div');
      el.className = 'ai-empty';
      el.innerHTML = `
        <div class="ai-hero"><div class="ai-orb">✦</div>
          <h2>Hi ${esc(first)}, what should we do today?</h2>
          <p>Ask in plain words. I can look things up, register people, collect fees, change timetables and more. Money, deletions and schedule changes always ask you to confirm first.</p></div>
        <div class="ai-suggest">${SUGGESTIONS.map((s, i) => `
          <button type="button" class="ai-suggest-card" data-suggest="${i}"><span class="ai-suggest-icon">${s.icon}</span>
          <span><b>${esc(s.title)}</b><small>${esc(s.hint)}</small></span></button>`).join('')}</div>`;
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-suggest]');
        if (b) ask(SUGGESTIONS[+b.dataset.suggest].prompt);
      });
      return el;
    }

    function reset() {
      messages = [];
      chat.innerHTML = '';
      chat.appendChild(emptyState());
      input.value = ''; autosize(); input.focus();
    }

    function addMessage(role, text, { error = false } = {}) {
      q('.ai-empty', chat)?.remove();
      messages.push({ role, text });
      const row = document.createElement('article');
      row.className = `ai-row ai-${role}${error ? ' ai-error' : ''}`;
      if (role === 'user') {
        row.innerHTML = `<div class="ai-bubble">${esc(text).replace(/\n/g, '<br>')}</div>`;
      } else {
        row.innerHTML = `<div class="ai-avatar">✦</div><div class="ai-col"><div class="ai-bubble ai-md">${md.render(text)}</div>
          <div class="ai-extras"></div>
          <div class="ai-actions"><button type="button" data-copy>Copy</button></div></div>`;
        q('[data-copy]', row).addEventListener('click', (e) => copy(text, e.currentTarget));
      }
      chat.appendChild(row);
      scrollDown();
      return q('.ai-extras', row) || row;
    }

    // ---- cards -------------------------------------------------------------------------
    function stepsEl(steps) {
      if (!steps?.length) return null;
      const el = document.createElement('div');
      el.className = 'ai-steps';
      el.innerHTML = steps.map((s) => `<span class="${s.ok ? '' : 'bad'}">${s.ok ? '✓' : '!'} ${esc(s.label)}</span>`).join('');
      return el;
    }

    function cardEl(c) {
      const el = document.createElement('div');
      if (c.type === 'credentials') {
        el.className = 'ai-card ai-cred';
        el.innerHTML = `<div class="ai-card-head"><b>${esc(c.role)} login</b><span>${esc(c.name)}</span></div>
          <div class="ai-cred-grid"><label>Login ID</label><code>${esc(c.username)}</code><label>Password</label><code>${esc(c.password)}</code></div>
          <button type="button" class="ai-btn ghost" data-copy-cred>Copy login details</button>`;
        q('[data-copy-cred]', el).addEventListener('click', (e) => copy(`${c.role} login\nID: ${c.username}\nPassword: ${c.password}`, e.currentTarget));
      } else if (c.type === 'receipt') {
        el.className = 'ai-card ai-receipt';
        el.innerHTML = `<div class="ai-card-head"><b>Receipt ${esc(c.receipt_number)}</b><span>${esc(c.month)} · ${U.money(c.amount)}</span></div>
          <a class="ai-btn ghost" href="receipt-print.html?id=${encodeURIComponent(c.receipt_id)}">Open / print receipt →</a>`;
      } else return null;
      return el;
    }

    function pendingEl(p) {
      const el = document.createElement('div');
      el.className = `ai-card ai-confirm${p.danger ? ' danger' : ''}`;
      el.innerHTML = `<div class="ai-card-head"><b>${p.danger ? '⚠️ ' : ''}${esc(p.title)}</b><span>Needs your confirmation</span></div>
        <div class="ai-confirm-body ai-md">${p.lines.map((l) => `<div>${md.render(l).replace(/^<p>|<\/p>$/g, '')}</div>`).join('')}</div>
        <div class="ai-confirm-actions"><button type="button" class="ai-btn ${p.danger ? 'danger' : 'primary'}" data-yes>${esc(p.confirm_label || 'Confirm')}</button>
        <button type="button" class="ai-btn ghost" data-no>Cancel</button></div>`;
      const yes = q('[data-yes]', el); const no = q('[data-no]', el);
      const lock = (html, cls) => { el.classList.add(cls); q('.ai-confirm-actions', el).innerHTML = html; };
      el.confirm = async () => {
        if (el.classList.contains('done') || el.classList.contains('cancelled')) return;
        yes.disabled = no.disabled = true; yes.innerHTML = '<span class="ai-spin"></span>';
        try {
          const r = await Api.post('/admin/assistant', { confirm_token: p.token });
          lock(r.ok ? '<span class="ai-ok">✓ Done</span>' : '<span class="ai-bad">Not saved</span>', r.ok ? 'done' : 'cancelled');
          const slot = addMessage('assistant', r.reply || 'Done.', { error: !r.ok });
          (r.cards || []).map(cardEl).filter(Boolean).forEach((c) => slot.appendChild(c));
        } catch (e) {
          lock('<span class="ai-bad">Failed</span>', 'cancelled');
          addMessage('assistant', `⚠️ ${e.message || 'That action failed.'} Nothing was changed.`, { error: true });
        }
      };
      yes.addEventListener('click', el.confirm);
      no.addEventListener('click', () => {
        lock('<span class="ai-muted">Cancelled, nothing was changed</span>', 'cancelled');
        messages.push({ role: 'assistant', text: `(The admin cancelled "${p.title}". Nothing was changed.)` });
      });
      return el;
    }

    // ---- sending -----------------------------------------------------------------------
    function autosize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 150) + 'px'; }
    function setBusy(b) {
      busy = b; input.disabled = b; send.disabled = b;
      send.innerHTML = b ? '<span class="ai-spin"></span>' : '<span>➤</span>';
    }

    async function ask(text) {
      const message = String(text || '').trim();
      if (!message || busy) return;
      const history = messages.slice(-20).map((m) => ({ role: m.role, content: m.text }));
      addMessage('user', message);
      setBusy(true);
      const typing = document.createElement('article');
      typing.className = 'ai-row ai-assistant ai-typing';
      typing.innerHTML = '<div class="ai-avatar">✦</div><div class="ai-col"><div class="ai-bubble"><span class="ai-dots"><i></i><i></i><i></i></span><em data-working>Thinking…</em></div></div>';
      chat.appendChild(typing); scrollDown();
      let n = 0;
      const tick = setInterval(() => { n = Math.min(n + 1, WORKING.length - 1); const w = q('[data-working]', typing); if (w) w.textContent = WORKING[n]; }, 4500);
      try {
        const r = await Api.post('/admin/assistant', { message, history });
        clearInterval(tick); typing.remove();
        const slot = addMessage('assistant', r.reply || 'Done.', { error: !!r.error });
        const steps = stepsEl(r.steps); if (steps) slot.appendChild(steps);
        (r.cards || []).map(cardEl).filter(Boolean).forEach((c) => slot.appendChild(c));
        const cards = (r.pending || []).map(pendingEl);
        cards.forEach((c) => slot.appendChild(c));
        if (cards.length > 1) {
          const all = document.createElement('button');
          all.type = 'button'; all.className = 'ai-btn primary ai-all'; all.textContent = `Confirm all ${cards.length}`;
          all.addEventListener('click', async () => { all.disabled = true; for (const c of cards) await c.confirm(); });
          slot.appendChild(all);
        }
        scrollDown();
      } catch (e) {
        clearInterval(tick); typing.remove();
        addMessage('assistant', `⚠️ ${e.message || 'I could not reach the server.'} Please try again.`, { error: true });
      } finally { setBusy(false); input.focus(); }
    }

    form.addEventListener('submit', (e) => { e.preventDefault(); const v = input.value; input.value = ''; autosize(); ask(v); });
    input.addEventListener('input', autosize);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
    q('[data-ai-new]')?.addEventListener('click', () => { if (!busy) reset(); });

    reset();
  }

  window.AiAssistant = { mount };
})();
