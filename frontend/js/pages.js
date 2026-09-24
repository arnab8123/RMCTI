const Page = (() => {
  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const q = (selector) => document.querySelector(selector);
  const formObj = (form) => Object.fromEntries(new FormData(form).entries());
  const fill = (el, html) => { if (el) el.innerHTML = html; };
  const tableEmpty = (cols, message = 'No records found.') => `<tr><td colspan="${cols}" class="empty">${U.esc(message)}</td></tr>`;

  async function auth(role) { return Auth.role(role); }

  async function adminVerifiedAction(title, message, fn) {
    const current = JSON.parse(sessionStorage.getItem('user') || '{}');
    const m = U.modal(title, `<p>${U.esc(message)}</p><form data-admin-confirm class="form"><div class="full"><label class="label">Admin ID / Username</label><input class="input" name="username" value="${U.esc(current.username || '')}" autocomplete="username" required></div><div class="full"><label class="label">Admin Password</label><input class="input" type="password" name="password" autocomplete="current-password" required></div><div class="full right" style="justify-content:flex-end"><button type="button" class="btn secondary" data-close>Cancel</button><button class="btn danger" type="submit">Confirm & Continue</button></div><p class="error-text" data-admin-error></p></form>`);
    const form=m.querySelector('[data-admin-confirm]'), error=m.querySelector('[data-admin-error]'), button=form.querySelector('button[type="submit"]');
    form.addEventListener('submit',async(e)=>{e.preventDefault();error.textContent='';button.disabled=true;try{const r=await fetch(`${API}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form).entries()))});let d={};try{d=await r.json()}catch{}if(!r.ok||d.success===false)throw Error(d.message||'Invalid admin credentials');if(d.data?.user?.role!=='admin')throw Error('Only an admin account can confirm this action');m.remove();await fn();}catch(x){error.textContent=x.message||'Verification failed';}finally{button.disabled=false;}});
  }

  function idCard(person,kind) {
    const isStudent=kind==='student';
    const fields=isStudent
      ? [['Name',person.name,true],['Student ID',person.student_id,true],['Phone',person.phone],['Date of Birth',person.dob ? U.date(person.dob) : ''],['Address',person.address]]
      : [['Name',person.name,true],['Teacher ID',person.teacher_id,true],['Phone',person.phone],['Email',person.email],['Date of Birth',person.dob ? U.date(person.dob) : ''],['Address',person.address]];
    const target=`id-card-${kind}-${person.id}`;
    return `<div class="id-card-modal"><div id="${target}" class="id-card-export"><div class="id-card">
      <div class="id-card-header">
        <div class="id-card-brand">
          <img class="id-logo" crossorigin="anonymous" src="${U.photoUrl('/asset/image.jpeg')}" alt="RMCTI">
          <div><b>RMCTI</b><strong>Ratna's Modern Computer Training Institute</strong></div>
        </div>
      </div>
      <div class="id-card-body">
        <div class="id-photo-wrap">
          <img class="id-photo" crossorigin="anonymous" src="${U.photoUrl(person.photo)}" alt="${U.esc(person.name)} photo" onerror="this.onerror=null;this.src='${U.photoUrl('')}'">
        </div>
        <div class="id-card-details">
          ${fields.map(([k,v,important])=>`<div class="id-field ${important?'important':''}"><b>${U.esc(k)}</b><span>${U.esc(v||'—')}</span></div>`).join('')}
        </div>
      </div>
    </div></div><div class="right" style="justify-content:flex-end;margin-top:14px"><button type="button" class="btn secondary" data-download-id-card data-target-id="${target}">Download JPEG</button><button type="button" class="btn primary" data-close>Close</button></div></div>`;
  }

  function bindIdCardDownload(modal, person, kind) {
    const btn=modal.querySelector('[data-download-id-card]');
    btn?.addEventListener('click',async()=>{
      try{btn.disabled=true;await U.downloadElementAsJpeg(document.getElementById(btn.dataset.targetId),`${kind}-${person.id || (person.student_id||person.teacher_id)}-id-card.jpg`);U.toast('ID card downloaded');}
      catch(e){U.toast('Could not create the JPEG. Please try again.','error');console.error(e)}
      finally{btn.disabled=false;}
    });
  }


  async function refreshAdminDashboardNotifications() {
    const boxes = [...document.querySelectorAll('[data-notification-box]')];
    if (!boxes.length) return;
    let data;
    try { data = await Api.get('/notifications'); } catch { return; }
    const values = {
      complaints: String(data.complaints?.latest || ''),
      enquiries: String(data.enquiries?.latest || '')
    };
    boxes.forEach(box => {
      const type=box.dataset.notificationBox;
      const value=values[type] || '';
      const key=`rmcti_admin_dashboard_seen_${type}`;
      const shouldShow=Boolean(value) && localStorage.getItem(key)!==value;
      let dot=box.querySelector('[data-dashboard-notification-dot]');
      if(shouldShow && !dot){
        dot=document.createElement('span');
        dot.dataset.dashboardNotificationDot='1';
        dot.className='dashboard-notification-dot';
        dot.setAttribute('aria-label',`New ${type}`);
        box.appendChild(dot);
      } else if(!shouldShow && dot){ dot.remove(); }
      if(!box.dataset.notificationBound){
        box.dataset.notificationBound='1';
        box.addEventListener('click',()=>{
          if(value) localStorage.setItem(key,value);
          box.querySelector('[data-dashboard-notification-dot]')?.remove();
        },{passive:true});
      }
    });
  }

  async function dashboard(role) {
    const d = await Api.get(`/${role}/dashboard`);
    document.querySelectorAll('[data-stat]').forEach((el) => { el.textContent = d[el.dataset.stat] ?? 0; });

    if (role === 'admin') {
      const dateNode=q('[data-dashboard-date]');
      if(dateNode)dateNode.textContent=U.date(U.today());

      const collection=q('[data-stat="this_month_collection"]');
      if(collection)collection.textContent=U.money(d.this_month_collection||0);
      const pending=q('[data-stat="pending_fees"]');
      if(pending)pending.textContent=U.money(d.pending_fees||0);
      const partial=q('[data-stat="partial_fees"]');
      if(partial)partial.textContent=U.money(d.partial_fees||0);
      const fine=q('[data-stat="fine"]');
      if(fine)fine.textContent=U.money(d.fine||0);

      const statusClass=(status)=>{
        const s=String(status||'').toLowerCase();
        return s==='ongoing'?'ongoing':s==='completed'?'completed':s==='cancelled'?'cancelled':'scheduled';
      };
      const todayHtml=(d.todays_classes||[]).map(c=>`
        <button type="button" class="today-class-row" data-dashboard-class="${U.esc(c.class_id)}">
          <span class="today-time">${U.esc(U.time(c.start_time))}<small>${U.esc(U.time(c.end_time))}</small></span>
          <span class="today-class-copy"><b>${U.esc(c.subject||'')}</b><small>${U.esc(c.class_name||'')} · ${U.esc(c.batch||'')}</small><small>${U.esc(c.teacher_name||'Unassigned')}${c.room?` · ${U.esc(c.room)}`:''}</small></span>
          <span class="badge ${statusClass(c.status)}">${U.esc(c.status||'UPCOMING')}</span>
        </button>`).join('');
      fill(q('[data-today-classes]'), todayHtml || `<div class="empty-card"><b>No classes today</b><span>There are no classes scheduled for today.</span><a class="btn primary small" href="teacher-classes.html">＋ Schedule Class</a></div>`);

      fill(q('[data-recent-payments]'), (d.recent_payments||[]).map(p=>`
        <div class="dashboard-list-row">
          <div><b>${U.esc(p.student_name)}</b><small>${U.esc(p.receipt_number)} · ${U.esc(p.month)}</small></div>
          <strong>${U.money(p.amount)}</strong>
        </div>`).join('') || '<div class="empty-card"><b>No recent payments</b><span>Fee payments will appear here after collection.</span></div>');

      fill(q('[data-pending-fees]'), (d.pending_students||[]).map(s=>`
        <a class="dashboard-list-row" href="fee-payment.html?student=${encodeURIComponent(s.student_id)}">
          <div><b>${U.esc(s.name)}</b><small>${U.esc(s.student_id)} · ${U.esc(s.status)}</small></div>
          <strong>${U.money(s.amount)}</strong>
        </a>`).join('') || '<div class="empty-card"><b>All caught up</b><span>No current-month fee balance is pending.</span></div>');

      q('[data-today-classes]')?.addEventListener('click',async(e)=>{
        const btn=e.target.closest('[data-dashboard-class]'); if(!btn)return;
        try{
          const c=await Api.get(`/classes/${btn.dataset.dashboardClass}`);
          U.modal(`${c.subject||'Course'} · ${c.class_name}`, `
            <div class="profile-card">
              <div class="right" style="justify-content:space-between;align-items:flex-start">
                <div><div class="profile-kicker">${U.esc(c.subject||'Course')}</div><h2 style="margin:4px 0">${U.esc(c.class_name)}</h2><p class="muted">${U.esc(c.batch||'')}</p></div>
                <span class="badge active">ACTIVE</span>
              </div>
              <div class="detail-grid">
                <div><small>Students</small><b>${U.esc(c.student_count||0)} / ${U.esc(c.max_students||'—')}</b></div>
                <div><small>Room</small><b>${U.esc(c.room||'—')}</b></div>
              </div>
            </div>
            <div class="profile-card"><h3>Weekly Schedule</h3>${(c.allocations||[]).map(a=>`<div class="profile-list-row"><div><b>${U.esc(a.teacher_name||'Unassigned')}</b><small>${U.esc(a.subject||c.subject||'')}</small></div><span>${U.esc(a.day)} · ${U.esc(a.start_time)}–${U.esc(a.end_time)}</span></div>`).join('')||'<div class="empty-card"><b>No schedule</b><span>This course has no active schedule allocation.</span></div>'}</div>
            <div class="right" style="justify-content:flex-end"><a class="btn secondary" href="all-classes.html">Open Courses</a><a class="btn primary" href="teacher-classes.html">Manage Schedule</a></div>`);
        }catch(x){U.toast(x.message||'Could not load course details','error')}
      });

      await refreshAdminDashboardNotifications();
      clearInterval(window.__rmctiAdminDashboardTimer);
      window.__rmctiAdminDashboardTimer=setInterval(()=>refreshAdminDashboardNotifications().catch(()=>{}),60000);
    }

    if (role === 'teacher') {
      document.querySelectorAll('[data-teacher-name]').forEach((el) => { el.textContent = d.teacher?.name || 'Teacher'; });
      const dateNode=q('[data-dashboard-date]');
      if(dateNode) dateNode.textContent=U.date(U.today());
      const todayRows=(d.todays_classes || []).map((c) => {
        const now=new Date();
        const toMinutes=(v)=>{const [h,m]=String(v||'').split(':').map(Number);return (h*60)+(m||0);};
        const mins=now.getHours()*60+now.getMinutes(), st=toMinutes(c.start_time), et=toMinutes(c.end_time);
        const status=mins<st?'UPCOMING':mins<=et?'ONGOING':'COMPLETED';
        const cls=status.toLowerCase();
        return `<article class="today-class-row teacher-today-row"><span class="today-time">${U.esc(U.time(c.start_time))}<small>${U.esc(U.time(c.end_time))}</small></span><span class="today-class-copy"><b>${U.esc(c.subject||'')}</b><small>${U.esc(c.class_name||'')} · ${U.esc(c.batch||'')}</small><small>${U.esc(c.room||'No room')}</small></span><span class="badge ${cls}">${status}</span></article>`;
      }).join('');
      fill(q('[data-today-classes]'), todayRows || '<div class="empty-card"><b>No classes today</b><span>There are no scheduled classes for you today.</span></div>');
      fill(q('[data-today]'), todayRows || '<div class="empty-card"><b>No classes today</b><span>There are no scheduled classes for you today.</span></div>');
      const recent=(d.recent_classwork||[]).map((x)=>`<div class="dashboard-list-row"><div><b>${U.esc(x.topic||x.title||'Classwork')}</b><small>${U.esc(x.subject||'')} · ${U.esc(x.class_name||'')} · ${U.date(x.work_date)}</small></div><span class="badge completed">UPDATED</span></div>`).join('');
      fill(q('[data-teacher-recent]'), recent || '<div class="empty-card"><b>No recent classwork</b><span>Your latest classwork entries will appear here.</span></div>');
      const todayStat=document.querySelector('[data-stat="today_classes_count"]'); if(todayStat) todayStat.textContent=(d.todays_classes||[]).length;
    }

    if (role === 'student') {
      document.querySelectorAll('[data-student-name]').forEach((el) => { el.textContent = d.student?.name || ''; });
      document.querySelectorAll('[data-student-id]').forEach((el) => { el.textContent = d.student?.student_id || ''; });
      fill(q('[data-today]'), (d.todays_classes || []).map((c) => `<div class="item"><b>${U.esc(c.subject)}</b><div>${U.esc(U.time(c.start_time))}–${U.esc(U.time(c.end_time))} · ${U.esc(c.room || '')}</div></div>`).join('') || '<div class="empty">No class today.</div>');
      const fee = q('[data-fee]');
      if (fee) fee.innerHTML = `<span class="badge ${d.current_fee?.status === 'PAID' ? 'paid' : 'due'}">${U.esc(d.current_fee?.status || 'N/A')}</span><div class="statv">${U.money(d.current_fee?.amount || 0)}</div>`;
      const next=q('[data-next-class]'); if(next){ const n=d.next_class; next.innerHTML=n?`<div class="item"><b>${U.esc(n.subject||'')}</b><div>${U.esc(n.class_name||'')} · ${U.esc(n.batch||'')}</div><div class="muted">${U.esc(n.day||'')} · ${U.esc(U.time(n.start_time))}–${U.esc(U.time(n.end_time))} · ${U.esc(n.teacher_name||'')}</div></div>`:'<div class="empty">No upcoming class.</div>'; }
      fill(q('[data-homework]'), (d.upcoming_homework || []).map((h) => `<div class="item"><b>${U.esc(h.title)}</b><div class="muted">${U.esc(h.subject)} · due ${U.date(h.due_date)}</div></div>`).join('') || '<div class="empty">No upcoming homework.</div>');
    }
  }

  async function teachersPage() {
    const search = q('[data-search]'); const status = q('[data-status]'); const body = q('[data-body]');
    const load = async () => {
      const rows = await Api.get('/teachers', { q: search?.value || '', status: status?.value || '' });
      fill(body, rows.map((t) => `<tr><td>${U.esc(t.teacher_id)}</td><td>${U.esc(t.name)}</td><td>${U.esc(t.gender || '—')}</td><td>${U.esc(t.phone || '—')}</td><td>${U.esc(t.email || '—')}</td><td>${U.esc([...new Set((t.classes || []).map((c) => c.subject))].join(', ') || '—')}</td><td><span class="badge ${U.esc(t.status)}">${U.esc(t.status)}</span></td><td><button class="btn secondary small" data-view="${t.id}">Full Details</button> <button class="btn secondary small" data-idcard="${t.id}">ID Card</button> <button class="btn warning small" data-edit="${t.id}">Edit</button> <button class="btn danger small" data-del="${t.id}">Unregister</button></td></tr>`).join('') || tableEmpty(8));
    };
    search?.addEventListener('input', U.debounce(load)); status?.addEventListener('change', load);
    body?.addEventListener('click', async (e) => {
      const id = e.target.dataset.view || e.target.dataset.idcard || e.target.dataset.edit || e.target.dataset.del; if (!id) return;
      if (e.target.dataset.del) return adminVerifiedAction('Confirm teacher unregistration', 'Enter an administrator ID and password to confirm. The teacher becomes inactive and historical records remain.', async () => { await Api.del(`/teachers/${id}`); U.toast('Teacher unregistered'); load(); });
      const t = await Api.get(`/teachers/${id}`);
      if (e.target.dataset.edit) {
        const m = U.modal('Edit teacher', `<form id="editTeacher" class="form">
          <div class="full"><label class="label">Teacher ID / Username</label><input class="input" value="${U.esc(t.teacher_id)}" disabled><small class="muted">This is the login ID and cannot be changed.</small></div>
          <div><label class="label">Full name *</label><input class="input" name="name" value="${U.esc(t.name)}" required></div>
          <div><label class="label">Gender</label><input class="input" name="gender" value="${U.esc(t.gender || '')}"></div>
          <div><label class="label">Date of Birth</label><input class="input" type="date" name="dob" value="${U.esc(t.dob || '')}"></div>
          <div><label class="label">Phone</label><input class="input" name="phone" value="${U.esc(t.phone || '')}"></div>
          <div><label class="label">Aadhaar Number</label><input class="input" name="aadhaar_number" inputmode="numeric" maxlength="12" value="${U.esc(t.aadhaar_number || '')}"></div>
          <div><label class="label">Email</label><input class="input" type="email" name="email" value="${U.esc(t.email || '')}"></div>
          <div><label class="label">Qualification</label><input class="input" name="qualification" value="${U.esc(t.qualification || '')}"></div>
          <div><label class="label">Experience</label><input class="input" name="experience" value="${U.esc(t.experience || '')}"></div>
          <div><label class="label">Joining Date</label><input class="input" type="date" name="joining_date" value="${U.esc(t.joining_date || '')}"></div>
          <div><label class="label">Status</label><select class="select" name="status"><option value="active" ${t.status === 'active' ? 'selected' : ''}>Active</option><option value="inactive" ${t.status === 'inactive' ? 'selected' : ''}>Inactive</option></select></div>
          <div class="full"><label class="label">Address</label><textarea class="textarea" name="address" rows="3">${U.esc(t.address || '')}</textarea></div>
          <div class="full"><label class="label">Profile Image</label><div class="edit-photo-picker"><div class="edit-photo-preview-wrap"><img src="${U.photoUrl(t.photo)}" alt="Teacher photo preview" class="edit-photo-preview" data-photo-preview onerror="this.onerror=null;this.src='${U.photoUrl('')}';"></div><div class="edit-photo-controls"><label class="label edit-photo-file-label">Choose new image</label><input class="input edit-photo-file" type="file" name="photo_file" accept="image/jpeg,image/png,image/webp"><label class="edit-photo-remove"><input type="checkbox" name="photo_clear" value="1"> Remove current image</label></div></div></div>
          <div class="full"><label class="label">Password</label><input class="input" type="password" name="password" autocomplete="new-password" placeholder="Leave blank to keep current password"><small class="muted">Entering a new password replaces the current password.</small></div>
          <div class="full right" style="justify-content:flex-end"><button type="button" class="btn secondary" data-close>Cancel</button><button class="btn primary" type="submit">Save changes</button></div>
        </form>`);
        const form=m.querySelector('#editTeacher');
        form.querySelector('[name="photo_clear"]')?.addEventListener('change',ev=>{const preview=form.querySelector('[data-photo-preview]');if(ev.target.checked){preview.src=U.photoUrl('');preview.classList.add('is-cleared');}else{preview.src=U.photoUrl(t.photo);preview.classList.remove('is-cleared');}});form.querySelector('[name="photo_file"]')?.addEventListener('change',ev=>{const file=ev.target.files?.[0],preview=form.querySelector('[data-photo-preview]');if(!file)return;if(!file.type.startsWith('image/'))return;const url=URL.createObjectURL(file);preview.onload=()=>URL.revokeObjectURL(url);preview.src=url;preview.classList.remove('is-cleared');const clear=form.querySelector('[name="photo_clear"]');if(clear)clear.checked=false;});
        form.onsubmit = async (ev) => {
          ev.preventDefault(); const btn=form.querySelector('button[type="submit"]'); btn.disabled=true;
          try {
            const payload=formObj(form); const file=form.querySelector('[name="photo_file"]')?.files?.[0];
            delete payload.photo_file; delete payload.photo_clear;
            if(file){const up=await Api.upload('/uploads/photo',file);payload.photo=up.photo;}
            else if(form.querySelector('[name="photo_clear"]')?.checked){payload.photo=null;}
            if(!String(payload.password||'').trim()) delete payload.password;
            await Api.put(`/teachers/${id}`,payload); m.remove(); U.toast('Teacher updated'); load();
          } catch (x) { U.toast(x.message || 'Could not update teacher','error'); } finally { btn.disabled=false; }
        };
      } else if (e.target.dataset.idcard) {
        const m=U.modal('Teacher ID Card', idCard(t,'teacher')); bindIdCardDownload(m,t,'teacher');
      } else {
        window.RMCTIProfiles?.teacher(t);
      }
    });
    await load();
  }

  async function adminStudentAttendance(student) {
    let viewMonth = (() => { const [y,m]=U.today().split('-').map(Number); return new Date(y,m-1,1); })();
    const modal = U.modal(`Attendance · ${student.name}`, `
      <div class="attendance-view">
        <div class="attendance-topbar">
          <div>
            <div class="attendance-title">Monthly Attendance</div>
            <div class="muted attendance-subtitle">${U.esc(student.student_id || '')}</div>
          </div>
          <div class="attendance-nav">
            <button type="button" class="attendance-nav-btn" data-att-prev aria-label="Previous month">‹</button>
            <div class="attendance-month" data-att-month></div>
            <button type="button" class="attendance-nav-btn" data-att-next aria-label="Next month">›</button>
          </div>
        </div>
        <div class="attendance-summary">
          <div class="attendance-stat present-stat"><span class="attendance-stat-dot"></span><div><b data-att-present>0</b><span>Present</span></div></div>
          <div class="attendance-stat absent-stat"><span class="attendance-stat-dot"></span><div><b data-att-absent>0</b><span>Absent</span></div></div>
          <div class="attendance-stat no-record-stat"><span class="attendance-stat-dot"></span><div><b data-att-no-record>0</b><span>No record</span></div></div>
        </div>
        <div class="attendance-calendar-wrap">
          <div class="attendance-calendar" data-att-calendar></div>
        </div>
        <div class="attendance-legend">
          <span><i class="att-dot present"></i> Present</span>
          <span><i class="att-dot absent"></i> Absent</span>
          <span><i class="att-dot other"></i> No attendance</span>
        </div>
      </div>`);
    const monthEl=modal.querySelector('[data-att-month]'), cal=modal.querySelector('[data-att-calendar]');
    const presentEl=modal.querySelector('[data-att-present]'), absentEl=modal.querySelector('[data-att-absent]'), noRecordEl=modal.querySelector('[data-att-no-record]');
    const key=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const render=async()=>{
      const month=key(viewMonth);
      monthEl.textContent=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',month:'long',year:'numeric'}).format(viewMonth);
      fill(cal,'<div class="attendance-loading">Loading attendance…</div>');
      try {
        const data=await Api.get(`/students/${student.id}/attendance`,{month});
        const first=new Date(viewMonth.getFullYear(),viewMonth.getMonth(),1), last=new Date(viewMonth.getFullYear(),viewMonth.getMonth()+1,0);
        const start=(first.getDay()+6)%7, total=last.getDate();
        let present=0, absent=0, noRecord=0;
        let html=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>`<div class="att-weekday">${x}</div>`).join('');
        for(let i=0;i<start;i++) html+='<div class="att-day empty-day"></div>';
        for(let n=1;n<=total;n++){
          const iso=`${month}-${String(n).padStart(2,'0')}`, rec=data.records?.[iso], status=rec?.status||'other';
          if(status==='present') present++; else if(status==='absent') absent++; else noRecord++;
          const label=status==='present'?'Present':status==='absent'?'Absent':'No attendance record';
          html+=`<div class="att-day ${status}" title="${label}" aria-label="${iso}: ${label}"><span class="att-date-number">${n}</span></div>`;
        }
        fill(cal,html);
        presentEl.textContent=present; absentEl.textContent=absent; noRecordEl.textContent=noRecord;
      } catch(e){ fill(cal,`<div class="attendance-error">${U.esc(e.message||'Could not load attendance')}</div>`); }
    };
    modal.querySelector('[data-att-prev]').onclick=()=>{viewMonth.setMonth(viewMonth.getMonth()-1);render()};
    modal.querySelector('[data-att-next]').onclick=()=>{viewMonth.setMonth(viewMonth.getMonth()+1);render()};
    await render();
  }

  async function studentsPage() {
    const search = q('[data-search]'); const status = q('[data-status]'); const body = q('[data-body]');
    let students = [];
    const currentMonth = () => { const [y,m,d]=U.today().split('-').map(Number); return new Date(y,m-1,1); };
    const applicableFee = (fees, classId) => {
      const month=currentMonth();
      const rows=(fees||[]).filter((f)=>Number(f.class_id)===Number(classId)&&f.status==='active').sort((a,b)=>String(b.effective_from||'').localeCompare(String(a.effective_from||'')));
      return rows.find((f)=>{const from=f.effective_from?new Date(`${f.effective_from}T00:00:00`):null;const to=f.effective_to?new Date(`${f.effective_to}T23:59:59`):null;return (!from||from<=month)&&(!to||to>=month);})||rows[0]||null;
    };
    const feeIsCurrent=(f)=>{if(!f)return false;const month=currentMonth();const from=f.effective_from?new Date(`${f.effective_from}T00:00:00`):null;const to=f.effective_to?new Date(`${f.effective_to}T23:59:59`):null;return (!from||from<=month)&&(!to||to>=month);};

    const load = async () => {
      students = await Api.get('/students', { q: search?.value || '', status: status?.value || '' });
      fill(body, students.map((s) => `<tr><td>${U.esc(s.student_id)}</td><td>${U.esc(s.name)}</td><td>${U.esc((s.classes || []).map((c) => c.class_name).join(', ') || '—')}</td><td>${U.esc(s.phone || '—')}</td><td>${U.esc(s.parent?.name || '—')}</td><td>${U.esc(s.parent?.phone || '—')}</td><td><span class="badge ${s.current_month_status === 'PAID' ? 'paid' : s.current_month_status === 'DUE' ? 'due' : 'inactive'}">${U.esc(s.current_month_status || 'N/A')}</span></td><td><button class="btn success small" data-allot="${s.id}">＋ Allot Class</button> <button class="btn secondary small" data-attendance="${s.id}">See Attendance</button> <button class="btn secondary small" data-view="${s.id}">Full Details</button> <button class="btn secondary small" data-idcard="${s.id}">ID Card</button> <button class="btn warning small" data-edit="${s.id}">Edit</button> <button class="btn danger small" data-del="${s.id}">Delete</button></td></tr>`).join('') || tableEmpty(8));
    };

    const openAllot = async (studentId) => {
      if(!studentId) return U.toast('Select the student row first','error');
      try {
        const [classRows, feeRows, freshStudent] = await Promise.all([Api.get('/classes',{status:'active'}),Api.get('/fee-structures'),Api.get(`/students/${studentId}`)]);
        const modal = U.modal(`Allot Class · ${freshStudent.name}`, `<form id="allotStudentForm" class="form">
          <div class="full"><label class="label">Student</label><div class="card pad"><b>${U.esc(freshStudent.name)}</b><div class="muted">${U.esc(freshStudent.student_id)} · This student is fixed for this allotment.</div></div></div>
          <div class="full"><label class="label">Course *</label><select class="select" name="class_id" data-allot-class required><option value="">Select course</option>${classRows.map((c) => { const f=applicableFee(feeRows,c.id); const current=feeIsCurrent(f); return `<option value="${c.id}">${U.esc(c.class_name)} · ${U.esc(c.batch)} · ${U.esc(c.subject)}${f ? ` · ₹${Number(f.monthly_fee).toFixed(2)}/month${current?'':' · configured fee'}` : ' · Fee structure not set'}</option>`; }).join('')}</select></div>
          <div class="full" data-class-preview><div class="empty">Select a course to see its complete details and applicable fee.</div></div>
          <div class="full right" style="justify-content:flex-end"><button type="button" class="btn secondary" data-close>Cancel</button><button class="btn primary" type="submit">Allot Class</button></div>
        </form>`);
        const classSelect=modal.querySelector('[data-allot-class]'), preview=modal.querySelector('[data-class-preview]');
        const renderPreview=()=>{
          const c=classRows.find((x)=>String(x.id)===String(classSelect.value));
          if(!c)return fill(preview,'<div class="empty">Select a course to see its complete details and applicable fee.</div>');
          const f=applicableFee(feeRows,c.id);
          const assigned=(freshStudent.classes||[]).some(x=>Number(x.class_id)===Number(c.id));
          const schedule=(c.allocations||[]).map((a)=>`${U.esc(a.day)} · ${U.esc(a.start_time)}–${U.esc(a.end_time)}${a.room?` · Room ${U.esc(a.room)}`:''}${a.teacher_name?` · ${U.esc(a.teacher_name)}`:''}`).join('<br>')||'No teacher/schedule assigned yet.';
          fill(preview,`<div class="card pad"><div class="g2"><div><b>Course</b><p>${U.esc(c.class_name)} · ${U.esc(c.batch)}</p></div><div><b>Subject</b><p>${U.esc(c.subject)}</p></div><div><b>Room</b><p>${U.esc(c.room||'—')}</p></div><div><b>Capacity</b><p>${U.esc(c.student_count)} / ${U.esc(c.max_students)}</p></div><div class="full"><b>Teacher & Schedule</b><p>${schedule}</p></div><div><b>Fee Structure</b><p class="statv">${f?U.money(f.monthly_fee):'Not set'}</p></div><div><b>Fee Effective From</b><p>${f?U.date(f.effective_from):'—'}</p></div></div>${assigned?'<p class="badge due">This student is already assigned to this course.</p>':f&&feeIsCurrent(f)?'<p class="muted">This course has an active fee structure for the current month.</p>':f?'<p class="badge due">A fee structure exists, but it is not active for the current month. The student can still be allotted.</p>':'<p class="badge due">No fee structure is configured for this course yet. The student can still be allotted.</p>'}</div>`);
        };
        classSelect.addEventListener('change',renderPreview); renderPreview();
        modal.querySelector('#allotStudentForm').addEventListener('submit',async(e)=>{e.preventDefault();const cid=Number(classSelect.value);if(!cid)return U.toast('Select a course','error');if((freshStudent.classes||[]).some(x=>Number(x.class_id)===cid))return U.toast('Student is already assigned to this course','error');const btn=e.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;try{await Api.post('/student-classes',{student_id:Number(freshStudent.id),class_id:cid});modal.remove();U.toast(`${freshStudent.name} allotted to the selected course`);await load();}catch(x){U.toast(x.message,'error')}finally{btn.disabled=false;}});
      } catch (x) { U.toast(x.message || 'Could not load classes','error'); }
    };

    search?.addEventListener('input', U.debounce(load)); status?.addEventListener('change', load);
    body?.addEventListener('click', async (e) => {
      const id = e.target.dataset.view || e.target.dataset.edit || e.target.dataset.del || e.target.dataset.allot || e.target.dataset.attendance; if (!id) return;
      if (e.target.dataset.allot) return openAllot(id);
      if (e.target.dataset.attendance) { const st=students.find(x=>String(x.id)===String(id)); if(st) return adminStudentAttendance(st); }
      if (e.target.dataset.del) return adminVerifiedAction('Delete student permanently', 'This permanently deletes the student, class allotments, fee payments/receipts, attendance and complaints. This action cannot be undone.', async () => { await Api.del(`/students/${id}`); U.toast('Student deleted permanently'); await load(); });
      const st = await Api.get(`/students/${id}`);
      if (e.target.dataset.edit) {
        const m=U.modal('Edit student', `<form id="editStudent" class="form">
          <div class="full"><label class="label">Student ID / Username</label><input class="input" value="${U.esc(st.student_id)}" disabled><small class="muted">This is the login ID and cannot be changed.</small></div>
          <div><label class="label">Full name *</label><input class="input" name="name" value="${U.esc(st.name)}" required></div>
          <div><label class="label">Gender</label><input class="input" name="gender" value="${U.esc(st.gender || '')}"></div>
          <div><label class="label">Date of Birth</label><input class="input" type="date" name="dob" value="${U.esc(st.dob || '')}"></div>
          <div><label class="label">Phone</label><input class="input" name="phone" value="${U.esc(st.phone || '')}"></div>
          <div><label class="label">Aadhaar Number</label><input class="input" name="aadhaar_number" inputmode="numeric" maxlength="12" value="${U.esc(st.aadhaar_number || '')}"></div>
          <div><label class="label">School / College</label><input class="input" name="school_name" value="${U.esc(st.school_name || '')}"></div>
          <div><label class="label">Admission Date</label><input class="input" type="date" name="admission_date" value="${U.esc(st.admission_date || '')}"></div>
          <div><label class="label">Status</label><select class="select" name="status"><option value="active" ${st.status==='active'?'selected':''}>Active</option><option value="inactive" ${st.status==='inactive'?'selected':''}>Inactive</option></select></div>
          <div class="full"><label class="label">Address</label><textarea class="textarea" name="address" rows="3">${U.esc(st.address || '')}</textarea></div>
          <div class="full"><h3 style="margin:0 0 10px">Guardian / Parent</h3></div>
          <div><label class="label">Name</label><input class="input" name="parent_name" value="${U.esc(st.parent?.name || '')}"></div>
          <div><label class="label">Relationship</label><input class="input" name="parent_relationship" value="${U.esc(st.parent?.relationship || '')}"></div>
          <div><label class="label">Phone</label><input class="input" name="parent_phone" value="${U.esc(st.parent?.phone || '')}"></div>
          <div><label class="label">Email</label><input class="input" type="email" name="parent_email" value="${U.esc(st.parent?.email || '')}"></div>
          <div class="full"><label class="label">Address</label><textarea class="textarea" name="parent_address" rows="2">${U.esc(st.parent?.address || '')}</textarea></div>
          <div class="full"><label class="label">Profile Image</label><div class="edit-photo-picker"><div class="edit-photo-preview-wrap"><img src="${U.photoUrl(st.photo)}" alt="Student photo preview" class="edit-photo-preview" data-photo-preview onerror="this.onerror=null;this.src='${U.photoUrl('')}';"></div><div class="edit-photo-controls"><label class="label edit-photo-file-label">Choose new image</label><input class="input edit-photo-file" type="file" name="photo_file" accept="image/jpeg,image/png,image/webp"><label class="edit-photo-remove"><input type="checkbox" name="photo_clear" value="1"> Remove current image</label></div></div></div>
          <div class="full"><label class="label">Password</label><input class="input" type="password" name="password" autocomplete="new-password" placeholder="Leave blank to keep current password"><small class="muted">Entering a new password replaces the current password.</small></div>
          <div class="full right" style="justify-content:flex-end"><button type="button" class="btn secondary" data-close>Cancel</button><button class="btn primary" type="submit">Save changes</button></div>
        </form>`);
        const form=m.querySelector('#editStudent');
        form.querySelector('[name="photo_clear"]')?.addEventListener('change',ev=>{const preview=form.querySelector('[data-photo-preview]');if(ev.target.checked){preview.src=U.photoUrl('');preview.classList.add('is-cleared');}else{preview.src=U.photoUrl(st.photo);preview.classList.remove('is-cleared');}});form.querySelector('[name="photo_file"]')?.addEventListener('change',ev=>{const file=ev.target.files?.[0],preview=form.querySelector('[data-photo-preview]');if(!file)return;if(!file.type.startsWith('image/'))return;const url=URL.createObjectURL(file);preview.onload=()=>URL.revokeObjectURL(url);preview.src=url;preview.classList.remove('is-cleared');const clear=form.querySelector('[name="photo_clear"]');if(clear)clear.checked=false;});
        form.onsubmit=async(ev)=>{ev.preventDefault();const btn=form.querySelector('button[type="submit"]');btn.disabled=true;try{const raw=formObj(form);const file=form.querySelector('[name="photo_file"]')?.files?.[0];const payload={name:raw.name,gender:raw.gender,dob:raw.dob,phone:raw.phone,aadhaar_number:raw.aadhaar_number,school_name:raw.school_name,admission_date:raw.admission_date,status:raw.status,address:raw.address,parent:{name:raw.parent_name,relationship:raw.parent_relationship,phone:raw.parent_phone,email:raw.parent_email,address:raw.parent_address}};if(file){const up=await Api.upload('/uploads/photo',file);payload.photo=up.photo;}else if(form.querySelector('[name="photo_clear"]')?.checked){payload.photo=null;}if(String(raw.password||'').trim())payload.password=raw.password;await Api.put(`/students/${id}`,payload);m.remove();U.toast('Student updated');load();}catch(x){U.toast(x.message||'Could not update student','error')}finally{btn.disabled=false;}};
      } else if (e.target.dataset.idcard) {
        const m=U.modal('Student ID Card', idCard(st,'student')); bindIdCardDownload(m,st,'student');
      } else {
        window.RMCTIProfiles?.student(st);
      }
    });
    await load();
  }

  async function allClasses() {
    const wrap=q('[data-class-list]');
    const load=async()=>{
      const rows=await Api.get('/classes',{status:'active',include_current:'1'});
      rows.sort((a,b)=>Number(!!b.is_ongoing)-Number(!!a.is_ongoing) || String(a.class_name).localeCompare(String(b.class_name)));
      fill(wrap, rows.map(c=>`<article class="class-admin-card">
        <div class="class-admin-head"><div><h3>${U.esc(c.class_name)}</h3><div class="muted">${U.esc(c.batch)} · ${U.esc(c.subject)}</div></div><span class="badge ${c.is_ongoing?'success':'active'}">${c.is_ongoing?'ONGOING NOW':'Active'}</span></div>
        <div class="class-admin-meta"><span><b>${U.esc(c.student_count)}</b> / ${U.esc(c.max_students)} Students</span><span>${U.esc(c.room||'Room not set')}</span></div>
        <div class="class-admin-schedule">${(c.allocations||[]).map(a=>`<div><b>${U.esc(a.teacher_name||'Unassigned')}</b><span>${U.esc(a.day)} · ${U.esc(a.start_time)}–${U.esc(a.end_time)}${a.room?` · ${U.esc(a.room)}`:''}</span></div>`).join('')||'<span class="muted">No teacher allocation yet.</span>'}</div>
        <div class="right" style="justify-content:flex-end;margin-top:14px"><button class="btn secondary small" data-class-attendance="${c.id}">See Attendance</button><button class="btn secondary small" data-class-students="${c.id}">View Students</button><button class="btn warning small" data-reschedule-class="${c.id}">Manage Schedule</button><button class="btn danger small" data-class-deactivate="${c.id}">Delete Class</button></div>
      </article>`).join('')||'<div class="empty">No active courses found.</div>');
    };

    const openAttendanceHistory=async(classId)=>{
      try{
        const c=await Api.get(`/classes/${classId}`);
        let d=await Api.get(`/admin/classes/${classId}/attendance/history`);
        const m=U.modal(`Attendance · ${c.class_name}`,`<div class="form" style="margin-bottom:16px"><div><label class="label">From date</label><input class="input" type="date" data-history-from></div><div><label class="label">To date</label><input class="input" type="date" data-history-to></div><div class="full right" style="justify-content:flex-end"><button type="button" class="btn secondary small" data-history-clear>Clear</button><button type="button" class="btn primary small" data-history-filter>Filter</button></div></div><div data-history-results></div>`);
        const renderHistory=(data)=>{const target=m.querySelector('[data-history-results]');target.innerHTML=(data.history||[]).map(day=>`<div class="card pad" style="margin-bottom:12px"><div class="right" style="justify-content:space-between;align-items:center"><div><b>${U.date(day.date)}</b> <span class="muted">(${U.esc(day.day)})</span>${day.start_time?` <span class="badge active">${U.esc(day.start_time)}–${U.esc(day.end_time||'')}</span>`:' <span class="muted">Legacy/unspecified session</span>'}</div><span class="badge active">Present ${day.present} · Absent ${day.absent}</span></div><div class="table" style="margin-top:10px"><table><thead><tr><th>Student</th><th>ID</th><th>Status</th></tr></thead><tbody>${(day.students||[]).map(st=>`<tr><td><b>${U.esc(st.name)}</b></td><td>${U.esc(st.student_id)}</td><td><span class="badge ${st.status==='present'?'active':'due'}">${U.esc(st.status)}</span></td></tr>`).join('')}</tbody></table></div></div>`).join('')||'<div class="empty">No attendance records found for the selected dates.</div>';};
        renderHistory(d);
        m.querySelector('[data-history-filter]')?.addEventListener('click',async()=>{try{const from=m.querySelector('[data-history-from]').value,to=m.querySelector('[data-history-to]').value;if(from&&to&&from>to)return U.toast('From date cannot be after To date','error');d=await Api.get(`/admin/classes/${classId}/attendance/history`,{from,to});renderHistory(d);}catch(e){U.toast(e.message||'Could not load attendance history','error')}});
        m.querySelector('[data-history-clear]')?.addEventListener('click',async()=>{m.querySelector('[data-history-from]').value='';m.querySelector('[data-history-to]').value='';try{d=await Api.get(`/admin/classes/${classId}/attendance/history`);renderHistory(d);}catch(e){U.toast(e.message||'Could not load attendance history','error')}});
      }catch(e){U.toast(e.message||'Could not load attendance history','error');}
    };


    const openReschedule=async(classId)=>{
      try{
        const c=await Api.get(`/classes/${classId}`);
        const teachers=await Api.get('/teachers',{status:'active'});
        const today=U.today();
        const getMonday=iso=>{const d=new Date(`${iso}T00:00:00`);d.setDate(d.getDate()-((d.getDay()+6)%7));return d.toISOString().slice(0,10);};
        const dateAdd=(iso,n)=>{const d=new Date(`${iso}T00:00:00`);d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);};
        const dayName=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
        const dateLabel=iso=>new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(`${iso}T00:00:00`));

        let weekStart=getMonday(today);
        const m=U.modal(`Schedule Class · ${c.class_name}`,`
          <form class="form schedule-manager-form" data-reschedule-form>
            <div class="full"><label class="label">Action</label>
              <select class="select" name="kind" data-res-action>
                <option value="delete">Cancel a scheduled class</option>
                <option value="weekly_time">Change a scheduled class for this week</option>
                <option value="extra">Add an extra class</option>
              </select>
            </div>
            <div class="full schedule-manager-help" data-res-help></div>
            <div>
              <label class="label">Week</label>
              <input class="input" type="date" name="week_start" value="${weekStart}" required>
              <small class="muted">The week is Monday–Sunday.</small>
            </div>
            <div data-class-date-wrap>
              <label class="label">Scheduled class</label>
              <select class="select" name="schedule_date" data-existing-class required></select>
              <small class="muted">Only classes actually scheduled on the selected week are shown.</small>
            </div>
            <div data-target-date-wrap style="display:none">
              <label class="label">New date for this week</label>
              <select class="select" name="target_date" data-target-date required></select>
            </div>
            <div data-extra-date-wrap style="display:none">
              <label class="label">Extra class date</label>
              <input class="input" type="date" name="extra_date" data-extra-date>
            </div>
            <div data-extra-teacher style="display:none">
              <label class="label">Teacher</label>
              <select class="select" name="teacher_id" data-extra-teacher-select><option value="">Select teacher</option>${teachers.map(x=>`<option value="${x.id}">${U.esc(x.name)} · ${U.esc(x.teacher_id)}</option>`).join('')}</select>
            </div>
            <div data-time-fields class="full g2">
              <div><label class="label">Start time</label><input class="input" type="time" name="start_time"></div>
              <div><label class="label">End time</label><input class="input" type="time" name="end_time"></div>
            </div>
            <div class="full right" style="justify-content:flex-end">
              <button class="btn secondary" type="button" data-close>Close</button>
              <button class="btn primary" type="submit">Save Change</button>
            </div>
          </form>
          <hr style="border:0;border-top:1px solid var(--border);margin:18px 0">
          <div class="schedule-manager-history"><div class="schedule-manager-section-title"><div><h3>Changes this week</h3><span class="muted">Recent one-time schedule changes</span></div></div><div data-res-list class="grid schedule-change-list"></div></div>
        `);

        const form=m.querySelector('[data-reschedule-form]');
        const action=m.querySelector('[data-res-action]');
        const weekInput=m.querySelector('[name="week_start"]');
        const existing=m.querySelector('[data-existing-class]');
        const target=m.querySelector('[data-target-date]');
        const extraDate=m.querySelector('[data-extra-date]');
        const extraDateWrap=m.querySelector('[data-extra-date-wrap]');
        const classDateWrap=m.querySelector('[data-class-date-wrap]');
        const targetWrap=m.querySelector('[data-target-date-wrap]');
        const extraTeacher=m.querySelector('[data-extra-teacher]');
        const timeFields=m.querySelector('[data-time-fields]');
        const startInput=m.querySelector('[name="start_time"]');
        const endInput=m.querySelector('[name="end_time"]');
        const help=m.querySelector('[data-res-help]');

        let scheduleRows=[];

        const datesForWeek=ws=>[...Array(7)].map((_,i)=>dateAdd(ws,i));
        const renderTargetDates=()=>{
          const dates=datesForWeek(weekStart);
          target.innerHTML=dates.map(d=>`<option value="${d}">${dayName[new Date(`${d}T00:00:00`).getDay()===0?6:new Date(`${d}T00:00:00`).getDay()-1]} · ${dateLabel(d)}</option>`).join('');
        };
        const renderExisting=()=>{
          existing.innerHTML=scheduleRows.map((x,i)=>`<option value="${x.allocation_id || 'extra'}::${x.date}" data-row-index="${i}">${dateLabel(x.date)} · ${dayName[x.day_of_week]} · ${U.esc(x.start_time)}–${U.esc(x.end_time)} · ${U.esc(x.teacher_name||'No teacher')}</option>`).join('') || '<option value="">No scheduled class on this week</option>';
          if(scheduleRows.length){
            existing.value=`${scheduleRows[0].allocation_id || 'extra'}::${scheduleRows[0].date}`;
            syncSelectedClass();
          }else{
            startInput.value='';endInput.value='';
          }
        };
        const syncSelectedClass=()=>{
          const row=scheduleRows.find(x=>`${x.allocation_id || 'extra'}::${x.date}`===existing.value);
          if(!row)return;
          startInput.value=row.start_time||'';
          endInput.value=row.end_time||'';
          const d=new Date(`${row.date}T00:00:00`);
          const next=dateAdd(row.date,1);
          target.value=next>=weekStart && next<=dateAdd(weekStart,6) ? next : row.date;
        };
        const loadSchedule=async()=>{
          weekStart=getMonday(weekInput.value||today);
          weekInput.value=weekStart;
          try{
            scheduleRows=await Api.get(`/classes/${classId}/schedule-week`,{week_start:weekStart});
            renderExisting();
            renderTargetDates();
            if(scheduleRows.length)syncSelectedClass();
            await loadChanges();
          }catch(e){
            scheduleRows=[];
            renderExisting();
            U.toast(e.message||'Could not load weekly schedule','error');
          }
        };

        const refreshFields=()=>{
          const kind=action.value;
          const deleting=kind==='delete';
          const changing=kind==='weekly_time';
          const extra=kind==='extra';
          help.innerHTML=deleting
            ? '<div class="badge due">The selected occurrence will be cancelled only on its actual date.</div>'
            : changing
              ? '<div class="badge active">Only the selected occurrence changes. The normal weekly schedule stays unchanged.</div>'
              : '<div class="badge active">One-time class: choose the exact date and teacher. It will not change the recurring schedule.</div>';
          classDateWrap.style.display=extra?'none':'block';
          existing.required=!extra;
          targetWrap.style.display=changing?'block':'none';
          target.required=changing;
          extraDateWrap.style.display=extra?'block':'none';
          extraDate.required=extra;
          extraTeacher.style.display=extra?'block':'none';
          m.querySelector('[data-extra-teacher-select]').required=extra;
          timeFields.style.display=deleting?'none':'grid';
          startInput.required=!deleting;
          endInput.required=!deleting;
          if(!extra)syncSelectedClass();
        };

        action.addEventListener('change',refreshFields);
        existing.addEventListener('change',syncSelectedClass);
        weekInput.addEventListener('change',loadSchedule);
        extraDate.addEventListener('change',()=>{
          if(extraDate.value) weekInput.value=getMonday(extraDate.value);
        });

        const loadChanges=async()=>{
          try{
            const rows=await Api.get('/schedule-exceptions',{class_id:classId,week_start:weekStart});
            fill(m.querySelector('[data-res-list]'),rows.map(x=>{
              const name=x.kind==='delete'?'Cancelled':x.kind==='extra'?'Extra class':'Changed this week';
              const when=x.schedule_date?dateLabel(x.schedule_date):'';
              const move=x.target_date&&x.target_date!==x.schedule_date?` → ${dateLabel(x.target_date)}`:'';
              const time=x.start_time?` · ${x.start_time}–${x.end_time}`:'';
              return `<div class="card pad"><div><b>${name}</b><div class="muted">${when}${move}${time}</div></div><button class="btn danger small" data-res-delete="${x.id}" style="margin-top:8px">Undo</button></div>`;
            }).join('')||'<div class="empty">No changes for this week.</div>');
          }catch(e){fill(m.querySelector('[data-res-list]'),'<div class="empty">Could not load changes.</div>');}
        };

        form.addEventListener('submit',async ev=>{
          ev.preventDefault();
          const kind=action.value;
          const selected=scheduleRows.find(x=>`${x.allocation_id || 'extra'}::${x.date}`===existing.value);
          if(kind!=='extra'&&!selected)return U.toast('No scheduled class selected','error');
          if(kind==='extra'&&!extraDate.value)return U.toast('Choose the extra class date','error');
          if(kind!=='delete'&&(!startInput.value||!endInput.value||startInput.value>=endInput.value))return U.toast('Choose a valid start and end time','error');
          if(kind==='weekly_time'&&target.value===selected.date&&startInput.value===selected.start_time&&endInput.value===selected.end_time)
            return U.toast('Choose a different date or time','error');

          const payload={
            class_id:classId,
            kind,
            week_start:weekStart,
            allocation_id: selected?.allocation_id || null,
            schedule_date: kind==='extra' ? extraDate.value : selected.date,
            target_date: kind==='weekly_time' ? target.value : null,
            start_time: kind==='delete' ? null : startInput.value,
            end_time: kind==='delete' ? null : endInput.value,
            teacher_id: kind==='extra' ? Number(m.querySelector('[data-extra-teacher-select]').value) : (selected?.teacher_id || null)
          };
          const btn=form.querySelector('button[type="submit"]');
          const commitChange=async()=>{
            btn.disabled=true;
            try{
              const result=await Api.post('/schedule-exceptions',payload);
              U.toast(result.message||'Schedule updated');
              await loadSchedule();
            }catch(x){U.toast(x.message||'Could not update schedule','error')}
            finally{btn.disabled=false;}
          };
          if(kind==='delete'){
            const selectedLabel=selected?`${dateLabel(selected.date)} · ${U.esc(selected.start_time)}–${U.esc(selected.end_time)}`:'this scheduled occurrence';
            U.confirm('Cancel Class?',`${c.class_name} · ${selectedLabel}. This class will be marked as cancelled for this date only.`,commitChange);
          }else{
            await commitChange();
          }
        });

        m.querySelector('[data-res-list]')?.addEventListener('click',async ev=>{
          const id=ev.target.closest('[data-res-delete]')?.dataset.resDelete;
          if(!id)return;
          try{await Api.del(`/schedule-exceptions/${id}`);U.toast('Schedule change undone');await loadSchedule();}catch(x){U.toast(x.message||'Could not undo change','error')}
        });

        refreshFields();
        await loadSchedule();
      }catch(e){U.toast(e.message||'Could not open schedule manager','error')}
    };

    wrap?.addEventListener('click',async e=>{
      const attendance=e.target.dataset.classAttendance, view=e.target.dataset.classStudents, del=e.target.dataset.classDeactivate, reschedule=e.target.dataset.rescheduleClass;
      if(attendance)return openAttendanceHistory(attendance);
      if(reschedule)return openReschedule(reschedule);
      if(del)return adminVerifiedAction('Delete class','This permanently removes the class and its teacher/student allocations, fee structures, homework, classwork and attendance records. The class will not appear anywhere after deletion.',async()=>{await Api.del(`/classes/${del}`);U.toast('Class deleted permanently');load()});
      if(!view)return;
      try{
        const c=await Api.get(`/classes/${view}`);
        const m=U.modal(`${c.class_name} · Students`, `<div><div class="muted" style="margin-bottom:12px">${U.esc(c.batch)} · ${U.esc(c.subject)} · ${U.esc(c.student_count)} / ${U.esc(c.max_students)} students</div><div class="table"><table><thead><tr><th>Student ID</th><th>Name</th><th>Phone</th><th>Action</th></tr></thead><tbody data-class-students-body>${(c.students||[]).map(s=>`<tr><td>${U.esc(s.student_id)}</td><td>${U.esc(s.name)}</td><td>${U.esc(s.phone||'—')}</td><td><button class="btn danger small" data-remove-student-class="${s.id}">Remove</button></td></tr>`).join('')||tableEmpty(4,'No students are currently allotted.')}</tbody></table></div></div>`);
        m.querySelector('[data-class-students-body]')?.addEventListener('click',async ev=>{const sid=ev.target.dataset.removeStudentClass;if(!sid)return;U.confirm('Remove student from course','This removes the active course assignment only; the student account and records are preserved.',async()=>{try{await Api.del(`/classes/${c.id}/students/${sid}`);m.remove();U.toast('Student removed from course');await load();}catch(e){U.toast(e.message,'error')}});});
      }catch(e){U.toast(e.message||'Could not load course','error')}
    });
    await load();
    const requestedView=new URLSearchParams(location.search).get('view');
    if(requestedView){
      try{
        const c=await Api.get(`/classes/${requestedView}`);
        U.modal(`${U.esc(c.subject||'Course')} · ${U.esc(c.class_name)}`,`<div class="profile-card"><div class="profile-kicker">${U.esc(c.subject||'Course')}</div><h2 style="margin:4px 0">${U.esc(c.class_name)}</h2><p class="muted">${U.esc(c.batch||'')}${c.room?` · ${U.esc(c.room)}`:''}</p><div class="detail-grid"><div><small>Students</small><b>${U.esc(c.student_count||0)} / ${U.esc(c.max_students||'—')}</b></div><div><small>Teachers</small><b>${U.esc(new Set((c.allocations||[]).map(a=>a.teacher_id)).size)}</b></div></div></div><div class="profile-card"><h3>Weekly Schedule</h3>${(c.allocations||[]).map(a=>`<div class="profile-list-row"><div><b>${U.esc(a.teacher_name||'Unassigned')}</b><small>${U.esc(a.day)}</small></div><span>${U.esc(a.start_time)}–${U.esc(a.end_time)}</span></div>`).join('')||'<div class="empty-card"><b>No schedule</b><span>No active teacher allocation exists for this course.</span></div>'}</div>`);
      }catch(e){U.toast(e.message||'Could not open course','error')}
    }
  }

  async function registerPage(kind) {
    const form = q('form[data-register]'); if (!form) return;
    const passwordInput=form.querySelector('[name="password"]');
    const generator=form.querySelector('[data-generate-password]');
    const makePassword=()=>{ const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'; const values=window.crypto?.getRandomValues?.(new Uint32Array(12)); let out=''; for(let i=0;i<12;i++) out+=chars[values?values[i]%chars.length:Math.floor(Math.random()*chars.length)]; return out; };
    generator?.addEventListener('click',()=>{ if(passwordInput){ passwordInput.value=makePassword(); passwordInput.focus(); } });
    if(kind==='student'){
      const classes=await Api.get('/classes',{status:'active'});
      fill(q('[data-class-list]'),classes.map((c)=>`<label class="card pad"><input type="checkbox" name="class_ids" value="${c.id}"> ${U.esc(c.class_name)} · ${U.esc(c.batch)} · ${U.esc(c.subject)}</label>`).join('')||'<div class="empty">Create a course first.</div>');
    }
    form.addEventListener('submit',async(e)=>{
      e.preventDefault();
      const data=formObj(e.currentTarget),file=q('[name="photo_file"]')?.files?.[0],submit=form.querySelector('button[type="submit"]');
      if(!String(data.password||'').trim()) return U.toast('Generate or enter a password before registering.','error');
      submit&&(submit.disabled=true);
      try{
        if(file){const up=await Api.upload('/uploads/photo',file);data.photo=up.photo;}
        delete data.photo_file;
        if(kind==='teacher'){
          const r=await Api.post('/teachers',data);
          U.modal('Teacher registered successfully',`<div class="success-panel"><p><b>Name:</b> ${U.esc(r.teacher.name)}</p><p><b>Teacher ID / Username:</b> ${U.esc(r.teacher.teacher_id)}</p><p><b>Password:</b> <span class="credential-value">${U.esc(r.credentials.temporary_password)}</span></p><p class="muted">This Teacher ID is the login username.</p></div>`);
        }else{
          data.class_ids=[...form.querySelectorAll('[name="class_ids"]:checked')].map((x)=>Number(x.value));
          data.parent={name:data.parent_name,relationship:data.parent_relationship,phone:data.parent_phone,email:data.parent_email,address:data.parent_address};
          ['class_ids','parent_name','parent_relationship','parent_phone','parent_email','parent_address'].forEach((k)=>delete data[k]);
          const r=await Api.post('/students',data);
          U.modal('Student registered successfully',`<div class="success-panel"><p><b>Name:</b> ${U.esc(r.student.name)}</p><p><b>Student ID / Username:</b> ${U.esc(r.student.student_id)}</p><p><b>Password:</b> <span class="credential-value">${U.esc(r.credentials.temporary_password)}</span></p><p class="muted">This Student ID is the login username.</p></div>`);
        }
        U.toast('Registration completed successfully'); form.reset();
      }catch(x){U.toast(x.message,'error');}
      finally{submit&&(submit.disabled=false);}
    });
  }

  async function feeStructure() {
    const classSelect=q('[data-class-id]');
    const body=q('[data-body]');
    const form=q('form[data-fee-form]');
    let classes=[];

    const renderClassOptions=(selected='')=>{
      fill(classSelect,
        '<option value="">Select course / class</option>'+
        classes.map(c=>`<option value="${c.id}" ${String(c.id)===String(selected)?'selected':''}>${U.esc(c.class_name)} · ${U.esc(c.batch)} · ${U.esc(c.subject)}</option>`).join('')
      );
    };

    const load=async()=>{
      const rows=await Api.get('/fee-structures');
      fill(body,rows.map(f=>`<tr>
        <td><b>${U.esc(f.class_name)}</b></td>
        <td>${U.esc(f.batch)}</td>
        <td>${U.esc(f.subject)}</td>
        <td>${U.money(f.monthly_fee)}</td>
        <td>${U.date(f.effective_from)}</td>
        <td>${U.date(f.effective_to)}</td>
        <td><span class="badge ${U.esc(f.status)}">${U.esc(f.status)}</span></td>
        <td><button type="button" class="btn warning small" data-edit="${f.id}">Edit / Assign</button> ${f.status==='active'?`<button type="button" class="btn danger small" data-deactivate="${f.id}">Deactivate</button>`:`<button type="button" class="btn danger small" data-delete="${f.id}">Delete inactive</button>`}</td>
      </tr>`).join('')||tableEmpty(8,'No fee structures created yet.'));
    };

    try{
      classes=await Api.get('/classes',{status:'active'});
      renderClassOptions();
    }catch(e){
      fill(classSelect,'<option value="">Could not load courses</option>');
      throw e;
    }

    const feeFrom=form?.querySelector('[name="effective_from"]');
    if(feeFrom && !feeFrom.value) feeFrom.value=U.today();

    form?.addEventListener('submit',async e=>{
      e.preventDefault();
      const btn=form.querySelector('button[type="submit"]');
      const payload=formObj(form);
      payload.class_id=Number(payload.class_id);
      payload.monthly_fee=Number(payload.monthly_fee);
      if(!Number.isInteger(payload.class_id)||payload.class_id<=0) return U.toast('Please select a course/class','error');
      if(!Number.isFinite(payload.monthly_fee)||payload.monthly_fee<=0) return U.toast('Please enter a valid monthly fee','error');
      if(!payload.effective_from) return U.toast('Effective From is required','error');
      if(payload.effective_to && payload.effective_to<payload.effective_from) return U.toast('Effective To cannot be before Effective From','error');
      btn.disabled=true;
      try{
        await Api.post('/fee-structures',payload);
        U.toast('Fee structure assigned to the selected course/class');
        form.reset();
        renderClassOptions();
        if(feeFrom) feeFrom.value=U.today();
        await load();
      }catch(x){U.toast(x.message||'Could not create fee structure','error')}
      finally{btn.disabled=false;}
    });

    body?.addEventListener('click',async e=>{
      const id=e.target.dataset.edit||e.target.dataset.deactivate||e.target.dataset.delete;
      if(!id)return;
      if(e.target.dataset.deactivate){
        try{await Api.put(`/fee-structures/${id}`,{status:'inactive'});U.toast('Fee structure marked inactive');await load();}
        catch(x){U.toast(x.message||'Could not deactivate fee structure','error')}
        return;
      }
      if(e.target.dataset.delete){
        try{await Api.del(`/fee-structures/${id}`);U.toast('Inactive fee structure deleted');await load();}
        catch(x){U.toast(x.message||'Could not delete fee structure','error')}
        return;
      }
      try{
        const f=await Api.get(`/fee-structures/${id}`);
        const options=classes.map(c=>`<option value="${c.id}" ${String(c.id)===String(f.class_id)?'selected':''}>${U.esc(c.class_name)} · ${U.esc(c.batch)} · ${U.esc(c.subject)}</option>`).join('');
        const m=U.modal('Edit / Assign Fee Structure',`<form id="editFee" class="form">
          <div class="full"><label class="label">Course / Class *</label><select class="select" name="class_id" required><option value="">Select course / class</option>${options}</select><small class="muted">Changing this moves the fee structure to the selected course/class.</small></div>
          <div><label class="label">Monthly Fee *</label><input class="input" type="number" step="0.01" min="0.01" name="monthly_fee" value="${U.esc(f.monthly_fee)}" required></div>
          <div><label class="label">Effective From *</label><input class="input" type="date" name="effective_from" value="${U.esc(f.effective_from||'')}" required></div>
          <div><label class="label">Effective To</label><input class="input" type="date" name="effective_to" value="${U.esc(f.effective_to||'')}"></div>
          <div><label class="label">Status</label><select class="select" name="status"><option value="active" ${f.status==='active'?'selected':''}>Active</option><option value="inactive" ${f.status==='inactive'?'selected':''}>Inactive</option></select></div>
          <div class="full right"><button type="submit" class="btn primary">Save &amp; Assign</button></div>
        </form>`);
        m.querySelector('#editFee').onsubmit=async ev=>{
          ev.preventDefault();
          const btn=ev.currentTarget.querySelector('button[type="submit"]');
          const payload=formObj(ev.currentTarget);
          payload.class_id=Number(payload.class_id);
          payload.monthly_fee=Number(payload.monthly_fee);
          try{
            if(!Number.isInteger(payload.class_id)||payload.class_id<=0) throw Error('Please select a course/class');
            if(!Number.isFinite(payload.monthly_fee)||payload.monthly_fee<=0) throw Error('Please enter a valid monthly fee');
            if(payload.effective_to && payload.effective_to<payload.effective_from) throw Error('Effective To cannot be before Effective From');
            btn.disabled=true;
            await Api.put(`/fee-structures/${id}`,payload);
            m.remove();U.toast('Fee structure updated and assigned');await load();
          }catch(x){U.toast(x.message||'Could not update fee structure','error');btn.disabled=false;}
        };
      }catch(x){U.toast(x.message||'Could not load fee structure','error')}
    });

    await load();
  }

  async function allocationPage() {
    const [teachers, classes, subjects] = await Promise.all([Api.get('/teachers', { status: 'active' }), Api.get('/classes', { status: 'active', include_unassigned: '1' }), Api.get('/subjects')]);
    const teacherPicker = q('[data-choose-teachers]');
    const teacherSummary = q('[data-selected-teachers]');
    const coursePicker = q('[data-choose-courses]');
    const courseSummary = q('[data-selected-courses]');
    let selectedTeacherIds = new Set();
    let selectedClassIds = new Set();

    const renderTeacherSummary = () => {
      const selected = teachers.filter(t => selectedTeacherIds.has(Number(t.id)));
      if (teacherPicker) teacherPicker.textContent = selected.length ? `Choose Teachers (${selected.length})` : 'Choose Teachers';
      if (teacherSummary) teacherSummary.textContent = selected.length ? selected.map(t => t.name).join(', ') : '0 teachers selected';
    };

    const openTeacherPicker = () => {
      const html = `<div>
        <p class="muted" style="margin-top:0">Select one or multiple teachers for this course. You can change the selection before saving.</p>
        <div style="display:grid;gap:8px">
          ${teachers.map(t => `<label class="card" style="display:flex;align-items:center;gap:10px;padding:11px;cursor:pointer">
            <input type="checkbox" value="${t.id}" data-teacher-choice ${selectedTeacherIds.has(Number(t.id))?'checked':''}>
            <span><b>${U.esc(t.name)}</b><small class="muted" style="display:block">${U.esc(t.teacher_id)}</small></span>
          </label>`).join('') || '<div class="empty">No active teachers found.</div>'}
        </div>
        <div class="right" style="justify-content:flex-end;margin-top:14px">
          <button type="button" class="btn secondary" data-close>Cancel</button>
          <button type="button" class="btn primary" data-save-teachers>Use Selected Teachers</button>
        </div>
      </div>`;
      const m = U.modal('Choose Teachers', html);
      m.querySelector('[data-save-teachers]')?.addEventListener('click', () => {
        selectedTeacherIds = new Set([...m.querySelectorAll('[data-teacher-choice]:checked')].map(x => Number(x.value)));
        if (!selectedTeacherIds.size) { U.toast('Select at least one teacher', 'error'); return; }
        m.remove();
        renderTeacherSummary();
      });
    };

    const renderCourseSummary = () => {
      const selected = classes.filter(c => selectedClassIds.has(Number(c.id)));
      if (coursePicker) coursePicker.textContent = selected.length ? `Choose Courses (${selected.length})` : 'Choose Courses';
      if (courseSummary) courseSummary.textContent = selected.length ? selected.map(c => `${c.class_name} · ${c.batch}`).join(', ') : '0 courses selected';
      const single = q('[data-class]');
      if (single && selected.length) single.value = String(selected[0].id);
    };

    const openCoursePicker = () => {
      const html = `<div>
        <p class="muted" style="margin-top:0">Select one or multiple courses. The same teachers and selected time slots will be applied to every selected course.</p>
        <div style="display:grid;gap:8px;max-height:55vh;overflow:auto">
          ${classes.map(c => `<label class="card" style="display:flex;align-items:center;gap:10px;padding:11px;cursor:pointer">
            <input type="checkbox" value="${c.id}" data-course-choice ${selectedClassIds.has(Number(c.id))?'checked':''}>
            <span><b>${U.esc(c.class_name)}</b><small class="muted" style="display:block">${U.esc(c.batch)} · ${U.esc(c.subject)}${c.room ? ` · Room ${U.esc(c.room)}` : ''}</small></span>
          </label>`).join('') || '<div class="empty">No active courses found.</div>'}
        </div>
        <div class="right" style="justify-content:flex-end;margin-top:14px">
          <button type="button" class="btn secondary" data-close>Cancel</button>
          <button type="button" class="btn primary" data-save-courses>Use Selected Courses</button>
        </div>
      </div>`;
      const m = U.modal('Choose Courses', html);
      m.querySelector('[data-save-courses]')?.addEventListener('click', () => {
        selectedClassIds = new Set([...m.querySelectorAll('[data-course-choice]:checked')].map(x => Number(x.value)));
        if (!selectedClassIds.size) { U.toast('Select at least one course', 'error'); return; }
        m.remove();
        renderCourseSummary();
      });
    };

    coursePicker?.addEventListener('click', openCoursePicker);
    renderCourseSummary();

    teacherPicker?.addEventListener('click', openTeacherPicker);
    renderTeacherSummary();

    const allocationForm = q('form[data-allocation-form]');
    const dayTimeList = allocationForm?.querySelector('[data-day-time-list]');
    const dayNames = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

    const renderDayTimes = (preset = {}) => {
      if (!dayTimeList) return;
      const checked = [...allocationForm.querySelectorAll('[name="day_of_week_multi"]:checked')].map(x => Number(x.value));
      if (!checked.length) {
        dayTimeList.innerHTML = '<div class="empty" style="padding:10px">Select at least one day above.</div>';
        return;
      }
      dayTimeList.innerHTML = checked.map(day => {
        const raw = Array.isArray(preset[day]) ? preset[day] : (preset[day] ? [preset[day]] : [{}]);
        const slots = raw.length ? raw : [{}];
        return `<div class="card pad allocation-day-time-group" data-day-group="${day}" style="display:grid;gap:8px">
          <div class="right" style="justify-content:space-between;align-items:center">
            <div><b>${dayNames[day]}</b><div class="muted" style="font-size:11px">Add multiple recurring sessions on this day if needed.</div></div>
            <button type="button" class="btn secondary small" data-add-day-slot="${day}">＋ Add another time</button>
          </div>
          <div data-day-slots="${day}" style="display:grid;gap:8px">
            ${slots.map((slot,i) => `<div class="allocation-slot" data-slot-row="${day}" style="display:grid;grid-template-columns:minmax(120px,1fr) minmax(120px,1fr) auto;gap:8px;align-items:end">
              <div><label class="label">Start</label><input class="input" type="time" data-day-start="${day}" value="${U.esc(slot?.start || '')}" required></div>
              <div><label class="label">End</label><input class="input" type="time" data-day-end="${day}" value="${U.esc(slot?.end || '')}" required></div>
              <button type="button" class="btn danger small" data-remove-day-slot="${day}" ${slots.length===1?'disabled':''}>Remove</button>
            </div>`).join('')}
          </div>
        </div>`;
      }).join('');
    };

    const captureDayTimes = () => {
      const state = {};
      dayTimeList?.querySelectorAll('[data-day-slots]').forEach(group => {
        const day = Number(group.dataset.daySlots);
        state[day] = [...group.querySelectorAll('[data-slot-row]')].map(row => ({
          start: row.querySelector('[data-day-start]')?.value || '',
          end: row.querySelector('[data-day-end]')?.value || ''
        }));
      });
      return state;
    };

    allocationForm?.querySelectorAll('[name="day_of_week_multi"]').forEach(cb => cb.addEventListener('change', () => {
      renderDayTimes(captureDayTimes());
    }));

    dayTimeList?.addEventListener('click', e => {
      const addDay = e.target.closest('[data-add-day-slot]')?.dataset.addDaySlot;
      const removeDay = e.target.closest('[data-remove-day-slot]')?.dataset.removeDaySlot;
      if (addDay !== undefined) {
        const state = captureDayTimes();
        state[Number(addDay)] = [...(state[Number(addDay)] || []), {}];
        renderDayTimes(state);
        return;
      }
      if (removeDay !== undefined) {
        const state = captureDayTimes();
        const day = Number(removeDay);
        if ((state[day] || []).length > 1) state[day].pop();
        renderDayTimes(state);
      }
    });

    renderDayTimes();

    const courseManager = document.createElement('div');
    courseManager.className='card pad';
    courseManager.style.marginTop='16px';
    courseManager.innerHTML='<div class="right" style="justify-content:space-between;align-items:center"><div><h3 style="margin:0">Manage Courses</h3><p class="muted" style="margin:4px 0 0">Edit course name, subject, batch and room, or delete a created course.</p></div></div><div data-course-manager-list class="grid" style="margin-top:12px"></div>';
    q('[data-class-form]')?.closest('.grid')?.insertAdjacentElement('afterend',courseManager);
    const renderCourseManager=()=>{
      fill(courseManager.querySelector('[data-course-manager-list]'),classes.map(c=>`<div class="card pad" style="border:1px solid var(--border)"><b>${U.esc(c.class_name)} · ${U.esc(c.batch)}</b><div class="muted">${U.esc(c.subject)} · ${U.esc(c.room||'No room')}</div><div class="right" style="justify-content:flex-end;margin-top:8px"><button type="button" class="btn warning small" data-edit-course="${c.id}">Edit Course</button><button type="button" class="btn danger small" data-delete-course="${c.id}">Delete</button></div></div>`).join('')||'<div class="empty">No courses created yet.</div>');
    };
    renderCourseManager();

    /* New presentation-only weekly calendar. It reads the existing effective
       schedule endpoints and never changes allocation/reschedule semantics. */
    const calendarPanel=q('[data-schedule-calendar]');
    const listPanel=document.querySelector('.schedule-list-panel');
    let calendarWeek=(() => {
      const [y,m,d]=U.today().split('-').map(Number);
      const x=new Date(y,m-1,d); x.setDate(x.getDate()-x.getDay()+1);
      return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
    })();
    let calendarRows=[];
    let calendarChanges=[];
    const dateShift=(iso,delta)=>{
      const [y,m,d]=iso.split('-').map(Number), x=new Date(y,m-1,d);
      x.setDate(x.getDate()+delta);
      return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
    };
    const prettyWeek=(ws)=>`${U.date(ws)} – ${U.date(dateShift(ws,6))}`;
    const classMap=new Map(classes.map(c=>[Number(c.id),c]));
    const teacherMap=new Map(teachers.map(t=>[Number(t.id),t]));

    const renderCalendar=()=>{
      const body=q('[data-schedule-calendar-body]'); if(!body)return;
      const course=String(q('[data-calendar-course]')?.value||'');
      const teacher=String(q('[data-calendar-teacher]')?.value||'');
      const filtered=calendarRows.filter(r=>
        (!course || String(r.class_id)===course) &&
        (!teacher || String(r.teacher_id)===teacher)
      );
      const byDay=Array.from({length:7},()=>[]);
      filtered.forEach(r=>{const [y,m,d]=r.date.split('-').map(Number);const start=new Date(y,m-1,d);const day=(start.getDay()+6)%7;byDay[day].push(r);});
      const dayNames=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      const today=U.today();
      body.innerHTML=`<div class="schedule-week-grid">${dayNames.map((label,i)=>`
        <div class="schedule-day-column ${dateShift(calendarWeek,i)===today?'today':''}">
          <div class="schedule-day-head"><b>${label}</b><small>${U.date(dateShift(calendarWeek,i)).slice(0,5)}</small></div>
          <div class="schedule-day-items">${byDay[i].length?byDay[i].map(r=>{
            const isToday=r.date===today;
            let status='scheduled';
            if(isToday){
              const now=new Date();
              const [sh,sm]=r.start_time.split(':').map(Number),[eh,em]=r.end_time.split(':').map(Number);
              const st=new Date(),et=new Date();st.setHours(sh,sm,0,0);et.setHours(eh,em,0,0);
              if(now>et)status='completed'; else if(now>=st&&now<=et)status='ongoing';
            }
            return `<button type="button" class="calendar-class-item" data-calendar-class="${U.esc(r.class_id)}" data-calendar-allocation="${U.esc(r.allocation_id ?? '')}" data-calendar-date="${U.esc(r.date)}">
              <span class="calendar-class-time">${U.esc(U.time(r.start_time))}<small>${U.esc(U.time(r.end_time))}</small></span>
              <span class="calendar-class-copy"><b>${U.esc(r.subject||'')}</b><small>${U.esc(r.class_name||'')} · ${U.esc(r.teacher_name||'Unassigned')}</small></span>
              <span class="badge ${status}">${status.toUpperCase()}</span>
            </button>`;
          }).join(''):'<div class="calendar-empty">No classes</div>'}</div>
        </div>`).join('')}</div>`;
    };
    const renderChanges=()=>{
      const body=q('[data-schedule-calendar-body]'); if(!body)return;
      const labels={delete:'Cancelled',weekly_time:'Changed this week',extra:'Extra class',reschedule:'Rescheduled'};
      body.innerHTML=calendarChanges.length?`<div class="schedule-changes-list">${calendarChanges.map(x=>{
        const c=classMap.get(Number(x.class_id)); const t=teacherMap.get(Number(x.teacher_id));
        return `<div class="schedule-change-row"><div class="schedule-change-icon">${x.kind==='delete'?'✕':x.kind==='extra'?'＋':'↔'}</div><div><b>${U.esc(c?.class_name||'Course')}</b><small>${U.esc(c?.subject||'')} · ${U.esc(c?.batch||'')}</small><small>${U.esc(labels[x.kind]||x.kind)}${x.schedule_date?` · ${U.date(x.schedule_date)}`:''}${x.target_date?` → ${U.date(x.target_date)}`:''}${x.start_time?` · ${U.esc(U.time(x.start_time))}–${U.esc(U.time(x.end_time||''))}`:''}${t?` · ${U.esc(t.name)}`:''}</small></div></div>`;
      }).join('')}</div>`:'<div class="empty-card"><b>No schedule changes</b><span>There are no exceptions for this week.</span></div>';
    };
    const loadCalendar=async()=>{
      if(!calendarPanel)return;
      q('[data-week-label]') && (q('[data-week-label]').textContent=prettyWeek(calendarWeek));
      try{
        const packs=await Promise.all(classes.map(async c=>{
          const [schedule,changes]=await Promise.all([
            Api.get(`/classes/${c.id}/schedule-week`,{week_start:calendarWeek}),
            Api.get('/schedule-exceptions',{class_id:c.id,week_start:calendarWeek})
          ]);
          return {c,schedule:schedule||[],changes:changes||[]};
        }));
        calendarRows=packs.flatMap(({c,schedule})=>schedule.map(r=>({...r,class_id:c.id,class_name:c.class_name,batch:c.batch,subject:c.subject,room:c.room})));
        calendarChanges=packs.flatMap(({c,changes})=>changes.map(x=>({...x,class_id:c.id})));
        renderCalendar();
      }catch(error){
        fill(q('[data-schedule-calendar-body]'),`<div class="empty-card"><b>Calendar unavailable</b><span>${U.esc(error.message||'Could not load the weekly schedule.')}</span></div>`);
      }
    };
    const setCalendarView=(view)=>{
      calendarPanel?.querySelectorAll('[data-schedule-view]').forEach(b=>b.classList.toggle('active',b.dataset.scheduleView===view));
      if(listPanel)listPanel.style.display=view==='list'?'block':'none';
      const body=q('[data-schedule-calendar-body]');
      if(body)body.style.display=view==='list'?'none':'block';
      if(view==='changes')renderChanges();
      else if(view==='calendar')renderCalendar();
    };
    calendarPanel?.querySelector('[data-calendar-course]')?.replaceChildren(new Option('All courses',''),...classes.map(c=>new Option(`${c.class_name} · ${c.batch}`,c.id)));
    calendarPanel?.querySelector('[data-calendar-teacher]')?.replaceChildren(new Option('All teachers',''),...teachers.map(t=>new Option(`${t.name} · ${t.teacher_id}`,t.id)));
    calendarPanel?.querySelector('[data-week-prev]')?.addEventListener('click',()=>{calendarWeek=dateShift(calendarWeek,-7);loadCalendar()});
    calendarPanel?.querySelector('[data-week-next]')?.addEventListener('click',()=>{calendarWeek=dateShift(calendarWeek,7);loadCalendar()});
    calendarPanel?.querySelector('[data-week-today]')?.addEventListener('click',()=>{calendarWeek=(()=>{const [y,m,d]=U.today().split('-').map(Number),x=new Date(y,m-1,d);x.setDate(x.getDate()-x.getDay()+1);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`})();loadCalendar()});
    calendarPanel?.querySelector('[data-calendar-course]')?.addEventListener('change',renderCalendar);
    calendarPanel?.querySelector('[data-calendar-teacher]')?.addEventListener('change',renderCalendar);
    calendarPanel?.querySelectorAll('[data-schedule-view]').forEach(btn=>btn.addEventListener('click',()=>setCalendarView(btn.dataset.scheduleView)));
    const openAllocationDetails=async(row)=>{
      if(!row || row.allocation_id==null) return;
      const c=classMap.get(Number(row.class_id));
      if(!c)return;
      const allocation=(c.allocations||[]).find(a=>Number(a.allocation_id)===Number(row.allocation_id));
      const dayNameFull=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
      const exactDate=row.date;
      const exactDay=dayNameFull[Number(row.day_of_week)] || dayNameFull[(new Date(`${exactDate}T00:00:00`).getDay()+6)%7];
      const dateText=U.date(exactDate);
      const weekly=(c.allocations||[]).map(a=>`
        <div class="profile-list-row">
          <div><b>${U.esc(a.teacher_name||'Unassigned')}</b><small>${U.esc(a.day)}</small></div>
          <span>${U.esc(U.time(a.start_time))}–${U.esc(U.time(a.end_time))}</span>
        </div>`).join('') || '<div class="empty-card"><b>No allocation</b><span>No active weekly allocation exists for this course.</span></div>';

      const m=U.modal(`${U.esc(c.class_name)} · Schedule`,`
        <div class="profile-card">
          <div class="profile-kicker">${U.esc(c.subject||'Course')}</div>
          <h2 style="margin:4px 0">${U.esc(c.class_name)}</h2>
          <p class="muted">${U.esc(c.batch||'')}${c.room?` · Room ${U.esc(c.room)}`:''}</p>
          <div class="detail-grid">
            <div><small>Course</small><b>${U.esc(c.class_name)}</b></div>
            <div><small>Batch</small><b>${U.esc(c.batch||'—')}</b></div>
            <div><small>Exact date</small><b>${U.esc(dateText)}</b></div>
            <div><small>Day</small><b>${U.esc(exactDay)}</b></div>
            <div><small>Start time</small><b>${U.esc(U.time(row.start_time))}</b></div>
            <div><small>End time</small><b>${U.esc(U.time(row.end_time))}</b></div>
            <div><small>Teacher</small><b>${U.esc(row.teacher_name||'Unassigned')}</b></div>
            <div><small>Room</small><b>${U.esc(row.room||'Not set')}</b></div>
          </div>
        </div>
        <div class="profile-card">
          <h3>Existing weekly allocations</h3>
          ${weekly}
        </div>
        <div class="right" style="justify-content:flex-end;gap:8px">
          <button type="button" class="btn danger" data-calendar-delete-allocation="${U.esc(row.allocation_id)}">Delete allocation</button>
          <button type="button" class="btn primary" data-calendar-edit-allocation="${U.esc(row.allocation_id)}">Edit Schedule</button>
        </div>`);

      m.querySelector('[data-calendar-delete-allocation]')?.addEventListener('click',()=>{
        U.confirm('Delete allocation?',`Delete the recurring ${U.esc(c.class_name)} allocation for ${U.esc(row.teacher_name||'this teacher')} on ${U.esc(exactDay)} at ${U.esc(U.time(row.start_time))}–${U.esc(U.time(row.end_time))}? This does not delete the course or students.`,async()=>{
          try{
            await Api.del(`/teacher-classes/${row.allocation_id}`);
            m.remove();
            U.toast('Allocation deleted');
            await loadCalendar();
            await load();
          }catch(x){U.toast(x.message||'Could not delete allocation','error')}
        });
      });
      m.querySelector('[data-calendar-edit-allocation]')?.addEventListener('click',()=>{
        m.remove();
        location.href=`teacher-classes.html?edit_allocation=${encodeURIComponent(row.allocation_id)}`;
      });
    };

    calendarPanel?.querySelector('[data-schedule-calendar-body]')?.addEventListener('click',async e=>{
      const btn=e.target.closest('[data-calendar-class]'); if(!btn)return;
      const allocationId=btn.dataset.calendarAllocation;
      const row=calendarRows.find(x=>String(x.allocation_id)===String(allocationId) && x.date===btn.dataset.calendarDate);
      if(row){await openAllocationDetails(row);return;}
      const c=classMap.get(Number(btn.dataset.calendarClass)); if(!c)return;
      U.modal(`${U.esc(c.subject||'Course')} · ${U.esc(c.class_name)}`,`<div class="profile-card"><div class="profile-kicker">${U.esc(c.subject||'Course')}</div><h2 style="margin:4px 0">${U.esc(c.class_name)}</h2><p class="muted">${U.esc(c.batch)}${c.room?` · ${U.esc(c.room)}`:''}</p><div class="detail-grid"><div><small>Students</small><b>${U.esc(c.student_count||0)} / ${U.esc(c.max_students||'—')}</b></div><div><small>Teachers</small><b>${U.esc(new Set((c.allocations||[]).map(a=>a.teacher_id)).size)}</b></div></div></div><div class="profile-card"><h3>Weekly allocation</h3>${(c.allocations||[]).map(a=>`<div class="profile-list-row"><div><b>${U.esc(a.teacher_name||'Unassigned')}</b><small>${U.esc(a.day)}</small></div><span>${U.esc(a.start_time)}–${U.esc(a.end_time)}</span></div>`).join('')||'<div class="empty-card"><b>No allocation</b><span>No active teacher allocation exists for this course.</span></div>'}</div>`);
    });
    setCalendarView('calendar');
    loadCalendar();

    courseManager.addEventListener('click',async e=>{
      const edit=e.target.closest('[data-edit-course]')?.dataset.editCourse;
      const del=e.target.closest('[data-delete-course]')?.dataset.deleteCourse;
      if(del){return adminVerifiedAction('Delete course','This permanently removes the course and its allocations, student assignments, fee structures and course records.',async()=>{await Api.del(`/classes/${del}`);U.toast('Course deleted');location.reload();});}
      if(!edit)return;
      const c=classes.find(x=>String(x.id)===String(edit)); if(!c)return;
      const m=U.modal('Edit Course',`<form class="form" id="editCourseForm">
        <div><label class="label">Course Name</label><input class="input" name="class_name" value="${U.esc(c.class_name)}" required></div>
        <div><label class="label">Batch</label><input class="input" name="batch" value="${U.esc(c.batch)}" required></div>
        <div><label class="label">Subject Name</label><input class="input" name="subject_name" value="${U.esc(c.subject)}" required></div>
        <div><label class="label">Room</label><input class="input" name="room" value="${U.esc(c.room||'')}"></div>
        <div><label class="label">Max Students</label><input class="input" type="number" min="1" name="max_students" value="${U.esc(c.max_students)}" required></div>
        <div class="full right"><button type="button" class="btn secondary" data-close>Cancel</button><button class="btn primary" type="submit">Save Course</button></div>
      </form>`);
      m.querySelector('#editCourseForm').onsubmit=async ev=>{ev.preventDefault();const btn=ev.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;try{await Api.put(`/classes/${edit}`,formObj(ev.currentTarget));m.remove();U.toast('Course updated');location.reload();}catch(x){U.toast(x.message||'Could not update course','error');btn.disabled=false;}};
    });

    fill(q('[data-class]'), classes.map((c) => `<option value="${c.id}">${U.esc(c.class_name)} · ${U.esc(c.batch)} · ${U.esc(c.subject)}</option>`).join(''));
    const classForm = q('form[data-class-form]');
    classForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const button = classForm.querySelector('button[type="submit"]');
      try {
        const payload = formObj(classForm);
        const typed = String(payload.subject_name || '').trim().replace(/\s+/g, ' ');
        delete payload.subject_name;
        if (!typed) throw Error('Please enter a subject name');
        const existing = subjects.find((s) => String(s.name || '').trim().toLowerCase() === typed.toLowerCase());
        let subjectId = existing?.id;
        if (!subjectId) {
          const created = await Api.post('/subjects', { name: typed });
          subjectId = created.id;
          subjects.push(created);
        }
        payload.subject_id = Number(subjectId);
        if (!Number.isInteger(payload.subject_id) || payload.subject_id <= 0) throw Error('Could not create/find the subject');
        button && (button.disabled = true);
        await Api.post('/classes', payload);
        U.toast('Class created');
        classForm.reset();
        location.reload();
      } catch (x) { U.toast(x.message || 'Could not create class', 'error'); }
      finally { button && (button.disabled = false); }
    });

    const form = q('form[data-allocation-form]');
    const body = q('[data-body]');
    const load = async () => {
      const rows = await Api.get('/classes', { status: 'active' });
      const seen = new Set();
      const html = rows.flatMap((c) => (c.allocations || []).map((a) => {
        const firstForClass = !seen.has(c.id); seen.add(c.id);
        return `<tr><td>${U.esc(c.class_name)}</td><td>${U.esc(c.batch)}</td><td>${U.esc(c.subject)}</td><td>${U.esc(a.teacher_name || '')}</td><td>${U.esc(a.day)}</td><td>${U.esc(a.start_time)}–${U.esc(a.end_time)}</td><td>${U.esc(a.room || '')}</td><td><button class="btn warning small" data-edit-allocation="${a.allocation_id}" data-teacher="${a.teacher_pk || ''}" data-day="${a.day_of_week}" data-start="${a.start_time}" data-end="${a.end_time}" data-class-id="${c.id}">Edit</button> <button class="btn danger small" data-del="${a.allocation_id}">Deactivate allocation</button>${firstForClass?` <button class="btn danger small" data-delete-class="${c.id}">Delete class</button>`:''}</td></tr>`;
      })).join('');
      fill(body, html || tableEmpty(8));
    };

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const id = form.dataset.editId;
        const days = [...form.querySelectorAll('[name="day_of_week_multi"]:checked')].map(x => Number(x.value));
        if (!selectedTeacherIds.size) throw Error('Choose at least one teacher');
        if (!id && !selectedClassIds.size) throw Error('Choose at least one course');
        if (!days.length) throw Error('Select at least one day');

        const daySchedules = [];
        for (const day of days) {
          const group = dayTimeList?.querySelector(`[data-day-slots="${day}"]`);
          const starts = [...(group?.querySelectorAll('[data-day-start]') || [])];
          const ends = [...(group?.querySelectorAll('[data-day-end]') || [])];
          starts.forEach((input,i) => {
            daySchedules.push({
              day,
              start_time: input.value || '',
              end_time: ends[i]?.value || ''
            });
          });
        }
        if (!daySchedules.length || daySchedules.some(x => !x.start_time || !x.end_time || x.start_time >= x.end_time)) {
          throw Error('Enter a valid start and end time for every selected session');
        }

        if (!id) {
          const payload = formObj(form);
          payload.teacher_ids = [...selectedTeacherIds];
          payload.class_ids = [...selectedClassIds];
          payload.day_schedules = daySchedules;
          delete payload.teacher_id; delete payload.start_time; delete payload.end_time;
          delete payload.class_id;
          delete payload.day_of_week_multi; delete payload.day_of_week;
          await Api.post('/teacher-classes', payload);
          U.toast(`${selectedClassIds.size} course${selectedClassIds.size===1?'':'s'} assigned to ${selectedTeacherIds.size} teacher${selectedTeacherIds.size===1?'':'s'}`);
        } else {
          // Editing remains one recurring allocation at a time.
          const payload = {
            teacher_id: Number([...selectedTeacherIds][0]),
            class_id: Number(form.querySelector('[name="class_id"]').value),
            day_of_week: daySchedules[0].day,
            start_time: daySchedules[0].start_time,
            end_time: daySchedules[0].end_time
          };
          await Api.put(`/teacher-classes/${id}`, payload);
          delete form.dataset.editId;
          form.querySelector('button[type="submit"]').textContent='Allocate class';
          U.toast('Allocation updated');
        }
        selectedTeacherIds = new Set();
        selectedClassIds = new Set();
        renderTeacherSummary();
        renderCourseSummary();
        form.reset();
        renderDayTimes();
        await load();
      } catch (x) { U.toast(x.message || 'Could not save allocation', 'error'); }
    });

    const beginAllocationEdit=(a,classId)=>{
      if(!a || !a.allocation_id)return;
      const teacherPk=a.teacher_pk || a.teacher_db_id || a.teacher_id;
      const teacherId=Number(teacherPk);
      if(!Number.isFinite(teacherId) || teacherId<=0) return U.toast('Could not identify the teacher for this allocation','error');
      selectedTeacherIds = new Set([teacherId]);
      renderTeacherSummary();
      selectedClassIds = new Set([Number(classId)]);
      renderCourseSummary();
      q('[data-class]').value = String(classId);
      q('[name="day_of_week"]').value = String(a.day_of_week);
      form.querySelectorAll('[name="day_of_week_multi"]').forEach(cb=>cb.checked=Number(cb.value)===Number(a.day_of_week));
      renderDayTimes({[Number(a.day_of_week)]: {start:a.start_time, end:a.end_time}});
      form.dataset.editId = String(a.allocation_id);
      form.querySelector('button[type="submit"]').textContent = 'Update allocation';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const heading=form.closest('.card')?.querySelector('h3');
      if(heading) heading.textContent='Edit Schedule';
    };

    body?.addEventListener('click', async (e) => {
      const del = e.target.dataset.del; const edit = e.target.dataset.editAllocation; const deleteClass = e.target.dataset.deleteClass;
      if (deleteClass) return adminVerifiedAction('Delete class','This permanently removes the class, its allocations, fee structures, homework, classwork and attendance. It will no longer appear anywhere on the website.',async()=>{await Api.del(`/classes/${deleteClass}`);U.toast('Class deleted permanently');load();});
      if (del) { await Api.del(`/teacher-classes/${del}`); U.toast('Allocation deactivated'); load(); return; }
      if (edit) {
        beginAllocationEdit({
          allocation_id: edit,
          teacher_pk: e.target.dataset.teacher,
          day_of_week: Number(e.target.dataset.day),
          start_time: e.target.dataset.start,
          end_time: e.target.dataset.end
        }, e.target.dataset.classId);
      }
    });

    await load();

    const requestedAllocationId=new URLSearchParams(location.search).get('edit_allocation');
    if(requestedAllocationId){
      try{
        const allocationId=Number(requestedAllocationId);
        const rows=await Api.get('/classes',{status:'active'});
        let found=null, foundClassId=null;
        for(const c of (rows||[])){
          const a=(c.allocations||[]).find(x=>Number(x.allocation_id)===allocationId);
          if(a){found=a;foundClassId=c.id;break;}
        }
        if(found){
          beginAllocationEdit(found,foundClassId);
          U.toast('Schedule loaded for editing');
        }else{
          U.toast('Allocation not found or already deleted','error');
        }
      }catch(x){U.toast(x.message||'Could not load the requested schedule','error');}
    }
  }

  async function feePayment() {
    const allStudents = await Api.get('/students', { status: 'active' });
    const studentSelect = q('[data-student]');
    const search = q('[data-student-search]');
    const filter = q('[data-fee-filter]');
    const monthInput = q('[name="month"]');
    const amountInput = q('[name="amount"]');
    const params = new URLSearchParams(location.search);
    if (filter && params.get('filter') === 'due') filter.value = 'due';
    const requestedStudent = params.get('student');

    let currentFeeData=null;
    const feeSummary = async () => {
      try {
        const d = await Api.get('/admin/dashboard');
        const map = {collected:d.this_month_collection, pending:d.pending_fees, partial:d.partial_fees, fine:d.fine};
        const nodes = {
          collected:q('[data-fee-summary-collected]'), pending:q('[data-fee-summary-pending]'),
          partial:q('[data-fee-summary-partial]'), fine:q('[data-fee-summary-fine]')
        };
        nodes.collected && (nodes.collected.textContent=U.money(map.collected||0));
        nodes.pending && (nodes.pending.textContent=U.money(map.pending||0));
        nodes.partial && (nodes.partial.textContent=U.money(map.partial||0));
        nodes.fine && (nodes.fine.textContent=U.money(map.fine||0));
      } catch (_) {}
    };
    feeSummary();
    const renderStudents = () => {
      const term = String(search?.value || '').trim().toLowerCase();
      const mode = filter?.value || 'all';
      const students = allStudents.filter((s) => {
        const text = [s.student_id, s.name, s.phone, s.parent?.name, s.parent?.phone].filter(Boolean).join(' ').toLowerCase();
        const matchesSearch = !term || text.includes(term);
        const status = String(s.current_month_status || '').toUpperCase();
        const matchesFilter = mode === 'all' || (mode === 'due' && (status === 'DUE' || status === 'PARTIAL')) || (mode === 'paid' && status === 'PAID');
        return matchesSearch && matchesFilter;
      });
      const previous = studentSelect?.value;
      fill(studentSelect, students.map((st) => `<option value="${st.id}">${U.esc(st.student_id)} · ${U.esc(st.name)} · ${U.esc(st.current_month_status || 'N/A')}</option>`).join('') || '<option value="">No students found</option>');
      if (students.some((st) => String(st.id) === String(previous))) studentSelect.value = previous;
      else if (students.length) studentSelect.value = String(students[0].id);
      load();
    };

    const load = async () => {
      if (!studentSelect?.value) { currentFeeData=null; fill(q('[data-history]'), '<div class="empty">No student selected.</div>'); if(monthInput) monthInput.value=''; if(amountInput) amountInput.value=''; return; }
      const d = await Api.get(`/fees/student/${studentSelect.value}`); currentFeeData=d;
      fill(q('[data-history]'), `<div class="fee-timeline">${(d.history || []).map((h) => `<div class="fee-timeline-item ${String(h.status||'').toLowerCase()}"><div class="fee-timeline-marker">${h.status === 'PAID' ? '✓' : h.status === 'PARTIAL' ? '◐' : '!'}</div><div class="fee-timeline-main"><div class="fee-timeline-head"><b>${U.esc(h.month_label)}</b><span class="badge ${h.status === 'PAID' ? 'paid' : h.status === 'PARTIAL' ? 'partial' : h.status === 'DUE' ? 'due' : 'inactive'}">${U.esc(h.status)}</span></div><div class="fee-timeline-amounts"><span>Due <b>${U.money(h.amount)}</b></span><span>Paid <b>${U.money(h.paid_amount)}</b></span><span>Remaining <b>${U.money(h.due_amount)}</b></span></div>${h.payment_date?`<small>Last payment: ${U.esc(U.datetime(h.payment_date))}${h.receipt_number?` · Receipt ${U.esc(h.receipt_number)}`:''}</small>`:''}<button type="button" class="btn secondary small fee-detail-btn" data-fee-detail="${U.esc(h.month)}">View fee calculation</button></div></div>`).join('') || '<div class="empty-card"><b>No fee history</b><span>No fee records are available for this student.</span></div>'}</div>`);
      if(monthInput){monthInput.value=d.oldest_due_month || U.today().slice(0,7);monthInput.readOnly=true;monthInput.title=d.oldest_due_month?'Oldest due month is selected automatically':'No unpaid month is due; current month is selected.';}
      if(amountInput) { amountInput.value=d.oldest_due_amount>0?d.oldest_due_amount:''; amountInput.min='0.01'; amountInput.max=d.oldest_due_amount>0?String(d.oldest_due_amount):'0'; amountInput.title=`Maximum ₹${Number(d.oldest_due_amount||0).toFixed(2)} (remaining balance for the selected month). Partial payments are allowed.`; }
    };

    q('[data-history]')?.addEventListener('click',(e)=>{
      const btn=e.target.closest('[data-fee-detail]');
      if(!btn || !currentFeeData) return;
      const h=(currentFeeData.history||[]).find(x=>x.month===btn.dataset.feeDetail);
      if(!h)return;
      const fine=Math.max(0,Number(h.fine_amount ?? Number(h.amount)-Number(h.base_fee||0)));
      const cycles=Number(h.fine_cycles ?? (fine/50));
      U.modal(`Fee calculation · ${h.month_label}`,`<div class="card pad">
        <p><b>Base monthly fee:</b> ${U.money(h.base_fee)}</p>
        <p><b>Fine rule:</b> ₹50 is added on each applicable 15th while the month's balance remains outstanding.</p>
        <p><b>Applicable fine cycles:</b> ${cycles}</p>
        <p><b>Fine:</b> ${U.money(fine)}</p>
        <hr style="border:0;border-top:1px solid var(--border)">
        <p><b>Total for ${U.esc(h.month_label)} including fine:</b> ${U.money(h.amount)}</p>
        <p><b>Already paid:</b> ${U.money(h.paid_amount)}</p>
        <p><b>Remaining:</b> ${U.money(h.due_amount)}</p>
      </div>`);
    });
    studentSelect?.addEventListener('change', load);
    search?.addEventListener('input', U.debounce(renderStudents, 200));
    filter?.addEventListener('change', renderStudents);
    q('form[data-fee-payment]')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        if(!studentSelect.value) throw Error('Select a student first');
        const body = formObj(e.currentTarget);
        body.student_id = Number(studentSelect.value);
        body.month = currentFeeData?.oldest_due_month || U.today().slice(0,7);
        body.amount = Number(amountInput.value);
        const btn=e.currentTarget.querySelector('button[type="submit"]') || e.currentTarget.querySelector('button'); if(btn) btn.disabled=true;
        const r = await Api.post('/fees/payment', body);
        U.toast('Fee payment recorded');
        const receiptModal=await showReceipt(r.receipt,false);
        if(receiptModal) receiptModal.addEventListener('click',(ev)=>{ if(ev.target===receiptModal || ev.target.closest('[data-close]')) setTimeout(()=>location.reload(),50); },{once:true});
        await load();
      } catch (x) { U.toast(x.message, 'error'); }
      finally { const btn=e.currentTarget.querySelector('button[type="submit"]') || e.currentTarget.querySelector('button'); if(btn)btn.disabled=false; }
    });

    if (requestedStudent) {
      const match = allStudents.find(s => String(s.student_id).toLowerCase() === String(requestedStudent).toLowerCase() || String(s.id) === String(requestedStudent));
      if (match && search) search.value = match.name;
    }
    renderStudents();
  }

  function receiptMarkup(r) {
    return `<div class="receipt-doc" data-receipt-capture style="border:1px solid #d6dde6;border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 8px 24px rgba(15,23,42,.08)">
      <div style="padding:22px 26px;background:#0f3d5e;color:#fff;display:flex;justify-content:space-between;gap:20px;align-items:center"><div style="display:flex;gap:14px;align-items:center"><img crossorigin="anonymous" src="${U.photoUrl('/asset/image.jpeg')}" style="width:54px;height:54px;border-radius:10px;background:#fff;padding:4px;object-fit:contain"><div><div style="font-size:22px;font-weight:800;letter-spacing:.02em">RMCTI</div><div style="font-size:12px;opacity:.86">Ratna's Modern Computer Training Institute</div></div></div><div style="text-align:right"><div style="font-size:11px;opacity:.78;text-transform:uppercase;letter-spacing:.1em">Official Fee Receipt</div><div style="font-size:18px;font-weight:800;margin-top:4px">${U.esc(r.receipt_number)}</div></div></div>
      <div style="padding:24px 26px"><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 28px"><div><div class="muted" style="font-size:11px;text-transform:uppercase">Student</div><div style="font-weight:800;font-size:17px;margin-top:5px">${U.esc(r.student)}</div><div class="muted" style="margin-top:3px">${U.esc(r.student_id)}</div></div><div><div class="muted" style="font-size:11px;text-transform:uppercase">Course</div><div style="font-weight:700;margin-top:5px">${U.esc(r.class||'—')}</div>${r.teacher?`<div class="muted" style="margin-top:3px">Teacher: ${U.esc(r.teacher)}</div>`:''}</div><div><div class="muted" style="font-size:11px;text-transform:uppercase">Fee Month</div><div style="font-weight:700;margin-top:5px">${U.esc(r.fee_month)}</div></div><div><div class="muted" style="font-size:11px;text-transform:uppercase">Payment Date</div><div style="font-weight:700;margin-top:5px">${U.datetime(r.payment_date)}</div></div></div>
      <div style="margin:24px 0;border-top:1px solid #e2e8f0"></div><div style="display:flex;justify-content:space-between;align-items:flex-end;gap:20px"><div><div class="muted" style="font-size:11px;text-transform:uppercase">Payment Method</div><div style="font-weight:700;margin-top:5px;text-transform:capitalize">${U.esc(String(r.payment_method||'').replace('_',' '))}</div></div><div style="display:grid;grid-template-columns:repeat(2,minmax(120px,1fr));gap:18px;text-align:right"><div><div class="muted" style="font-size:11px;text-transform:uppercase">Amount Paid</div><div style="font-size:26px;font-weight:900;margin-top:2px;color:#0f3d5e">${U.money(r.amount)}</div></div><div><div class="muted" style="font-size:11px;text-transform:uppercase">Total Remaining Due</div><div style="font-size:22px;font-weight:900;margin-top:4px;color:#b45309">${U.money(r.remaining||0)}</div></div></div></div>
      <div style="margin-top:28px;padding-top:14px;border-top:1px dashed #cbd5e1;display:flex;justify-content:space-between;gap:20px;font-size:11px;color:#64748b"><span>Collected by: ${U.esc(r.collected_by||'Admin')}</span><span>System generated receipt</span></div></div></div>`;
  }

  async function showReceipt(r, openPrint=false) {
    const m=U.modal('Fee Receipt', `<div class="receipt-preview-wrap">${receiptMarkup(r)}</div><div class="right" style="justify-content:flex-end;margin-top:14px"><button type="button" class="btn secondary" data-download-receipt>Download JPEG</button><button type="button" class="btn primary" data-print-receipt>Print</button></div>`);
    const capture=m.querySelector('[data-receipt-capture]');
    m.querySelector('[data-download-receipt]')?.addEventListener('click',async ev=>{try{ev.currentTarget.disabled=true;await U.downloadElementAsJpeg(capture,`${r.receipt_number}.jpg`);U.toast('Receipt JPEG downloaded')}catch(e){console.error(e);U.toast('Could not create receipt JPEG','error')}finally{ev.currentTarget.disabled=false;}});
    m.querySelector('[data-print-receipt]')?.addEventListener('click',()=>U.openPrintWindow(`RMCTI Receipt ${r.receipt_number}`,receiptMarkup(r)));
    if(openPrint) m.querySelector('[data-print-receipt]')?.click();
    return m;
  }

  async function reportsPage() {
    const monthInput = q('[data-report-month]');
    const summary = q('[data-report-summary]');
    const attendanceBody = q('[data-report-attendance]');
    const teacherBody = q('[data-report-teachers]');
    const monthLabel = q('[data-report-month-label]');

    const render = async () => {
      const month = monthInput?.value || U.today().slice(0, 7);
      try {
        [summary, attendanceBody, teacherBody].forEach((el) => { if (el) el.innerHTML = '<div class="loading">Loading…</div>'; });
        const d = await Api.get('/admin/reports/summary', { month });
        const f = d.fees || {};
        if (monthLabel) {
          const dt = new Date(`${month}-01T00:00:00`);
          monthLabel.textContent = dt.toLocaleDateString('en-IN', {month:'long', year:'numeric'});
        }
        fill(summary, `
          <div class="report-kpi"><span>Collected</span><strong>${U.money(f.collected)}</strong></div>
          <div class="report-kpi"><span>Pending</span><strong>${U.money(f.pending)}</strong></div>
          <div class="report-kpi"><span>Partial</span><strong>${U.money(f.partial_balance)}</strong></div>
          <div class="report-kpi"><span>Fine</span><strong>${U.money(f.fine)}</strong></div>
          <div class="report-kpi"><span>Students paid</span><strong>${f.paid_students || 0}</strong></div>
          <div class="report-kpi"><span>Students pending</span><strong>${f.pending_students || 0}</strong></div>
        `);
        fill(attendanceBody, (d.attendance || []).map(x => `<tr><td>${U.esc(x.subject)}</td><td>${U.esc(x.class_name)} · ${U.esc(x.batch)}</td><td>${x.present}</td><td>${x.absent}</td><td><span class="badge ${x.attendance_percent>=80?'paid':'pending'}">${x.attendance_percent}%</span></td></tr>`).join('') || tableEmpty(5, 'No attendance records for this month.'));
        fill(teacherBody, (d.teacher_workload || []).map(x => `<tr><td>${U.esc(x.teacher_id)}</td><td>${U.esc(x.name)}</td><td>${x.classes}</td></tr>`).join('') || tableEmpty(3, 'No active teachers found.'));
        return d;
      } catch (e) {
        U.toast(e.message || 'Could not load report', 'error');
        fill(summary, '<div class="empty-card"><b>Report unavailable</b><span>Try another month or refresh the page.</span></div>');
        return null;
      }
    };

    const toCsv = (headers, rows) => {
      const escCsv = (v) => `"${String(v ?? '').replaceAll('"','""')}"`;
      return [headers, ...rows].map(row => row.map(escCsv).join(',')).join('\n');
    };
    const download = (name, text, mime='text/csv;charset=utf-8') => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], {type:mime}));
      a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 500);
    };

    let latest = await render();
    monthInput?.addEventListener('change', () => { render().then(x => { latest=x; }); });
    q('[data-report-export-csv]')?.addEventListener('click', () => {
      if (!latest) return U.toast('Load the report first', 'warning');
      const m=latest.month;
      const rows=[
        ['Section','Metric','Value'],
        ['Fees','Collected',latest.fees.collected],['Fees','Pending',latest.fees.pending],['Fees','Partial',latest.fees.partial_balance],['Fees','Fine',latest.fees.fine],
        ...latest.attendance.map(x=>['Attendance',x.subject,`${x.attendance_percent}%`]),
        ...latest.teacher_workload.map(x=>['Teacher workload',x.name,x.classes])
      ];
      download(`rmcti-report-${m}.csv`, toCsv(rows.shift(), rows));
      U.toast('CSV report exported');
    });
    q('[data-report-print]')?.addEventListener('click', () => window.print());
  }

  async function analyticsPage() {
    const collections = q('[data-analytics-collection]');
    const growth = q('[data-analytics-growth]');
    const attendance = q('[data-analytics-attendance]');
    try {
      const d = await Api.get('/admin/analytics');
      const maxC = Math.max(...(d.collection || [0]), 1);
      const maxG = Math.max(...(d.student_growth || [0]), 1);
      fill(collections, (d.months || []).map((m, i) => `<div class="analytics-bar-row"><span>${U.esc(m)}</span><div class="analytics-bar-track"><i style="width:${Math.round((d.collection[i]||0)/maxC*100)}%"></i></div><b>${U.money(d.collection[i]||0)}</b></div>`).join('') || '<div class="empty-card"><b>No collection data</b><span>Payments will appear here as they are recorded.</span></div>');
      fill(growth, (d.months || []).map((m, i) => `<div class="analytics-bar-row"><span>${U.esc(m)}</span><div class="analytics-bar-track"><i style="width:${Math.round((d.student_growth[i]||0)/maxG*100)}%"></i></div><b>${d.student_growth[i]||0}</b></div>`).join('') || '<div class="empty-card"><b>No student growth data</b><span>Admission dates are used for this trend.</span></div>');
      fill(attendance, (d.attendance || []).slice(0,12).map(x => `<div class="analytics-bar-row"><span>${U.esc(x.name)}</span><div class="analytics-bar-track"><i style="width:${Math.max(0,Math.min(100,x.attendance_percent||0))}%"></i></div><b>${x.attendance_percent||0}%</b></div>`).join('') || '<div class="empty-card"><b>No attendance data</b><span>Attendance records will appear here.</span></div>');
    } catch (e) { U.toast(e.message || 'Could not load analytics', 'error'); }
  }

  async function receipts() {
    const search = q('[data-search]');
    const load = async () => { const rows = await Api.get('/receipts', { q: search?.value || '' }); fill(q('[data-body]'), rows.map((r) => `<tr><td>${U.esc(r.receipt_number)}</td><td>${U.esc(r.student_name)}</td><td>${U.esc(r.month)}</td><td>${U.money(r.amount)}</td><td>${U.esc(r.method)}</td><td>${U.datetime(r.generated_at)}</td><td><button class="btn secondary small" data-view-receipt="${r.id}">Print / View</button></td></tr>`).join('') || tableEmpty(7)); };
    search?.addEventListener('input', U.debounce(load));
    q('[data-body]')?.addEventListener('click',async e=>{const id=e.target.dataset.viewReceipt;if(!id)return;try{const r=await Api.get(`/receipts/${id}`);await showReceipt(r,false)}catch(x){U.toast(x.message||'Could not load receipt','error')}});
    await load();
    const requestedView=new URLSearchParams(location.search).get('view');
    if(requestedView){
      try{const r=await Api.get(`/receipts/${requestedView}`);await showReceipt(r,false);}
      catch(e){U.toast(e.message||'Could not open receipt','error');}
    }
  }

  async function receiptPrint() {
    const id = new URLSearchParams(location.search).get('id');
    if (!id) return U.toast('Receipt ID missing', 'error');
    const r = await Api.get(`/receipts/${id}`);
    const target=q('[data-shared-receipt]');
    if(target) fill(target,receiptMarkup(r));
    const download=q('[data-download-receipt-jpeg]');
    download?.addEventListener('click',async()=>{try{download.disabled=true;await U.downloadElementAsJpeg(q('[data-receipt-capture]'),`${r.receipt_number}.jpg`);U.toast('Receipt JPEG downloaded')}catch(e){U.toast('Could not create receipt JPEG','error')}finally{download.disabled=false;}});
    const print=q('[data-print-receipt]');
    print?.addEventListener('click',()=>U.openPrintWindow(`RMCTI Receipt ${r.receipt_number}`,receiptMarkup(r)));
  }

  async function teacherStudents() {
    const search = q('[data-search]'); const body = q('[data-body]');
    const load = async () => {
      const rows = await Api.get('/teacher/students', { q: search?.value || '' });
      fill(body, rows.map((s) => `<tr class="teacher-student-row">
        <td data-label="ID">${U.esc(s.student_id)}</td>
        <td data-label="Name"><b>${U.esc(s.name)}</b></td>
        <td data-label="Course">${U.esc((s.classes || []).map((c) => c.class_name).join(', ') || '—')}</td>
        <td data-label="Phone">${U.esc(s.phone || '—')}</td>
        <td data-label="Action"><button class="btn secondary small" data-view="${s.id}">View</button></td>
        <td data-label="Photo" class="photo-cell"><img src="${U.photoUrl(s.photo)}" alt="${U.esc(s.name)} photo" class="passport-thumb" loading="lazy" onerror="this.onerror=null;this.src='${U.photoUrl('')}';"></td>
      </tr>`).join('') || tableEmpty(6, 'No assigned students found.'));
    };
    search?.addEventListener('input', U.debounce(load));
    body?.addEventListener('click', async (e) => {
      const id = e.target.dataset.view; if (!id) return;
      const s = await Api.get('/teacher/students', { q: '' });
      const student = s.find((x) => String(x.id) === String(id));
      if (!student) return;
      U.modal('Student details', `<div class="person-detail-head"><div><h3 style="margin:0">${U.esc(student.name)}</h3><p class="muted">${U.esc(student.student_id)} · ${U.esc(student.school_name || '')}</p><p>Phone: ${U.esc(student.phone || '—')}</p><p>Class: ${U.esc((student.classes || []).map((c) => `${c.class_name} · ${c.subject}`).join('; ') || '—')}</p></div><img src="${U.photoUrl(student.photo)}" alt="${U.esc(student.name)} photo" class="passport-photo" onerror="this.onerror=null;this.src='${U.photoUrl('')}';"></div>`);
    });
    await load();
  }
  async function studentDetails() {
    const id = new URLSearchParams(location.search).get('id');
    const rows = await Api.get('/teacher/students');
    const student = rows.find((x) => String(x.id) === String(id));
    if (!student) return fill(q('[data-details]'), '<div class="empty">Student not found or not assigned to you.</div>');
    fill(q('[data-details]'), `<h2>${U.esc(student.name)}</h2><p class="muted">${U.esc(student.student_id)} · ${U.esc(student.school_name || '')}</p><div class="g2"><div><b>Phone</b><p>${U.esc(student.phone || '—')}</p></div><div><b>Status</b><p><span class="badge ${U.esc(student.status)}">${U.esc(student.status)}</span></p></div><div><b>Assigned classes</b><p>${U.esc((student.classes || []).map((c) => `${c.class_name} · ${c.subject}`).join('; ') || '—')}</p></div></div>`);
  }

  async function teacherClasses() {
    const container = q('[data-classes]');
    let rows = [];

    const render = () => {
      fill(container, rows.map((c) => {
        const schedules = (c.allocations || []).map((a) => `<div class="item"><b>${U.esc(a.day)}</b> · ${U.esc(a.start_time)}–${U.esc(a.end_time)} · ${U.esc(a.room || '')}</div>`).join('');
        const today = c.today_schedules || [];
        const todaySchedule = today.length ? today.map((s,i) => {
          const active=!!s.active, complete=!!s.attendance_complete;
          const cls=!active ? 'danger' : (complete ? 'success' : 'warning');
          const label=!active ? 'Attendance unavailable' : (complete ? 'Attendance complete' : 'Mark Attendance');
          return `<div class="card pad" style="margin:8px 0;border-left:4px solid var(--${!active?'danger':complete?'success':'warning'});display:flex;justify-content:space-between;align-items:center;gap:12px">
            <div><b>${U.esc(s.start_time)}–${U.esc(s.end_time)}</b><div class="muted">${U.esc(s.kind||'regular')} · ${s.marked_count||0}/${s.student_count||0} marked</div></div>
            <button class="btn ${cls} small" data-attendance="${c.id}" data-start-time="${U.esc(s.start_time)}" data-end-time="${U.esc(s.end_time)}" ${active?'':'disabled'}>${label}</button>
          </div>`;
        }).join('') : `<div class="card pad" style="margin:10px 0;display:flex;justify-content:space-between;align-items:center"><div><b>Today</b><div class="muted">No class is currently scheduled for this course.</div></div><button class="btn danger small" disabled>Attendance unavailable</button></div>`;
        const current= today.find(s=>s.active);
        return `<article class="card pad">
          <h3>${U.esc(c.class_name)} · ${U.esc(c.batch)}</h3>
          <p class="muted">${U.esc(c.subject)} · ${U.esc(c.room || 'No room')}</p>
          <p><b>${c.student_count}</b> students</p>
          <div><b>Today's sessions</b>${todaySchedule}</div>
          <details><summary>Normal weekly schedule</summary><div style="margin-top:8px">${schedules || '<div class="empty">No schedule assigned.</div>'}</div></details>
          <div class="right" style="justify-content:flex-end;align-items:center;margin-top:14px">
            <span class="badge ${current ? (current.attendance_complete?'active':'pending') : 'inactive'}">${current ? (current.attendance_complete?'Attendance complete':'Class ongoing') : 'Outside class hours'}</span>
            <button class="btn secondary small" data-see-attendance="${c.id}">See Attendance</button>
          </div>
        </article>`;
      }).join('') || '<div class="empty">No classes assigned.</div>');
    };

    const refresh = async () => {
      try { rows = await Api.get('/teacher/classes'); render(); }
      catch (e) { U.toast(e.message || 'Could not load classes', 'error'); }
    };

    const openAttendance = async (classId, startTime, endTime) => {
      try {
        const d = await Api.get(`/teacher/classes/${classId}/attendance`, {start_time:startTime, end_time:endTime});
        if (!d.active) { await refresh(); return U.toast('Attendance is only available during class hours', 'error'); }

        // Keep all changes locally. Nothing is written to the database until Submit Attendance.
        const marks = new Map((d.students || []).map(s => [Number(s.id), s.status || null]));
        const modal = U.modal('Mark Attendance', `
          <div class="right" style="justify-content:space-between;align-items:center;margin-bottom:12px">
            <div class="muted">Date: ${U.date(d.date)} · ${U.esc(d.start_time)}–${U.esc(d.end_time)}</div>
            <div class="right"><span class="badge active">Class active</span><button type="button" class="btn primary small" data-present-all>Present All</button></div>
          </div>
          <div class="table"><table>
            <thead><tr><th>Student</th><th>ID</th><th>Attendance</th></tr></thead>
            <tbody data-attendance-body>
              ${(d.students || []).map(s => {
                const status=s.status || null;
                return `<tr>
                  <td><b>${U.esc(s.name)}</b></td>
                  <td>${U.esc(s.student_id)}</td>
                  <td>
                    <button type="button" class="btn ${status === 'present' ? 'secondary' : 'success'} small" data-mark="${s.id}" data-status="present">Present</button>
                    <button type="button" class="btn ${status === 'absent' ? 'secondary' : 'danger'} small" data-mark="${s.id}" data-status="absent">Absent</button>
                  </td>
                </tr>`;
              }).join('') || '<tr><td colspan="3" class="empty">No students allotted to this course.</td></tr>'}
            </tbody>
          </table></div>
          <div class="right" style="justify-content:space-between;align-items:center;margin-top:16px">
            <span class="muted" data-attendance-count>0 / ${(d.students || []).length} students marked</span>
            <button type="button" class="btn primary" data-submit-attendance disabled>Submit Attendance</button>
          </div>
        `);

        const countEl=modal.querySelector('[data-attendance-count]');
        const submitBtn=modal.querySelector('[data-submit-attendance]');
        const updateState=()=>{
          const total=(d.students || []).length;
          const marked=[...marks.values()].filter(Boolean).length;
          if(countEl) countEl.textContent=`${marked} / ${total} students marked`;
          if(submitBtn) submitBtn.disabled=total===0 || marked!==total;
        };
        updateState();

        modal.querySelector('[data-present-all]')?.addEventListener('click',()=>{
          (d.students||[]).forEach(s=>marks.set(Number(s.id),'present'));
          modal.querySelectorAll('[data-attendance-body] tr').forEach(row=>{
            row.querySelectorAll('[data-mark]').forEach(b=>{
              const selected=b.dataset.status==='present';
              b.classList.toggle('secondary',selected);
              b.classList.toggle('success',!selected && b.dataset.status==='present');
              b.classList.toggle('danger',!selected && b.dataset.status==='absent');
            });
          });
          updateState();
        });
        modal.querySelector('[data-attendance-body]')?.addEventListener('click', (e) => {
          const btn=e.target.closest('[data-mark]');
          if(!btn)return;
          const id=Number(btn.dataset.mark), status=btn.dataset.status;
          marks.set(id,status);
          const row=btn.closest('tr');
          row.querySelectorAll('[data-mark]').forEach(b=>{
            const selected=b.dataset.status===status;
            // The selected/marked button becomes grey. The other remains its normal Present/Absent colour.
            b.classList.toggle('secondary',selected);
            b.classList.toggle('success',!selected && b.dataset.status==='present');
            b.classList.toggle('danger',!selected && b.dataset.status==='absent');
          });
          updateState();
        });

        submitBtn?.addEventListener('click', async()=>{
          if(submitBtn.disabled)return;
          submitBtn.disabled=true;
          submitBtn.textContent='Submitting…';
          try{
            await Api.post(`/teacher/classes/${classId}/attendance`,{
              start_time:d.start_time, end_time:d.end_time,
              attendance:[...marks.entries()].map(([student_id,status])=>({student_id,status}))
            });
            U.toast('Attendance submitted successfully');
            modal.remove();
            await refresh();
          }catch(e){
            U.toast(e.message || 'Could not submit attendance','error');
            submitBtn.disabled=false;
            submitBtn.textContent='Submit Attendance';
            if(/class hours|outside/i.test(e.message||'')){modal.remove();refresh();}
          }
        });

        modal.querySelector('[data-close]')?.addEventListener('click',()=>modal.remove());
      } catch (e) { U.toast(e.message || 'Could not load attendance', 'error'); }
    };

    const openAttendanceHistory = async (classId) => {
      try {
        const c=rows.find(x=>Number(x.id)===Number(classId));
        let d=await Api.get(`/teacher/classes/${classId}/attendance/history`);
        const modal=U.modal(`Attendance History · ${c ? U.esc(c.class_name) : 'Course'}`, `
          <div class="form" style="margin-bottom:16px">
            <div>
              <label class="label">From date</label>
              <input class="input" type="date" data-history-from>
            </div>
            <div>
              <label class="label">To date</label>
              <input class="input" type="date" data-history-to>
            </div>
            <div class="full right" style="justify-content:flex-end">
              <button type="button" class="btn secondary small" data-history-clear>Clear</button>
              <button type="button" class="btn primary small" data-history-filter>Filter</button>
            </div>
          </div>
          <div data-history-results></div>
        `);

        const renderHistory=(data)=>{
          const target=modal.querySelector('[data-history-results]');
          if(!target)return;
          target.innerHTML=(data.history||[]).map(day=>`
            <div class="card pad" style="margin-bottom:12px">
              <div class="right" style="justify-content:space-between;align-items:center">
                <div><b>${U.date(day.date)}</b> <span class="muted">(${U.esc(day.day)})</span>${day.start_time?` <span class="badge active">${U.esc(day.start_time)}–${U.esc(day.end_time||'')}</span>`:' <span class="muted">Legacy/unspecified session</span>'}</div>
                <span class="badge active">Present ${day.present} · Absent ${day.absent}</span>
              </div>
              <div class="table" style="margin-top:10px"><table>
                <thead><tr><th>Student</th><th>ID</th><th>Status</th></tr></thead>
                <tbody>${(day.students||[]).map(st=>`
                  <tr><td><b>${U.esc(st.name)}</b></td><td>${U.esc(st.student_id)}</td>
                  <td><span class="badge ${st.status==='present'?'active':'due'}">${U.esc(st.status)}</span></td></tr>
                `).join('')}</tbody>
              </table></div>
            </div>
          `).join('') || '<div class="empty">No attendance records found for the selected dates.</div>';
        };
        renderHistory(d);

        modal.querySelector('[data-history-filter]')?.addEventListener('click',async()=>{
          try{
            const from=modal.querySelector('[data-history-from]').value;
            const to=modal.querySelector('[data-history-to]').value;
            if(from && to && from>to)return U.toast('From date cannot be after To date','error');
            d=await Api.get(`/teacher/classes/${classId}/attendance/history`,{from,to});
            renderHistory(d);
          }catch(e){U.toast(e.message||'Could not load attendance history','error');}
        });
        modal.querySelector('[data-history-clear]')?.addEventListener('click',async()=>{
          modal.querySelector('[data-history-from]').value='';
          modal.querySelector('[data-history-to]').value='';
          try{d=await Api.get(`/teacher/classes/${classId}/attendance/history`);renderHistory(d);}
          catch(e){U.toast(e.message||'Could not load attendance history','error');}
        });
        modal.querySelector('[data-close]')?.addEventListener('click',()=>modal.remove());
      }catch(e){U.toast(e.message||'Could not load attendance history','error');}
    };

    container?.addEventListener('click', (e) => {
      const attendance=e.target.closest('[data-attendance]');
      if(attendance && !attendance.disabled)openAttendance(Number(attendance.dataset.attendance),attendance.dataset.startTime,attendance.dataset.endTime);
      const history=e.target.closest('[data-see-attendance]');
      if(history)openAttendanceHistory(Number(history.dataset.seeAttendance));
    });

    await refresh();
    // Refresh only the class-hour status; do not reopen or alter an attendance sheet.
    setInterval(refresh, 60000);
  }

  async function workPage(kind) {
    const [classes, subjects] = await Promise.all([Api.get('/teacher/classes'), Api.get('/subjects')]);
    fill(q('[data-class]'), classes.map((c) => `<option value="${c.id}" data-subject-id="${c.subject_id}">${U.esc(c.class_name)} · ${U.esc(c.batch)} · ${U.esc(c.subject)}</option>`).join(''));
    fill(q('[data-subject]'), subjects.map((s) => `<option value="${s.id}">${U.esc(s.name)}</option>`).join(''));
    const body = q('[data-body]');
    let records = [];
    const load = async () => { records = await Api.get(`/${kind}`); fill(body, records.map((x) => kind === 'homework' ? `<tr><td>${U.date(x.homework_date)}</td><td>${U.esc(x.class_name)}</td><td>${U.esc(x.subject)}</td><td>${U.esc(x.title)}</td><td>${U.date(x.due_date)}</td><td><button class="btn warning small" data-edit="${x.id}">Edit</button> <button class="btn danger small" data-del="${x.id}">Delete</button></td></tr>` : `<tr><td>${U.date(x.work_date)}</td><td>${U.esc(x.class_name)}</td><td>${U.esc(x.subject)}</td><td>${U.esc(x.topic)}</td><td><button class="btn warning small" data-edit="${x.id}">Edit</button> <button class="btn danger small" data-del="${x.id}">Delete</button></td></tr>`).join('') || tableEmpty(kind === 'homework' ? 6 : 5)); };
    q('[data-class]')?.addEventListener('change', (e) => { const opt = e.target.selectedOptions[0]; if (opt?.dataset.subjectId) q('[data-subject]').value = opt.dataset.subjectId; });
    const form = q('form[data-work-form]');
    form?.addEventListener('submit', async (e) => { e.preventDefault(); try { const id = form.dataset.editId; const payload = formObj(form); if (id) { await Api.put(`/${kind}/${id}`, payload); delete form.dataset.editId; form.querySelector('button[type="submit"]').textContent = kind === 'homework' ? 'Add homework' : 'Add classwork'; U.toast('Updated successfully'); } else { await Api.post(`/${kind}`, payload); U.toast('Saved successfully'); } form.reset(); load(); } catch (x) { U.toast(x.message, 'error'); } });
    body?.addEventListener('click', async (e) => { const id = e.target.dataset.del || e.target.dataset.edit; if (!id) return; if (e.target.dataset.del) { await Api.del(`/${kind}/${id}`); U.toast('Deleted'); load(); return; } const row = records.find((x) => String(x.id) === String(id)); if (!row) return; Object.entries(row).forEach(([k, v]) => { const input = form.querySelector(`[name="${k}"]`); if (input && v != null) input.value = v; }); form.dataset.editId = id; form.querySelector('button[type="submit"]').textContent = kind === 'homework' ? 'Update homework' : 'Update classwork'; window.scrollTo({ top: 0, behavior: 'smooth' }); });
    await load();
  }

  async function studentList(kind) {
    const path = kind === 'routine' ? '/student/routine' : kind === 'homework' ? '/student/homework' : kind === 'classwork' ? '/student/classwork' : '/student/teacher';
    const rows = await Api.get(path);
    if (kind === 'routine') { const by = {}; rows.forEach((x) => (by[x.day] ??= []).push(x)); fill(q('[data-calendar]'), days.map((day) => `<div class="day"><b>${day}</b>${(by[day] || []).map((x) => `<div class="item"><b>${U.esc(x.subject)}</b><div>${U.esc(x.start_time)}–${U.esc(x.end_time)}${x.kind && x.kind!=='regular' ? ` · <span class="badge active">${U.esc(x.kind)}</span>` : ''}</div><div class="muted">${U.esc(x.class_name || '')} · ${U.esc(x.teacher_name || '')} · ${U.esc(x.room || '')}</div></div>`).join('') || '<div class="empty">No scheduled class.</div>'}</div>`).join('')); }
    if (kind === 'homework') fill(q('[data-body]'), rows.map((x) => `<tr><td>${U.date(x.homework_date)}</td><td>${U.esc(x.subject)}</td><td>${U.esc(x.teacher_name)}</td><td>${U.esc(x.title)}</td><td>${U.date(x.due_date)}</td><td>${U.esc(x.description)}</td></tr>`).join('') || tableEmpty(6));
    if (kind === 'classwork') fill(q('[data-body]'), rows.map((x) => `<tr><td>${U.date(x.work_date)}</td><td>${U.esc(x.subject)}</td><td>${U.esc(x.topic)}</td><td>${U.esc(x.description)}</td><td>${U.esc(x.teacher_name)}</td></tr>`).join('') || tableEmpty(5));
    if (kind === 'teacher') fill(q('[data-teachers]'), rows.map((t) => `<article class="card pad teacher-card"><div class="teacher-card-main"><div class="teacher-card-info"><h3 style="margin:0">${U.esc(t.name)}</h3><div class="muted">${U.esc(t.subject || '')} · ${U.esc(t.qualification || '')}</div><p>Phone: ${U.esc(t.phone || '—')}</p><p>Email: ${U.esc(t.email || '—')}</p></div><img src="${U.photoUrl(t.photo)}" alt="${U.esc(t.name)} photo" class="passport-photo teacher-passport" loading="lazy" onerror="this.onerror=null;this.src='${U.photoUrl('')}';"></div><div class="teacher-card-class">Class: ${U.esc(t.class_name || '')} · ${U.esc(t.batch || '')}</div></article>`).join('') || '<div class="empty">No teacher assigned.</div>');
  }

  async function enquiries() {
    const status=q('[data-status]'), body=q('[data-body]');
    const load=async()=>{
      const rows=await Api.get('/admin/enquiries',{status:status?.value||''});
      fill(body,rows.map(e=>`<tr><td>${U.datetime(e.created_at)}</td><td><b>${U.esc(e.name)}</b></td><td>${U.esc(e.phone)}</td><td style="white-space:pre-wrap;max-width:360px">${U.esc(e.message)}</td><td><span class="badge ${e.status==='new'?'due':e.status==='resolved'?'paid':'active'}">${U.esc(e.status)}</span></td><td><button type="button" class="btn warning small" data-enquiry-edit="${e.id}">Update</button></td></tr>`).join('')||tableEmpty(6,'No enquiries yet. Messages sent from the public Contact form will appear here.'));
      body?.querySelectorAll('[data-enquiry-edit]').forEach(btn=>btn.onclick=async()=>{const item=rows.find(x=>String(x.id)===String(btn.dataset.enquiryEdit));if(!item)return;const m=U.modal('Update enquiry',`<form id="enquiryEdit" class="form"><div><label class="label">Name</label><input class="input" value="${U.esc(item.name)}" disabled></div><div><label class="label">Phone</label><input class="input" value="${U.esc(item.phone)}" disabled></div><div class="full"><label class="label">Message</label><textarea class="input" rows="5" disabled>${U.esc(item.message)}</textarea></div><div><label class="label">Status</label><select class="select" name="status"><option value="new" ${item.status==='new'?'selected':''}>New</option><option value="read" ${item.status==='read'?'selected':''}>Read</option><option value="resolved" ${item.status==='resolved'?'selected':''}>Resolved</option></select></div><div><label class="label">Admin note</label><textarea class="input" name="admin_note" rows="3">${U.esc(item.admin_note||'')}</textarea></div><div class="full right" style="justify-content:flex-end"><button class="btn primary">Save update</button></div></form>`);m.querySelector('#enquiryEdit').onsubmit=async ev=>{ev.preventDefault();try{await Api.put(`/admin/enquiries/${item.id}`,formObj(ev.currentTarget));m.remove();U.toast('Enquiry updated');load()}catch(x){U.toast(x.message,'error')}};});
    };
    status?.addEventListener('change',load);
    q('[data-refresh-enquiries]')?.addEventListener('click',load);
    await load();
  }

  async function adminComplaints() {
    const body=q('[data-body]'), status=q('[data-status]'); let rows=[];
    const load=async()=>{
      rows=await Api.get('/complaints',{status:status?.value||''});
      fill(body,rows.map(c=>`<tr>
        <td data-label="Complaint"><b>${U.esc(c.subject)}</b><div class="muted complaint-description">${U.esc(c.description)}</div></td>
        <td data-label="Class">${U.esc(c.class_name || 'Not mentioned')}</td>
        <td data-label="Status"><span class="badge ${c.status==='resolved'?'paid':c.status==='in_progress'?'active':'due'}">${U.esc(c.status.replace('_',' '))}</span></td>
        <td data-label="Action"><button class="btn warning small" data-complaint-edit="${c.id}">Update</button></td>
      </tr>`).join('')||tableEmpty(4,'No complaints found.'));
    };
    status?.addEventListener('change',load);
    body?.addEventListener('click',async e=>{
      const id=e.target.dataset.complaintEdit;if(!id)return;
      const c=rows.find(x=>String(x.id)===String(id));if(!c)return;
      const m=U.modal('Update complaint',`<form id="complaintEdit" class="form">
        <div class="full"><label class="label">Complaint</label><div class="card pad complaint-readonly"><b>${U.esc(c.subject)}</b><p>${U.esc(c.description)}</p></div></div>
        <div><label class="label">Class</label><input class="input" value="${U.esc(c.class_name || 'Not mentioned')}" disabled></div>
        <div><label class="label">Status</label><select class="select" name="status"><option value="open" ${c.status==='open'?'selected':''}>Open</option><option value="in_progress" ${c.status==='in_progress'?'selected':''}>In progress</option><option value="resolved" ${c.status==='resolved'?'selected':''}>Resolved</option></select></div>
        <div class="full"><label class="label">Admin note</label><textarea class="input" name="admin_note" rows="3">${U.esc(c.admin_note||'')}</textarea></div>
        <div class="full right" style="justify-content:flex-end"><button type="button" class="btn secondary" data-close>Cancel</button><button class="btn primary" type="submit">Save update</button></div>
      </form>`);
      m.querySelector('#complaintEdit').onsubmit=async ev=>{ev.preventDefault();const btn=ev.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;try{await Api.put(`/complaints/${id}`,formObj(ev.currentTarget));m.remove();U.toast('Complaint updated');load()}catch(x){U.toast(x.message,'error')}finally{btn.disabled=false;}};
    });
    await load();
  }
  async function studentComplaints() {
    const body=q('[data-body]'), form=q('[data-complaint-form]'), mention=q('[name="mention_class"]'), classWrap=q('[data-class-wrap]'), classSelect=q('[name="class_id"]');
    try {
      const classes=await Api.get('/student/complaint-classes');
      fill(classSelect,'<option value="">Select class</option>'+classes.map(c=>`<option value="${c.id}">${U.esc(c.label)}${c.subject?` · ${U.esc(c.subject)}`:''}</option>`).join(''));
    } catch(e) { fill(classSelect,'<option value="">No assigned classes</option>'); }
    const syncClass=()=>{const on=Boolean(mention?.checked);if(classWrap)classWrap.hidden=!on;if(classSelect){classSelect.required=on;if(!on)classSelect.value='';}};
    mention?.addEventListener('change',syncClass); syncClass();
    const load=async()=>{
      const rows=await Api.get('/student/complaints');
      fill(body,rows.map(c=>`<tr><td>${U.date(c.complaint_date)}</td><td>${U.esc(c.subject)}</td><td>${U.esc(c.description)}</td><td>${U.esc(c.class_id?'Class mentioned':'Class not mentioned')}</td><td><span class="badge ${c.status==='resolved'?'paid':c.status==='in_progress'?'active':'due'}">${U.esc(c.status.replace('_',' '))}</span></td><td>${U.esc(c.admin_note||'—')}</td></tr>`).join('')||tableEmpty(6,'You have not submitted any complaints yet.'));
    };
    form?.addEventListener('submit',async e=>{e.preventDefault();const btn=form.querySelector('button[type="submit"]');if(btn)btn.disabled=true;try{const data=formObj(form);data.mention_class=Boolean(mention?.checked);if(!data.mention_class)delete data.class_id;await Api.post('/student/complaints',data);form.reset();form.querySelector('[name="complaint_date"]').value=U.today();syncClass();U.toast('Complaint submitted successfully');load()}catch(x){U.toast(x.message,'error')}finally{if(btn)btn.disabled=false}});
    const dateInput=form?.querySelector('[name="complaint_date"]');if(dateInput&&!dateInput.value)dateInput.value=U.today();await load();
  }
  async function attachmentsPage() {
    const isAdmin=document.body.dataset.role==='admin';
    const list=q(isAdmin?'[data-attachment-list]':'[data-notice-list]');
    const form=q('[data-attachment-form]');
    const target=form?.querySelector('[data-attachment-target]');
    const studentWrap=form?.querySelector('[data-attachment-student]');
    const classWrap=form?.querySelector('[data-attachment-class]');
    const studentSelect=form?.querySelector('[data-attachment-student-select]');
    const classSelect=form?.querySelector('[data-attachment-class-select]');
    const load=async()=>{
      const rows=await Api.get('/attachments');
      if(!rows.length){fill(list,'<div class="empty">No files have been published yet.</div>');return;}
      fill(list,rows.map(x=>{
        const recipient=x.target_type==='student'?'One student':x.target_type==='class'?'One class':'Everyone';
        return `<article class="card pad" style="display:flex;justify-content:space-between;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:10px"><div><b>${U.esc(x.title)}</b><div class="muted">${U.esc(x.filename)} · ${U.esc(recipient)} · ${(Number(x.file_size)/1024/1024).toFixed(2)} MB · ${U.datetime(x.created_at)}</div></div><div class="right"><button type="button" class="btn secondary small" data-open-file="${x.id}">View / Open</button>${isAdmin?`<button type="button" class="btn danger small" data-delete-file="${x.id}">Delete</button>`:''}</div></article>`;
      }).join(''));
    };
    const loadRecipients=async()=>{
      if(!isAdmin)return;
      try{
        const [students,classes]=await Promise.all([Api.get('/students',{status:'active'}),Api.get('/classes',{status:'active'})]);
        fill(studentSelect,'<option value="">Select student</option>'+students.map(s=>`<option value="${s.id}">${U.esc(s.name)} · ${U.esc(s.student_id)}</option>`).join(''));
        fill(classSelect,'<option value="">Select class</option>'+classes.map(c=>`<option value="${c.id}">${U.esc(c.class_name)} · ${U.esc(c.batch)} · ${U.esc(c.subject)}</option>`).join(''));
      }catch(e){U.toast(e.message||'Could not load recipients','error');}
    };
    const syncTarget=()=>{
      const type=target?.value||'all';
      if(studentWrap)studentWrap.style.display=type==='student'?'block':'none';
      if(classWrap)classWrap.style.display=type==='class'?'block':'none';
      if(studentSelect)studentSelect.required=type==='student';
      if(classSelect)classSelect.required=type==='class';
    };
    target?.addEventListener('change',syncTarget);
    list?.addEventListener('click',async e=>{
      const open=e.target.closest('[data-open-file]')?.dataset.openFile;
      const del=e.target.closest('[data-delete-file]')?.dataset.deleteFile;
      if(del){U.confirm('Delete attachment?', 'This file will be permanently deleted from the institute notice board.', async()=>{try{await Api.del(`/admin/attachments/${del}`);U.toast('File deleted');load();}catch(x){U.toast(x.message,'error')}});return;}
      if(!open)return;
      try{const token=sessionStorage.getItem('token');const r=await fetch(`${API}/attachments/${open}/download`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw Error('Could not open file');const blob=await r.blob();const url=URL.createObjectURL(blob);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(x){U.toast(x.message||'Could not open file','error')}
    });
    form?.addEventListener('submit',async e=>{
      e.preventDefault();const btn=form.querySelector('button[type="submit"]');btn.disabled=true;
      try{
        const fd=new FormData(form),token=sessionStorage.getItem('token');
        if(fd.get('target_type')==='all'){fd.delete('target_student_id');fd.delete('target_class_id');}
        const r=await fetch(`${API}/admin/attachments`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:fd});
        const d=await r.json().catch(()=>({}));if(!r.ok||d.success===false)throw Error(d.message||'Upload failed');
        form.reset();syncTarget();U.toast('File sent successfully');await load();
      }catch(x){U.toast(x.message||'Could not upload file','error')}finally{btn.disabled=false;}
    });
    syncTarget();await loadRecipients();await load();
  }
  async function auditLogs() {
    const rows = await Api.get('/audit-logs');
    fill(q('[data-body]'), rows.map((x) => `<tr><td>${U.datetime(x.created_at)}</td><td>${U.esc(x.action)}</td><td>${U.esc(x.entity_type)}</td><td>${U.esc(x.entity_id || '—')}</td><td>${U.esc(x.description || '')}</td></tr>`).join('') || tableEmpty(5, 'No audit history yet.'));
  }

  async function studentFees() {
    const d = await Api.get('/student/dashboard'); const f = await Api.get(`/fees/student/${d.student.id}`);
    const totalDue=Number(f.total_due||0);
    const totalPaid=Number(f.total_paid||0);
    fill(q('[data-fees]'), `<div class="g3"><div><div class="muted">Current monthly fee</div><div class="statv">${U.money(f.current_monthly_fee)}</div></div><div><div class="muted">Total Paid</div><div class="statv">${U.money(totalPaid)}</div><small class="muted">All recorded fee payments</small></div><div><div class="muted">Total Due</div><div class="statv">${U.money(totalDue)}</div><small class="muted">All unpaid months + applicable fines</small></div></div><div class="table" style="margin-top:18px"><table><tr><th>Month</th><th>Total Amount</th><th>Paid</th><th>Remaining</th><th>Status</th><th>Payment Date</th><th>Receipt</th></tr>${(f.history || []).map((h) => `<tr><td>${U.esc(h.month_label)}</td><td>${U.money(h.amount)}</td><td>${U.money(h.paid_amount)}</td><td><b>${U.money(h.due_amount)}</b></td><td><span class="badge ${h.status === 'PAID' ? 'paid' : h.status === 'PARTIAL' ? 'partial' : h.status === 'DUE' ? 'due' : 'inactive'}">${U.esc(h.status)}</span></td><td>${h.payment_date ? U.date(h.payment_date) : '—'}</td><td>${U.esc(h.receipt_number || '—')}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No fee history.</td></tr>'}</table></div>`);
  }

  return { auth, dashboard, teachersPage, studentsPage, allClasses, registerPage, feeStructure, allocationPage, feePayment, receipts, receiptPrint, attachmentsPage, workPage, studentList, studentFees, teacherStudents, teacherClasses, auditLogs, studentDetails, adminComplaints, enquiries, studentComplaints, reportsPage, analyticsPage };
})();
