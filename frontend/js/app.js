
function prepareMobileTables(root = document) {
  root.querySelectorAll('.table table').forEach((table) => {
    let headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    let legacyHeaderRow = null;

    // Some generated history tables use <table><tr><th>...</th></tr> without a <thead>.
    if (!headers.length) {
      legacyHeaderRow = [...table.querySelectorAll('tr')].find((row) => row.querySelector('th'));
      if (legacyHeaderRow) {
        headers = [...legacyHeaderRow.querySelectorAll('th')].map((th) => th.textContent.trim());
        legacyHeaderRow.classList.add('mobile-table-header');
      }
    }

    if (!headers.length) return;

    table.querySelectorAll('tbody tr, tr').forEach((row) => {
      if (row === legacyHeaderRow) return;
      const cells = [...row.children].filter((cell) => cell.tagName === 'TD');
      if (!cells.length || cells.length !== headers.length) return;
      cells.forEach((cell, index) => {
        if (!cell.dataset.label) cell.dataset.label = headers[index];
      });
    });

    table.closest('.table')?.classList.add('mobile-stack-table');
  });
}


/* -------------------------------------------------------------------------
   RMCTI shared UI layer
   These helpers intentionally sit above the existing page feature code:
   navigation, global search, mobile navigation, polished toasts/modals and
   loading-state presentation are shared without changing business logic.
--------------------------------------------------------------------------- */
function rmctiNavIconize() {
  document.querySelectorAll('.nav > a, .nav > button').forEach((item) => {
    if (item.dataset.rmctiNavIconized) return;
    const text = (item.textContent || '').trim();
    if (!text) return;
    const icon = [...text][0];
    const label = text.slice(icon.length).trim();
    item.innerHTML = `<span class="nav-icon" aria-hidden="true">${U.esc(icon)}</span><span class="nav-label">${U.esc(label)}</span>`;
    item.dataset.rmctiNavIconized = '1';
  });
  document.querySelectorAll('.nav a').forEach((item) => {
    const href = item.getAttribute('href') || '';
    if (!href || href.startsWith('#')) return;
    const current = location.pathname.split('/').pop() || 'dashboard.html';
    item.classList.toggle('active', href.split('?')[0] === current);
  });
}

function rmctiBindSidebar() {
  const side = document.querySelector('.side');
  const menu = document.querySelector('[data-menu]');
  if (!side || !menu || menu.dataset.rmctiLayoutBound) return;
  menu.dataset.rmctiLayoutBound = '1';

  let backdrop = document.querySelector('[data-sidebar-backdrop]');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    backdrop.dataset.sidebarBackdrop = '1';
    document.body.appendChild(backdrop);
  }
  // The sidebar is an off-canvas panel at every viewport size. It must stay
  // hidden on first load and may only be opened/closed from the hamburger,
  // backdrop, a navigation link, or Escape.
  document.body.classList.remove('sidebar-collapsed');
  side.classList.remove('open');

  if (!side.id) side.id = 'rmcti-side-panel';
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-controls', side.id);

  const setOpen = (open) => {
    side.classList.toggle('open', open);
    backdrop.classList.toggle('open', open);
    menu.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('sidebar-open', open);
  };
  const closePanel = () => setOpen(false);

  backdrop.addEventListener('click', closePanel);
  side.querySelectorAll('a').forEach((a) => a.addEventListener('click', closePanel));

  menu.addEventListener('click', () => setOpen(!side.classList.contains('open')));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePanel();
  });
}

function rmctiEnsureTopSearch() {
  if (document.body.dataset.role !== 'admin') return;
  const top = document.querySelector('.top');
  if (!top || top.querySelector('[data-global-search-wrap]')) return;

  const wrap = document.createElement('div');
  wrap.className = 'global-search-wrap';
  wrap.dataset.globalSearchWrap = '1';
  wrap.innerHTML = `
    <span class="global-search-icon" aria-hidden="true">⌕</span>
    <input class="global-search-input" type="search" data-global-search
      placeholder="Search students, teachers, courses, receipts…" autocomplete="off"
      aria-label="Global search">
    <kbd class="global-search-kbd">/</kbd>
    <div class="global-search-results" data-global-search-results hidden></div>`;
  top.insertBefore(wrap, top.lastElementChild || null);

  const input = wrap.querySelector('[data-global-search]');
  const results = wrap.querySelector('[data-global-search-results]');
  const render = (rows) => {
    if (!rows.length) {
      results.innerHTML = '<div class="search-empty">No matching students, teachers, courses or receipts.</div>';
      results.hidden = false;
      return;
    }
    const groups = {student: 'Students', teacher: 'Teachers', class: 'Courses', receipt: 'Receipts'};
    results.innerHTML = rows.map((row) => `
      <button type="button" class="global-search-result" data-search-type="${U.esc(row.type)}" data-search-id="${U.esc(row.id)}">
        <span class="search-result-icon">${row.type === 'student' ? '♧' : row.type === 'teacher' ? '♙' : row.type === 'class' ? '▣' : '▤'}</span>
        <span class="search-result-copy">
          <b>${U.esc(row.title)}</b>
          <small>${U.esc(row.subtitle || '')}</small>
        </span>
        <span class="search-result-meta">${U.esc(groups[row.type] || '')}</span>
      </button>`).join('');
    results.hidden = false;
  };

  const run = U.debounce(async () => {
    const term = String(input.value || '').trim();
    if (!term) { results.hidden = true; results.innerHTML = ''; return; }
    results.innerHTML = '<div class="search-loading"><span class="spinner"></span> Searching…</div>';
    results.hidden = false;
    try {
      const rows = await Api.get('/admin/search', {q: term});
      render(rows || []);
    } catch (error) {
      results.innerHTML = `<div class="search-empty">${U.esc(error.message || 'Search unavailable')}</div>`;
      results.hidden = false;
    }
  }, 180);

  input.addEventListener('input', run);
  input.addEventListener('focus', () => { if (input.value.trim() && results.innerHTML) results.hidden = false; });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { input.value = ''; results.hidden = true; input.blur(); }
  });
  results.addEventListener('click', async (event) => {
    const item = event.target.closest('[data-search-type]');
    if (!item) return;
    const type = item.dataset.searchType;
    const id = item.dataset.searchId;
    results.hidden = true;
    input.value = '';
    try {
      if (type === 'student') {
        const student = await Api.get(`/students/${id}`);
        await window.RMCTIProfiles?.student(student);
      } else if (type === 'teacher') {
        const teacher = await Api.get(`/teachers/${id}`);
        await window.RMCTIProfiles?.teacher(teacher);
      } else if (type === 'class') {
        location.href = `all-classes.html?view=${encodeURIComponent(id)}`;
      } else if (type === 'receipt') {
        location.href = `receipts.html?view=${encodeURIComponent(id)}`;
      }
    } catch (error) {
      U.toast(error.message || 'Could not open this result', 'error');
    }
  });

  document.addEventListener('click', (event) => {
    if (!wrap.contains(event.target)) results.hidden = true;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      event.preventDefault();
      input.focus();
    }
  });
}

function rmctiBottomNav() {
  const role = document.body.dataset.role;
  if (!role || document.querySelector('[data-bottom-nav]')) return;
  const root = role === 'admin'
    ? [['dashboard.html','⌂','Home'],['students.html','♧','Students'],['all-classes.html','▣','Classes'],['fee-payment.html','₹','Fees']]
    : role === 'teacher'
      ? [['dashboard.html','⌂','Home'],['students.html','♧','Students'],['classes.html','▦','Classes'],['homework.html','✓','Work']]
      : [['dashboard.html','⌂','Home'],['routine.html','▦','Routine'],['fees.html','₹','Fees'],['homework.html','✓','Work']];
  const nav = document.createElement('nav');
  nav.className = 'mobile-bottom-nav';
  nav.dataset.bottomNav = '1';
  nav.innerHTML = root.map(([href,icon,label]) => `<a href="${href}" class="${href.split('?')[0] === (location.pathname.split('/').pop() || 'dashboard.html') ? 'active' : ''}"><span>${U.esc(icon)}</span><small>${U.esc(label)}</small></a>`).join('') +
    `<button type="button" data-mobile-more><span>☰</span><small>More</small></button>`;
  document.body.appendChild(nav);
  nav.querySelector('[data-mobile-more]').addEventListener('click', () => document.querySelector('[data-menu]')?.click());
}

function rmctiMobileActions() {
  if (document.body.dataset.role !== 'admin' || document.querySelector('[data-mobile-actions]')) return;
  const page = document.body.dataset.page;
  const maps = {
    dashboard: [['register-student.html','＋ Add Student'],['fee-payment.html','₹ Collect Fee'],['teacher-classes.html','＋ Schedule Class']],
    students: [['register-student.html','＋ Add Student'],['fee-payment.html','₹ Collect Fee']],
    teachers: [['register-teacher.html','＋ Add Teacher'],['teacher-classes.html','＋ Schedule Class']],
    'teacher-classes': [['teacher-classes.html#schedule','＋ Schedule Class'],['all-classes.html','▣ Courses']],
    'fee-payment': [['fee-payment.html','₹ Collect Fee'],['receipts.html','▤ Receipts']]
  };
  const actions = maps[page];
  if (!actions) return;
  const bar = document.createElement('div');
  bar.className = 'mobile-action-bar';
  bar.dataset.mobileActions = '1';
  bar.innerHTML = actions.map(([href,label]) => `<a class="btn primary small" href="${href}">${U.esc(label)}</a>`).join('');
  document.body.appendChild(bar);
}

function rmctiSessionNotice() {
  const token = sessionStorage.getItem('token');
  if (!token) return;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/') + '==='.slice((token.split('.')[1].length + 3) % 4)));
    const exp = Number(payload.exp || 0) * 1000;
    if (!exp) return;
    const warnAt = exp - 120000;
    const check = () => {
      const remaining = exp - Date.now();
      if (remaining <= 0) return;
      if (remaining <= 120000 && !document.body.dataset.sessionWarningShown) {
        document.body.dataset.sessionWarningShown = '1';
        const modal = U.modal('Session ending soon', `
          <p class="session-warning-copy">Your session will expire in about ${Math.max(1, Math.ceil(remaining / 60000))} minute(s).</p>
          <div class="right" style="justify-content:flex-end">
            <button type="button" class="btn primary" data-close>Continue Session</button>
          </div>`);
        modal.querySelector('[data-close]')?.addEventListener('click', () => {
          document.body.dataset.sessionWarningShown = '';
          // A harmless authenticated request keeps this warning UI useful without inventing a new
          // backend refresh contract. If the API reports 401, the normal auth flow handles logout.
          Api.get('/auth/me').catch(() => {});
        });
      }
    };
    window.setTimeout(check, Math.max(1000, warnAt - Date.now()));
  } catch (_) {}
}

function rmctiUpgradeLoadingStates() {
  document.querySelectorAll('.loading').forEach((node) => {
    if (node.dataset.rmctiSkeleton || !/^loading[.…\.]*/i.test((node.textContent || '').trim())) return;
    node.dataset.rmctiSkeleton = '1';
    node.classList.add('loading-skeleton');
    node.innerHTML = '<span class="skeleton-line wide"></span><span class="skeleton-line medium"></span><span class="skeleton-line short"></span>';
  });
}

function rmctiBootSharedUI() {
  rmctiNavIconize();
  rmctiUpgradeLoadingStates();
  rmctiBindSidebar();
  rmctiEnsureTopSearch();
  rmctiBottomNav();
  rmctiMobileActions();
  rmctiSessionNotice();
  if (window.U?.prepareLoadingEnhancement) window.U.prepareLoadingEnhancement();
}

/* Shared profile modals used by admin search and the admin people pages. */
window.RMCTIProfiles = {
  async student(student) {
    const [fee, attendanceMonth] = await Promise.allSettled([
      Api.get(`/fees/student/${student.id}`),
      Api.get(`/students/${student.id}/attendance`, {month: U.today().slice(0,7)})
    ]);
    const feeData = fee.status === 'fulfilled' ? fee.value : null;
    const attendance = attendanceMonth.status === 'fulfilled' ? attendanceMonth.value : null;
    const current = feeData?.history?.[0] || {};
    const attendanceRows = Object.values(attendance?.records || {});
    const present = attendanceRows.filter((x) => x.status === 'present').length;
    const absent = attendanceRows.filter((x) => x.status === 'absent').length;
    const attendanceTotal = present + absent;
    const modal = U.modal(`Student Profile · ${student.name}`, `
      <div class="profile-shell" data-profile-kind="student">
        <div class="profile-hero">
          <img src="${U.photoUrl(student.photo)}" alt="${U.esc(student.name)}" class="profile-avatar" onerror="this.onerror=null;this.src='${U.photoUrl('')}'">
          <div class="profile-identity">
            <div class="profile-kicker">Student Profile</div>
            <h2>${U.esc(student.name)}</h2>
            <div class="profile-subline">${U.esc(student.student_id)} <span class="badge ${student.status === 'active' ? 'active' : 'inactive'}">${U.esc(student.status || 'active')}</span></div>
          </div>
        </div>
        <div class="profile-tabs" role="tablist">
          ${['overview','classes','attendance','fees','history'].map((tab, i) => `<button type="button" class="profile-tab ${i===0?'active':''}" data-profile-tab="${tab}">${tab[0].toUpperCase()+tab.slice(1)}</button>`).join('')}
        </div>
        <div class="profile-panel" data-profile-panel></div>
      </div>`);
    const panel = modal.querySelector('[data-profile-panel]');
    const esc = U.esc;
    const courseHtml = (student.classes || []).length
      ? student.classes.map((c) => `<div class="profile-list-row"><div><b>${esc(c.class_name)}</b><small>${esc(c.subject || '')} · ${esc(c.batch || '')}</small></div><span>${esc(c.day || '')} ${esc(c.start_time || '')}${c.end_time ? `–${esc(c.end_time)}`:''}</span></div>`).join('')
      : '<div class="empty-card"><b>No active courses</b><span>This student is not assigned to any active course.</span></div>';
    const historyHtml = (feeData?.history || []).map((h) => `
      <div class="timeline-row">
        <span class="timeline-dot ${String(h.status||'').toLowerCase()}">${h.status === 'PAID' ? '✓' : h.status === 'PARTIAL' ? '◐' : '!'}</span>
        <div><b>${esc(h.month_label)}</b><small>${U.money(h.paid_amount)} paid · ${U.money(h.due_amount)} remaining · <span class="badge ${String(h.status||'').toLowerCase()}">${esc(h.status)}</span></small>
        ${h.payment_date ? `<small>Last payment: ${esc(U.datetime(h.payment_date))}${h.receipt_number ? ` · ${esc(h.receipt_number)}` : ''}</small>` : ''}</div>
      </div>`).join('') || '<div class="empty-card"><b>No fee history</b><span>No fee records are available for this student.</span></div>';

    const render = (tab) => {
      if (tab === 'overview') {
        panel.innerHTML = `
          <div class="profile-section-grid">
            <div class="profile-card"><h3>Personal Information</h3><div class="detail-grid">
              <div><small>Phone</small><b>${esc(student.phone || '—')}</b></div>
              <div><small>Gender</small><b>${esc(student.gender || '—')}</b></div>
              <div><small>Date of Birth</small><b>${esc(student.dob ? U.date(student.dob) : '—')}</b></div>
              <div><small>School / College</small><b>${esc(student.school_name || '—')}</b></div>
            </div></div>
            <div class="profile-card"><h3>Fee Status</h3><div class="profile-money-grid">
              <div><small>Paid</small><b>${U.money(current.paid_amount || 0)}</b></div>
              <div class="warning-money"><small>Due</small><b>${U.money(current.due_amount || 0)}</b></div>
            </div><span class="badge ${String(current.status||'due').toLowerCase()}">${esc(current.status || 'N/A')}</span></div>
          </div>
          <div class="profile-card"><h3>Courses</h3>${courseHtml}</div>
          <div class="profile-card"><h3>Guardian</h3><div class="detail-grid">
            <div><small>Name</small><b>${esc(student.parent?.name || '—')}</b></div>
            <div><small>Relationship</small><b>${esc(student.parent?.relationship || '—')}</b></div>
            <div><small>Phone</small><b>${esc(student.parent?.phone || '—')}</b></div>
            <div><small>Email</small><b>${esc(student.parent?.email || '—')}</b></div>
          </div></div>`;
      } else if (tab === 'classes') {
        panel.innerHTML = `<div class="profile-card"><h3>Assigned Courses & Weekly Schedule</h3>${courseHtml}</div>`;
      } else if (tab === 'attendance') {
        panel.innerHTML = `
          <div class="profile-section-grid profile-stats">
            <div class="profile-card"><small>Present</small><strong>${present}</strong></div>
            <div class="profile-card"><small>Absent</small><strong>${absent}</strong></div>
            <div class="profile-card"><small>Attendance</small><strong>${attendanceTotal ? Math.round((present/attendanceTotal)*100) : 0}%</strong></div>
          </div>
          <div class="profile-card"><h3>${esc(new Date().toLocaleString('en-IN',{month:'long',year:'numeric'}))} Attendance</h3>
            ${attendanceRows.length ? attendanceRows.map((row) => `<div class="profile-list-row"><div><b>${esc(row.date || '')}</b><small>${(row.courses||[]).map(c=>esc(c.course)).join(', ') || 'Class'}</small></div><span class="badge ${row.status === 'present' ? 'paid' : 'due'}">${esc(row.status || '')}</span></div>`).join('') : '<div class="empty-card"><b>No attendance marked</b><span>No attendance records are available for this month.</span></div>'}
          </div>`;
      } else if (tab === 'fees') {
        panel.innerHTML = `<div class="profile-card"><h3>Payment History</h3><div class="timeline">${historyHtml}</div></div>`;
      } else {
        panel.innerHTML = `<div class="profile-card"><h3>Activity History</h3><div class="timeline" data-profile-history><div class="loading">Loading activity…</div></div></div>`;
        Api.get('/audit-logs').then((logs) => {
          const relevant = (logs || []).filter((x) =>
            String(x.entity_type||'').toLowerCase() === 'student' && String(x.entity_id) === String(student.id) ||
            String(x.entity_type||'').toLowerCase() === 'fee_payment' && String(x.description||'').toLowerCase().includes(String(student.name||'').toLowerCase())
          ).slice(0,20);
          const target = panel.querySelector('[data-profile-history]');
          if (target) target.innerHTML = relevant.length
            ? relevant.map((x)=>`<div class="timeline-row"><span class="timeline-dot">•</span><div><b>${esc(x.action || 'Activity')}</b><small>${esc(x.description || '')}</small><small>${esc(U.datetime(x.created_at))}</small></div></div>`).join('')
            : '<div class="empty-card"><b>No activity history</b><span>No logged changes were found for this student.</span></div>';
        }).catch(()=>{});
      }
    };
    render('overview');
    modal.querySelectorAll('[data-profile-tab]').forEach((tab) => tab.addEventListener('click', () => {
      modal.querySelectorAll('[data-profile-tab]').forEach((x) => x.classList.remove('active'));
      tab.classList.add('active');
      render(tab.dataset.profileTab);
    }));
    return modal;
  },

  async teacher(teacher) {
    const classes = teacher.classes || [];
    const classIds = [...new Set(classes.map((x) => Number(x.class_id)).filter(Boolean))];
    const [todayData, attendanceData] = await Promise.allSettled([
      Api.get('/admin/dashboard'),
      Promise.all(classIds.slice(0,8).map((id) => Api.get(`/admin/classes/${id}/attendance/history`, {from: U.today().slice(0,7)+'-01', to: U.today()})))
    ]);
    const dash = todayData.status === 'fulfilled' ? todayData.value : null;
    const attendanceLists = attendanceData.status === 'fulfilled' ? attendanceData.value : [];
    const classStudents = new Set();
    classes.forEach((c)=>{ if(c.class_id) classStudents.add(`${c.class_id}`); });
    const attendanceDays = attendanceLists.flatMap((x)=>Array.isArray(x?.history)?x.history:[]);
    const present = attendanceDays.reduce((sum,x)=>sum+Number(x.present||0),0);
    const absent = attendanceDays.reduce((sum,x)=>sum+Number(x.absent||0),0);
    const totalAttendance = present + absent;
    const modal = U.modal(`Teacher Profile · ${teacher.name}`, `
      <div class="profile-shell">
        <div class="profile-hero">
          <img src="${U.photoUrl(teacher.photo)}" alt="${U.esc(teacher.name)}" class="profile-avatar" onerror="this.onerror=null;this.src='${U.photoUrl('')}'">
          <div class="profile-identity"><div class="profile-kicker">Teacher Profile</div><h2>${U.esc(teacher.name)}</h2><div class="profile-subline">${U.esc(teacher.teacher_id)} <span class="badge ${teacher.status==='active'?'active':'inactive'}">${U.esc(teacher.status||'active')}</span></div></div>
        </div>
        <div class="profile-tabs" role="tablist">${['overview','assigned courses','schedule','attendance','history'].map((tab,i)=>`<button type="button" class="profile-tab ${i===0?'active':''}" data-profile-tab="${tab}">${tab[0].toUpperCase()+tab.slice(1)}</button>`).join('')}</div>
        <div class="profile-panel" data-profile-panel></div>
      </div>`);
    const panel = modal.querySelector('[data-profile-panel]');
    const teacherClasses = classes.length ? classes.map(c => `<div class="profile-list-row"><div><b>${U.esc(c.class_name)}</b><small>${U.esc(c.subject)} · ${U.esc(c.batch)}</small></div><span>${U.esc(c.day)} ${U.esc(c.start_time)}–${U.esc(c.end_time)}</span></div>`).join('') : '<div class="empty-card"><b>No assigned courses</b><span>This teacher has no active course allocations.</span></div>';
    const render = (tab) => {
      if (tab === 'overview') panel.innerHTML = `<div class="profile-section-grid">
        <div class="profile-card"><h3>Contact</h3><div class="detail-grid"><div><small>Phone</small><b>${U.esc(teacher.phone||'—')}</b></div><div><small>Email</small><b>${U.esc(teacher.email||'—')}</b></div><div><small>Qualification</small><b>${U.esc(teacher.qualification||'—')}</b></div><div><small>Experience</small><b>${U.esc(teacher.experience||'—')}</b></div></div></div>
        <div class="profile-card"><h3>Workload</h3><div class="profile-money-grid"><div><small>Weekly classes</small><b>${classes.length}</b></div><div><small>Assigned courses</small><b>${classIds.length}</b></div><div><small>Today's classes</small><b>${(dash?.todays_classes||[]).filter(x=>classes.some(c=>Number(c.class_id)===Number(x.class_id))).length}</b></div><div><small>Attendance</small><b>${totalAttendance ? Math.round(present/totalAttendance*100) : 0}%</b></div></div></div>
      </div><div class="profile-card"><h3>Today's Classes</h3>${(dash?.todays_classes||[]).filter(x=>classes.some(c=>Number(c.class_id)===Number(x.class_id))).map(c=>`<div class="profile-list-row"><div><b>${U.esc(c.subject)}</b><small>${U.esc(c.class_name)} · ${U.esc(c.teacher_name||teacher.name)}</small></div><span class="badge ${String(c.status||'').toLowerCase()}">${U.esc(c.status)}</span></div>`).join('') || '<div class="empty-card"><b>No classes today</b><span>There are no classes scheduled for this teacher today.</span></div>'}</div>`;
      else if (tab === 'assigned courses') panel.innerHTML = `<div class="profile-card"><h3>Assigned Courses</h3>${teacherClasses}</div>`;
      else if (tab === 'schedule') panel.innerHTML = `<div class="profile-card"><h3>Weekly Schedule</h3>${teacherClasses}</div>`;
      else if (tab === 'attendance') panel.innerHTML = `<div class="profile-section-grid profile-stats"><div class="profile-card"><small>Present</small><strong>${present}</strong></div><div class="profile-card"><small>Absent</small><strong>${absent}</strong></div><div class="profile-card"><small>Attendance</small><strong>${totalAttendance?Math.round(present/totalAttendance*100):0}%</strong></div></div><div class="profile-card"><h3>Current-month attendance records</h3><p class="muted">Statistics are aggregated from attendance records for this teacher's assigned courses.</p></div>`;
      else {
        panel.innerHTML = `<div class="profile-card"><h3>Activity History</h3><div class="timeline" data-profile-history><div class="loading">Loading activity…</div></div></div>`;
        Api.get('/audit-logs').then((logs)=> {
          const relevant=(logs||[]).filter(x=>String(x.entity_type||'').toLowerCase()==='teacher'&&String(x.entity_id)===String(teacher.id)).slice(0,20);
          const target=panel.querySelector('[data-profile-history]');
          if(target) target.innerHTML=relevant.length?relevant.map(x=>`<div class="timeline-row"><span class="timeline-dot">•</span><div><b>${U.esc(x.action||'Activity')}</b><small>${U.esc(x.description||'')}</small><small>${U.esc(U.datetime(x.created_at))}</small></div></div>`).join(''):'<div class="empty-card"><b>No activity history</b><span>No logged changes were found for this teacher.</span></div>';
        }).catch(()=>{});
      }
    };
    render('overview');
    modal.querySelectorAll('[data-profile-tab]').forEach((tab) => tab.addEventListener('click', ()=>{modal.querySelectorAll('[data-profile-tab]').forEach(x=>x.classList.remove('active'));tab.classList.add('active');render(tab.dataset.profileTab);}));
    return modal;
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  const role = document.body.dataset.role;
  const page = document.body.dataset.page;
  if (!role || !page) return;

  try {
    const user = await Page.auth(role);
    if (!user) return;

    const dispatch = {
      'admin:dashboard': () => Page.dashboard('admin'),
      'admin:teachers': () => Page.teachersPage(),
      'admin:students': () => Page.studentsPage(),
      'admin:teacher-classes': () => Page.allocationPage(),
      'admin:all-classes': () => Page.allClasses(),
      'admin:fee-structure': () => Page.feeStructure(),
      'admin:fee-payment': () => Page.feePayment(),
      'admin:receipts': () => Page.receipts(),
      'admin:attachments': () => Page.attachmentsPage(),
      'admin:receipt-print': () => Page.receiptPrint(),
      'admin:audit-logs': () => Page.auditLogs(),
      'admin:reports': () => Page.reportsPage(),
      'admin:analytics': () => Page.analyticsPage(),
      'admin:complaints': () => Page.adminComplaints(),
      'admin:enquiries': () => Page.enquiries(),
      'admin:register-teacher': () => Page.registerPage('teacher'),
      'admin:register-student': () => Page.registerPage('student'),

      'teacher:dashboard': () => Page.dashboard('teacher'),
      'teacher:students': () => Page.teacherStudents(),
      'teacher:classes': () => Page.teacherClasses(),
      'teacher:student-details': () => Page.studentDetails(),
      'teacher:homework': () => Page.workPage('homework'),
      'teacher:classwork': () => Page.workPage('classwork'),

      'student:dashboard': () => Page.dashboard('student'),
      'student:routine': () => Page.studentList('routine'),
      'student:homework': () => Page.studentList('homework'),
      'student:classwork': () => Page.studentList('classwork'),
      'student:teacher': () => Page.studentList('teacher'),
      'student:fees': () => Page.studentFees(),
      'student:complaints': () => Page.studentComplaints(),
      'student:notice-board': () => Page.attachmentsPage()
    };

    const fn = dispatch[`${role}:${page}`];
    if (typeof fn === 'function') await fn();
    else console.warn(`No frontend handler for ${role}:${page}`);
    prepareMobileTables();
    if (!window.__rmctiMobileTableObserver) {
      window.__rmctiMobileTableObserver = new MutationObserver(() => { prepareMobileTables(); rmctiUpgradeLoadingStates(); });
      window.__rmctiMobileTableObserver.observe(document.body, {subtree:true, childList:true});
    }
    rmctiBootSharedUI();
  } catch (error) {
    console.error(error);
    if (window.U?.toast) U.toast(error.message || 'Unable to load this page.', 'error');
  }
});
