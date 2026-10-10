/* Tiny, dependency-free, XSS-safe markdown renderer for the AI assistant.
 * All input is HTML-escaped FIRST; only the tags generated below can appear in the output.
 * Supports: headings, **bold**, *italic*, `code`, fenced code, lists, blockquotes, hr,
 * tables (with status badges) and links to admin pages (*.html) or https:// URLs.
 */
(function (root) {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const BADGES = {
    paid: 'ok', active: 'ok', resolved: 'ok', present: 'ok', read: 'ok',
    partial: 'warn', in_progress: 'warn', new: 'warn', ongoing: 'warn',
    due: 'bad', inactive: 'bad', open: 'bad', absent: 'bad', cancelled: 'bad',
  };

  function safeLink(url) {
    const raw = url.replace(/&amp;/g, '&').trim();
    if (/^https?:\/\/[^\s]+$/i.test(raw)) return { external: true };
    if (/^[a-z0-9-]+\.html(\?[\w=&%.-]*)?$/i.test(raw)) return { external: false };
    return null;
  }

  function inline(t) {
    const codes = [];
    t = t.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
      const k = safeLink(url);
      if (!k) return m;
      return `<a href="${url}"${k.external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
    });
    t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![*\w])/g, '$1<em>$2</em>');
    return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
  }

  function cell(raw) {
    const plain = raw.replace(/<[^>]+>/g, '').replace(/\*\*/g, '').trim();
    const key = plain.toLowerCase().replace(/\s+/g, '_');
    if (Object.prototype.hasOwnProperty.call(BADGES, key) && plain.length < 14) {
      return `<span class="ai-badge ai-badge-${BADGES[key]}">${esc(plain).toUpperCase()}</span>`;
    }
    return inline(raw.trim());
  }

  const splitRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
  const isSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes('-');
  const isTableStart = (ls, i) => /\|/.test(ls[i]) && i + 1 < ls.length && isSep(ls[i + 1]);
  const listRe = /^\s*([-*•]|\d+[.)])\s+(.*)$/;
  const startsBlock = (ls, i) =>
    /^```/.test(ls[i]) || /^#{1,4}\s/.test(ls[i]) || listRe.test(ls[i]) || /^&gt;/.test(ls[i]) ||
    /^\s*([-*_])(\s*\1){2,}\s*$/.test(ls[i]) || isTableStart(ls, i);

  function render(src) {
    const ls = esc(String(src ?? '').replace(/\r/g, '')).split('\n');
    const out = [];
    let i = 0;
    while (i < ls.length) {
      const line = ls[i];
      if (/^```/.test(line)) {
        const code = [];
        i++;
        while (i < ls.length && !/^```/.test(ls[i])) code.push(ls[i++]);
        i++;
        out.push(`<pre><code>${code.join('\n')}</code></pre>`);
        continue;
      }
      if (!line.trim()) { i++; continue; }
      let m = line.match(/^(#{1,4})\s+(.*)$/);
      if (m) { const lvl = m[1].length <= 2 ? 3 : 4; out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`); i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
      if (isTableStart(ls, i)) {
        const head = splitRow(ls[i]);
        i += 2;
        const rows = [];
        while (i < ls.length && /\|/.test(ls[i]) && ls[i].trim()) rows.push(splitRow(ls[i++]));
        out.push('<div class="ai-table-wrap"><table><thead><tr>' + head.map((h) => `<th>${inline(h.trim())}</th>`).join('') +
          '</tr></thead><tbody>' + rows.map((r) => '<tr>' + head.map((_, c) => `<td>${cell(r[c] ?? '')}</td>`).join('') + '</tr>').join('') +
          '</tbody></table></div>');
        continue;
      }
      m = line.match(listRe);
      if (m) {
        const ordered = /\d/.test(m[1]);
        const items = [];
        while (i < ls.length && (m = ls[i].match(listRe)) && /\d/.test(m[1]) === ordered) { items.push(inline(m[2])); i++; }
        const tag = ordered ? 'ol' : 'ul';
        out.push(`<${tag}>${items.map((x) => `<li>${x}</li>`).join('')}</${tag}>`);
        continue;
      }
      if (/^&gt;/.test(line)) {
        const q = [];
        while (i < ls.length && /^&gt;/.test(ls[i])) q.push(ls[i++].replace(/^&gt;\s?/, ''));
        out.push(`<blockquote>${q.map(inline).join('<br>')}</blockquote>`);
        continue;
      }
      const p = [line];
      i++;
      while (i < ls.length && ls[i].trim() && !startsBlock(ls, i)) p.push(ls[i++]);
      out.push(`<p>${p.map(inline).join('<br>')}</p>`);
    }
    return out.join('');
  }

  const api = { render, esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AiMarkdown = api;
})(typeof window !== 'undefined' ? window : globalThis);
