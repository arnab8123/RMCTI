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

  function idCard(person, kind) {
    const isStudent=kind==='student', id=isStudent?person.student_id:person.teacher_id;
    const target=`id-card-${kind}-${person.id}`;
    const fields=isStudent?[['Name',person.name],['ID',id],['Gender',person.gender],['Date of Birth',U.date(person.dob)],['Phone',person.phone],['School',person.school_name],['Guardian',person.parent?.name],['Guardian Phone',person.parent?.phone],['Admission Date',U.date(person.admission_date)],['Status',person.status],['Classes',(person.classes||[]).map(c=>`${c.class_name} · ${c.subject}`).join('; ')||'—']]:[['Name',person.name],['ID',id],['Gender',person.gender],['Date of Birth',U.date(person.dob)],['Phone',person.phone],['Email',person.email],['Qualification',person.qualification],['Experience',person.experience],['Joining Date',U.date(person.joining_date)],['Status',person.status],['Classes',(person.classes||[]).map(c=>`${c.class_name} · ${c.subject}`).join('; ')||'—']];
    return `<div class="id-card-modal"><div id="${target}" class="id-card-export"><div class="id-card"><img class="id-photo" crossorigin="anonymous" src="${U.photoUrl(person.photo)}" alt="${U.esc(person.name)} photo"><div><div class="id-head"><img class="id-logo" crossorigin="anonymous" src="${U.photoUrl('/asset/image.jpeg')}" alt="RMCTI"><div><b>RMCTI</b><div class="muted">${isStudent?'Student Identification Card':'Teacher Identification Card'}</div></div></div><div class="id-grid">${fields.map(([k,v])=>`<div class="id-field"><b>${U.esc(k)}</b><span>${U.esc(v||'—')}</span></div>`).join('')}</div></div></div></div><div class="right" style="justify-content:flex-end;margin-top:14px"><button type="button" class="btn secondary" data-download-id-card data-target-id="${target}">Download JPEG</button><button type="button" class="btn primary" data-close>Close</button></div></div>`;
  }

  function bindIdCardDownload(modal, person, kind) {
    const btn=modal.querySelector('[data-download-id-card]');
    btn?.addEventListener('click',async()=>{
      try{btn.disabled=true;await U.downloadElementAsJpeg(document.getElementById(btn.dataset.targetId),`${kind}-${person.id || (person.student_id||person.teacher_id)}-id-card.jpg`);U.toast('ID card downloaded');}
      catch(e){U.toast('Could not create the JPEG. Please try again.','error');console.error(e)}
      finally{btn.disabled=false;}
    });
  }


  async function dashboard(role) {
    const d = await Api.get(`/${role}/dashboard`);
    document.querySelectorAll('[data-stat]').forEach((el) => { el.textContent = d[el.dataset.stat] ?? 0; });
    if (role === 'admin') {
      fill(q('[data-payments]'), (d.recent_payments || []).map((p) => `<tr><td>${U.esc(p.receipt_number)}</td><td>${U.esc(p.student_name)}</td><td>${U.esc(p.month)}</td><td>${U.money(p.amount)}</td></tr>`).join('') || tableEmpty(4, 'No fee payments yet.'));
      const enquiryEl=q('[data-stat="enquiries"]');
      if(enquiryEl){
        try{
          const rows=await Api.get('/admin/enquiries',{status:''});
          const newCount=rows.filter(x=>x.status==='new').length;
          enquiryEl.textContent=String(newCount);
          const recent=q('[data-enquiries]');
          if(recent){
            recent.innerHTML=rows.slice(0,5).map(e=>`<tr><td>${U.date(e.created_at)}</td><td><b>${U.esc(e.name)}</b></td><td>${U.esc(e.phone)}</td><td style="white-space:pre-wrap">${U.esc(e.message)}</td><td><span class="badge ${e.status==='new'?'due':e.status==='resolved'?'paid':'active'}">${U.esc(e.status)}</span></td></tr>`).join('') || tableEmpty(5,'No website enquiries yet.');
          }
        }catch(error){
          enquiryEl.textContent='0';
          const recent=q('[data-enquiries]');
          if(recent) recent.innerHTML=tableEmpty(5,'Could not load enquiries. Run the database migration and try again.');
        }
      }
    }
    if (role === 'teacher') {
      fill(q('[data-today]'), (d.todays_classes || []).map((c) => `<div class="item"><b>${U.esc(c.subject || '')}</b><div class="muted">${U.esc(c.class_name || '')} · ${U.esc(c.start_time)}–${U.esc(c.end_time)}</div></div>`).join('') || '<div class="empty">No classes today.</div>');
    }
    if (role === 'student') {
      document.querySelectorAll('[data-student-name]').forEach((el) => { el.textContent = d.student?.name || ''; });
      document.querySelectorAll('[data-student-id]').forEach((el) => { el.textContent = d.student?.student_id || ''; });
      fill(q('[data-today]'), (d.todays_classes || []).map((c) => `<div class="item"><b>${U.esc(c.subject)}</b><div>${U.esc(c.start_time)}–${U.esc(c.end_time)} · ${U.esc(c.room || '')}</div></div>`).join('') || '<div class="empty">No class today.</div>');
      const fee = q('[data-fee]');
      if (fee) fee.innerHTML = `<span class="badge ${d.current_fee?.status === 'PAID' ? 'paid' : 'due'}">${U.esc(d.current_fee?.status || 'N/A')}</span><div class="statv">${U.money(d.current_fee?.amount || 0)}</div>`;
      const next=q('[data-next-class]'); if(next){ const n=d.next_class; next.innerHTML=n?`<div class="item"><b>${U.esc(n.subject||'')}</b><div>${U.esc(n.class_name||'')} · ${U.esc(n.batch||'')}</div><div class="muted">${U.esc(n.day||'')} · ${U.esc(n.start_time||'')}–${U.esc(n.end_time||'')} · ${U.esc(n.teacher_name||'')}</div></div>`:'<div class="empty">No upcoming class.</div>'; }
      fill(q('[data-homework]'), (d.upcoming_homework || []).map((h) => `<div class="item"><b>${U.esc(h.title)}</b><div class="muted">${U.esc(h.subject)} · due ${U.date(h.due_date)}</div></div>`).join('') || '<div class="empty">No upcoming homework.</div>');
    }
  }

  async function teachersPage() {
    const search = q('[data-search]'); const status = q('[data-status]'); const body = q('[data-body]');
    const load = async () => {
      const rows = await Api.get('/teachers', { q: search?.value || '', status: status?.value || '' });
      fill(body, rows.map((t) => `<tr><td>${U.esc(t.teacher_id)}</td><td>${U.esc(t.name)}</td><td>${U.esc(t.gender || '—')}</td><td>${U.esc(t.phone || '—')}</td><td>${U.esc(t.email || '—')}</td><td>${U.esc([...new Set((t.classes || []).map((c) => c.subject))].join(', ') || '—')}</td><td><span class="badge ${U.esc(t.status)}">${U.esc(t.status)}</span></td><td><button class="btn secondary small" data-view="${t.id}">View</button> <button class="btn warning small" data-edit="${t.id}">Edit</button> <button class="btn danger small" data-del="${t.id}">Unregister</button></td></tr>`).join('') || tableEmpty(8));
    };
    search?.addEventListener('input', U.debounce(load)); status?.addEventListener('change', load);
    body?.addEventListener('click', async (e) => {
      const id = e.target.dataset.view || e.target.dataset.edit || e.target.dataset.del; if (!id) return;
      if (e.target.dataset.del) return adminVerifiedAction('Confirm teacher unregistration', 'Enter an administrator ID and password to confirm. The teacher will become inactive; historical records remain.', async () => { await Api.del(`/teachers/${id}`); U.toast('Teacher unregistered'); load(); });
      const t = await Api.get(`/teachers/${id}`);
      if (e.target.dataset.edit) {
        const m = U.modal('Edit teacher', `<form id="editTeacher"><div class="g2"><div><label class="label">Name</label><input class="input" name="name" value="${U.esc(t.name)}" required></div><div><label class="label">Phone</label><input class="input" name="phone" value="${U.esc(t.phone || '')}"></div><div><label class="label">Email</label><input class="input" name="email" value="${U.esc(t.email || '')}"></div><div><label class="label">Qualification</label><input class="input" name="qualification" value="${U.esc(t.qualification || '')}"></div></div><label class="label">Address</label><textarea class="input" name="address">${U.esc(t.address || '')}</textarea><label class="label">Status</label><select class="select" name="status"><option ${t.status === 'active' ? 'selected' : ''}>active</option><option ${t.status === 'inactive' ? 'selected' : ''}>inactive</option></select><div class="right"><button class="btn primary">Save changes</button></div></form>`);
        m.querySelector('#editTeacher').onsubmit = async (ev) => { ev.preventDefault(); try { await Api.put(`/teachers/${id}`, formObj(ev.currentTarget)); m.remove(); U.toast('Teacher updated'); load(); } catch (x) { U.toast(x.message, 'error'); } };
      } else {
        const m=U.modal('Teacher ID Card', idCard(t,'teacher')); bindIdCardDownload(m,t,'teacher');
      }
    });
    await load();
  }

  async function adminStudentAttendance(student) {
    let viewMonth = (() => { const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),1); })();
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
      monthEl.textContent=viewMonth.toLocaleDateString('en-IN',{month:'long',year:'numeric'});
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

    const currentMonth = () => {
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth(), 1);
    };
    const applicableFee = (fees, classId) => {
      const month=currentMonth();
      const rows=(fees||[]).filter((f)=>Number(f.class_id)===Number(classId)&&f.status==='active').sort((a,b)=>String(b.effective_from||'').localeCompare(String(a.effective_from||'')));
      return rows.find((f)=>{const from=f.effective_from?new Date(`${f.effective_from}T00:00:00`):null;const to=f.effective_to?new Date(`${f.effective_to}T23:59:59`):null;return (!from||from<=month)&&(!to||to>=month);})||rows[0]||null;
    };
    const feeIsCurrent=(f)=>{if(!f)return false;const month=currentMonth();const from=f.effective_from?new Date(`${f.effective_from}T00:00:00`):null;const to=f.effective_to?new Date(`${f.effective_to}T23:59:59`):null;return (!from||from<=month)&&(!to||to>=month);};

    const load = async () => {
      students = await Api.get('/students', { q: search?.value || '', status: status?.value || '' });
      fill(body, students.map((s) => `<tr><td>${U.esc(s.student_id)}</td><td>${U.esc(s.name)}</td><td>${U.esc((s.classes || []).map((c) => c.class_name).join(', ') || '—')}</td><td>${U.esc(s.phone || '—')}</td><td>${U.esc(s.parent?.name || '—')}</td><td>${U.esc(s.parent?.phone || '—')}</td><td><span class="badge ${s.current_month_status === 'PAID' ? 'paid' : s.current_month_status === 'DUE' ? 'due' : 'inactive'}">${U.esc(s.current_month_status || 'N/A')}</span></td><td><button class="btn success small" data-allot="${s.id}">＋ Allot Class</button> <button class="btn secondary small" data-attendance="${s.id}">See Attendance</button> <button class="btn secondary small" data-view="${s.id}">View</button> <button class="btn warning small" data-edit="${s.id}">Edit</button> <button class="btn danger small" data-del="${s.id}">Unregister</button></td></tr>`).join('') || tableEmpty(8));
    };

    const openAllot = async (studentId = '') => {
      try {
        const [classRows, feeRows, freshStudents] = await Promise.all([
          Api.get('/classes', { status: 'active' }),
          Api.get('/fee-structures'),
          students.length ? Promise.resolve(students) : Api.get('/students', { status: 'active' })
        ]);
        students = freshStudents;
        const selected = students.find((s) => String(s.id) === String(studentId));
        const modal = U.modal('Allot Student to Class', `<form id="allotStudentForm" class="form">
          <div class="full"><label class="label">Student *</label><select class="select" name="student_id" required><option value="">Select student</option>${students.map((s) => `<option value="${s.id}" ${String(s.id)===String(studentId)?'selected':''}>${U.esc(s.student_id)} · ${U.esc(s.name)}</option>`).join('')}</select></div>
          <div class="full"><label class="label">Course *</label><select class="select" name="class_id" data-allot-class required><option value="">Select course</option>${classRows.map((c) => { const f=applicableFee(feeRows,c.id); const current=feeIsCurrent(f); return `<option value="${c.id}" data-fee="${f?f.monthly_fee:''}">${U.esc(c.class_name)} · ${U.esc(c.batch)} · ${U.esc(c.subject)}${f ? ` · ₹${Number(f.monthly_fee).toFixed(2)}/month${current?'':' · configured fee'}` : ' · Fee structure not set'}</option>`; }).join('')}</select></div>
          <div class="full" data-class-preview><div class="empty">Select a class to see its complete details and applicable fee.</div></div>
          <div class="full right" style="justify-content:flex-end"><button type="button" class="btn secondary" data-close>Cancel</button><button class="btn primary" type="submit">Allot Class</button></div>
        </form>`);
        const classSelect = modal.querySelector('[data-allot-class]');
        const preview = modal.querySelector('[data-class-preview]');
        const studentSelect = modal.querySelector('[name="student_id"]');
        const renderPreview = () => {
          const c = classRows.find((x) => String(x.id) === String(classSelect.value));
          if (!c) return fill(preview, '<div class="empty">Select a class to see its complete details and applicable fee.</div>');
          const f = applicableFee(feeRows, c.id);
          const already = students.find((x) => String(x.id) === String(studentSelect.value))?.classes || [];
          const assigned = already.find((x) => String(x.class_id) === String(c.id));
          const schedule = (c.allocations || []).map((a) => `${U.esc(a.day)} · ${U.esc(a.start_time)}–${U.esc(a.end_time)}${a.room ? ` · Room ${U.esc(a.room)}` : ''}${a.teacher_name ? ` · ${U.esc(a.teacher_name)}` : ''}`).join('<br>') || 'No teacher/schedule assigned yet.';
          fill(preview, `<div class="card pad"><div class="g2"><div><b>Course</b><p>${U.esc(c.class_name)} · ${U.esc(c.batch)}</p></div><div><b>Subject</b><p>${U.esc(c.subject)}</p></div><div><b>Room</b><p>${U.esc(c.room || '—')}</p></div><div><b>Capacity</b><p>${U.esc(c.student_count)} / ${U.esc(c.max_students)}</p></div><div class="full"><b>Teacher & Schedule</b><p>${schedule}</p></div><div><b>Fee Structure</b><p class="statv">${f ? U.money(f.monthly_fee) : 'Not set'}</p></div><div><b>Fee Effective From</b><p>${f ? U.date(f.effective_from) : '—'}</p></div></div>${assigned ? '<p class="badge due">This student is already assigned to this course.</p>' : f && feeIsCurrent(f) ? '<p class="muted">This course has an active fee structure for the current month.</p>' : f ? '<p class="badge due">A fee structure exists, but it is not active for the current month. The student can still be allotted.</p>' : '<p class="badge due">No fee structure is configured for this course yet. The student can still be allotted.</p>'}</div>`);
        };
        classSelect.addEventListener('change', renderPreview); studentSelect.addEventListener('change', renderPreview); renderPreview();
        modal.querySelector('#allotStudentForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const sid = Number(studentSelect.value), cid = Number(classSelect.value);
          if (!sid || !cid) return U.toast('Select a student and class', 'error');
          const student = students.find((x) => Number(x.id) === sid); const c = classRows.find((x) => Number(x.id) === cid); const f = applicableFee(feeRows, cid);
          if ((student?.classes || []).some((x) => Number(x.class_id) === cid)) return U.toast('Student is already assigned to this course', 'error');
          const btn = e.currentTarget.querySelector('button[type="submit"]'); btn.disabled = true;
          try { await Api.post('/student-classes', { student_id: sid, class_id: cid }); modal.remove(); U.toast(`${student.name} allotted to ${c.class_name}${f ? `. Fee structure: ${U.money(f.monthly_fee)}/month` : ''}`); await load(); }
          catch (x) { U.toast(x.message, 'error'); }
          finally { btn.disabled = false; }
        });
      } catch (x) { U.toast(x.message || 'Could not load classes', 'error'); }
    };

    q('[data-allot-student]')?.addEventListener('click', () => openAllot());
    search?.addEventListener('input', U.debounce(load)); status?.addEventListener('change', load);
    body?.addEventListener('click', async (e) => {
      const id = e.target.dataset.view || e.target.dataset.edit || e.target.dataset.del || e.target.dataset.allot || e.target.dataset.attendance; if (!id) return;
      if (e.target.dataset.allot) return openAllot(id);
      if (e.target.dataset.attendance) { const st=students.find(x=>String(x.id)===String(id)); if(st) return adminStudentAttendance(st); }
      if (e.target.dataset.del) return adminVerifiedAction('Confirm student unregistration', 'Enter an administrator ID and password to confirm. The student will become inactive; historical records remain.', async () => { await Api.del(`/students/${id}`); U.toast('Student unregistered'); load(); });
      const s = await Api.get(`/students/${id}`);
      if (e.target.dataset.edit) {
        const m = U.modal('Edit student', `<form id="editStudent"><div class="g2"><div><label class="label">Name</label><input class="input" name="name" value="${U.esc(s.name)}" required></div><div><label class="label">Phone</label><input class="input" name="phone" value="${U.esc(s.phone || '')}"></div><div><label class="label">School</label><input class="input" name="school_name" value="${U.esc(s.school_name || '')}"></div><div><label class="label">Status</label><select class="select" name="status"><option ${s.status === 'active' ? 'selected' : ''}>active</option><option ${s.status === 'inactive' ? 'selected' : ''}>inactive</option></select></div></div><label class="label">Address</label><textarea class="input" name="address">${U.esc(s.address || '')}</textarea><div class="right"><button class="btn primary">Save changes</button></div></form>`);
        m.querySelector('#editStudent').onsubmit = async (ev) => { ev.preventDefault(); try { await Api.put(`/students/${id}`, formObj(ev.currentTarget)); m.remove(); U.toast('Student updated'); load(); } catch (x) { U.toast(x.message, 'error'); } };
      } else {
        const m=U.modal('Student ID Card', idCard(s,'student')); bindIdCardDownload(m,s,'student');
      }
    });
    await load();
  }

  async function allClasses() {
    const wrap=q('[data-class-list]');
    const load=async()=>{
      const rows=await Api.get('/classes',{status:''});
      fill(wrap, rows.map(c=>`<article class="class-admin-card">
        <div class="class-admin-head"><div><h3>${U.esc(c.class_name)}</h3><div class="muted">${U.esc(c.batch)} · ${U.esc(c.subject)}</div></div><span class="badge ${c.status==='active'?'active':'inactive'}">${U.esc(c.status)}</span></div>
        <div class="class-admin-meta"><span><b>${U.esc(c.student_count)}</b> / ${U.esc(c.max_students)} Students</span><span>${U.esc(c.room||'Room not set')}</span></div>
        <div class="class-admin-schedule">${(c.allocations||[]).map(a=>`<div><b>${U.esc(a.teacher_name||'Unassigned')}</b><span>${U.esc(a.day)} · ${U.esc(a.start_time)}–${U.esc(a.end_time)}${a.room?` · ${U.esc(a.room)}`:''}</span></div>`).join('')||'<span class="muted">No teacher allocation yet.</span>'}</div>
        <div class="right" style="justify-content:flex-end;margin-top:14px"><button class="btn secondary small" data-class-students="${c.id}">View Students</button>${c.status==='active'?`<button class="btn danger small" data-class-deactivate="${c.id}">Deactivate</button>`:''}</div>
      </article>`).join('')||'<div class="empty">No courses found.</div>');
    };
    wrap?.addEventListener('click',async e=>{
      const view=e.target.dataset.classStudents, deactivate=e.target.dataset.classDeactivate;
      if(deactivate){return adminVerifiedAction('Deactivate course','The course will become inactive and its active student/teacher allocations will be deactivated. Historical records remain.',async()=>{await Api.del(`/classes/${deactivate}`);U.toast('Course deactivated');load()});}
      if(!view)return;
      try{
        const c=await Api.get(`/classes/${view}`);
        const m=U.modal(`${c.class_name} · Students`, `<div><div class="muted" style="margin-bottom:12px">${U.esc(c.batch)} · ${U.esc(c.subject)} · ${U.esc(c.student_count)} / ${U.esc(c.max_students)} students</div><div class="table"><table><thead><tr><th>Student ID</th><th>Name</th><th>Phone</th><th>Action</th></tr></thead><tbody data-class-students-body>${(c.students||[]).map(s=>`<tr><td>${U.esc(s.student_id)}</td><td>${U.esc(s.name)}</td><td>${U.esc(s.phone||'—')}</td><td><button class="btn danger small" data-remove-student-class="${s.id}">Remove</button></td></tr>`).join('')||tableEmpty(4,'No students are currently allotted.')}</tbody></table></div></div>`);
        m.querySelector('[data-class-students-body]')?.addEventListener('click',async ev=>{
          const sid=ev.target.dataset.removeStudentClass;if(!sid)return;
          U.confirm('Remove student from course','This removes the active course assignment only; the student account and records are preserved.',async()=>{try{
              await Api.del(`/classes/${c.id}/students/${sid}`);
              m.remove(); U.toast('Student removed from course'); await load();
            }catch(e){U.toast(e.message,'error')}});
        });
      }catch(e){U.toast(e.message||'Could not load course','error')}
    });
    await load();
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
    const classes = await Api.get('/classes', { status: 'active' });
    fill(q('[data-class-id]'), classes.map((c) => `<option value="${c.id}">${U.esc(c.class_name)} · ${U.esc(c.batch)} · ${U.esc(c.subject)}</option>`).join(''));
    const body = q('[data-body]'); const form = q('form[data-fee-form]');
    const load = async () => { const rows = await Api.get('/fee-structures'); fill(body, rows.map((f) => `<tr><td>${U.esc(f.class_name)}</td><td>${U.esc(f.batch)}</td><td>${U.esc(f.subject)}</td><td>${U.money(f.monthly_fee)}</td><td>${U.date(f.effective_from)}</td><td>${U.date(f.effective_to)}</td><td><span class="badge ${U.esc(f.status)}">${U.esc(f.status)}</span></td><td><button class="btn warning small" data-edit="${f.id}">Edit</button> ${f.status === 'active' ? `<button class="btn danger small" data-del="${f.id}">Deactivate</button>` : ''}</td></tr>`).join('') || tableEmpty(8)); };
    const feeFrom=form?.querySelector('[name="effective_from"]'); if(feeFrom&&!feeFrom.value) feeFrom.value=new Date().toISOString().slice(0,10);
    form?.addEventListener('submit', async (e) => { e.preventDefault(); const btn=form.querySelector('button[type="submit"]'); btn.disabled=true; try { await Api.post('/fee-structures', formObj(e.currentTarget)); U.toast('Fee structure created successfully'); e.currentTarget.reset(); location.reload(); } catch (x) { U.toast(x.message, 'error'); } finally { btn.disabled=false; } });
    body?.addEventListener('click', async (e) => { const id = e.target.dataset.edit || e.target.dataset.del; if (!id) return; if (e.target.dataset.del) { await Api.del(`/fee-structures/${id}`); U.toast('Fee structure deactivated'); return load(); }
      const f = await Api.get(`/fee-structures/${id}`);
      const m = U.modal('Edit fee structure', `<form id="editFee"><div class="g2"><div><label class="label">Monthly fee</label><input class="input" type="number" step="0.01" min="0" name="monthly_fee" value="${U.esc(f.monthly_fee)}" required></div><div><label class="label">Effective from</label><input class="input" type="date" name="effective_from" value="${U.esc(f.effective_from || '')}"></div><div><label class="label">Effective to</label><input class="input" type="date" name="effective_to" value="${U.esc(f.effective_to || '')}"></div><div><label class="label">Status</label><select class="select" name="status"><option ${f.status === 'active' ? 'selected' : ''}>active</option><option ${f.status === 'inactive' ? 'selected' : ''}>inactive</option></select></div></div><div class="right"><button class="btn primary">Save changes</button></div></form>`);
      m.querySelector('#editFee').onsubmit = async (ev) => { ev.preventDefault(); try { await Api.put(`/fee-structures/${id}`, formObj(ev.currentTarget)); m.remove(); U.toast('Fee structure updated'); load(); } catch (x) { U.toast(x.message, 'error'); } };
    });
    await load();
  }

  async function allocationPage() {
    const [teachers, classes, subjects] = await Promise.all([Api.get('/teachers', { status: 'active' }), Api.get('/classes', { status: 'active' }), Api.get('/subjects')]);
    fill(q('[data-teacher]'), teachers.map((t) => `<option value="${t.id}">${U.esc(t.name)} · ${U.esc(t.teacher_id)}</option>`).join(''));
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

        // Reuse an existing subject when the typed name already exists. Otherwise create it.
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
      } catch (x) {
        U.toast(x.message || 'Could not create class', 'error');
      } finally {
        button && (button.disabled = false);
      }
    });
    const form = q('form[data-allocation-form]');
    const body = q('[data-body]');
    const load = async () => { const rows = await Api.get('/classes', { status: 'active' }); fill(body, rows.flatMap((c) => (c.allocations || []).map((a) => `<tr><td>${U.esc(c.class_name)}</td><td>${U.esc(c.batch)}</td><td>${U.esc(c.subject)}</td><td>${U.esc(a.teacher_name || '')}</td><td>${U.esc(a.day)}</td><td>${U.esc(a.start_time)}–${U.esc(a.end_time)}</td><td>${U.esc(a.room || '')}</td><td><button class="btn warning small" data-edit-allocation="${a.allocation_id}" data-teacher="${a.teacher_id || ''}" data-day="${a.day_of_week}" data-start="${a.start_time}" data-end="${a.end_time}" data-class-id="${c.id}">Edit</button> <button class="btn danger small" data-del="${a.allocation_id}">Deactivate</button></td></tr>`)).join('') || tableEmpty(8)); };
    form?.addEventListener('submit', async (e) => { e.preventDefault(); try { const id = form.dataset.editId; const payload = formObj(form); if (id) { await Api.put(`/teacher-classes/${id}`, payload); delete form.dataset.editId; form.querySelector('button[type=\"submit\"]').textContent = 'Allocate course'; U.toast('Allocation updated'); } else { await Api.post('/teacher-classes', payload); U.toast('Class allocated'); } form.reset(); load(); } catch (x) { U.toast(x.message, 'error'); } });
    body?.addEventListener('click', async (e) => { const del = e.target.dataset.del; const edit = e.target.dataset.editAllocation; if (del) { await Api.del(`/teacher-classes/${del}`); U.toast('Allocation deactivated'); load(); return; }
      if (edit) { q('[name="teacher_id"]').value = e.target.dataset.teacher; q('[name="class_id"]').value = e.target.dataset.classId; q('[name="day_of_week"]').value = e.target.dataset.day; q('[name="start_time"]').value = e.target.dataset.start; q('[name="end_time"]').value = e.target.dataset.end; form.dataset.editId = edit; form.querySelector('button[type="submit"]').textContent = 'Update allocation'; window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    await load();
  }

  async function feePayment() {
    const allStudents = await Api.get('/students', { status: 'active' });
    const studentSelect = q('[data-student]');
    const search = q('[data-student-search]');
    const filter = q('[data-fee-filter]');
    const params = new URLSearchParams(location.search);
    if (filter && params.get('filter') === 'due') filter.value = 'due';

    const renderStudents = () => {
      const term = String(search?.value || '').trim().toLowerCase();
      const mode = filter?.value || 'all';
      const students = allStudents.filter((s) => {
        const text = [s.student_id, s.name, s.phone, s.parent?.name, s.parent?.phone].filter(Boolean).join(' ').toLowerCase();
        const matchesSearch = !term || text.includes(term);
        const status = String(s.current_month_status || '').toUpperCase();
        const matchesFilter = mode === 'all' || (mode === 'due' && status === 'DUE') || (mode === 'paid' && status === 'PAID');
        return matchesSearch && matchesFilter;
      });
      const previous = studentSelect?.value;
      fill(studentSelect, students.map((st) => `<option value="${st.id}">${U.esc(st.student_id)} · ${U.esc(st.name)} · ${U.esc(st.current_month_status || 'N/A')}</option>`).join('') || '<option value="">No students found</option>');
      if (students.some((st) => String(st.id) === String(previous))) studentSelect.value = previous;
      else if (students.length) studentSelect.value = String(students[0].id);
      load();
    };

    const load = async () => {
      if (!studentSelect?.value) { fill(q('[data-history]'), '<div class="empty">No student selected.</div>'); return; }
      const d = await Api.get(`/fees/student/${studentSelect.value}`);
      fill(q('[data-history]'), `<div class="table"><table><tr><th>Month</th><th>Amount</th><th>Status</th><th>Receipt</th></tr>${(d.history || []).map((h) => `<tr><td>${U.esc(h.month_label)}</td><td>${U.money(h.amount)}</td><td><span class="badge ${h.status === 'PAID' ? 'paid' : h.status === 'DUE' ? 'due' : 'inactive'}">${U.esc(h.status)}</span></td><td>${U.esc(h.receipt_number || '—')}</td></tr>`).join('')}</table></div>`);
      const month = q('[name="month"]')?.value;
      const m = d.history?.find((x) => x.month === month);
      const amount = q('[name="amount"]');
      if (amount) amount.value = m?.due_amount ?? d.current_monthly_fee ?? '';
    };

    studentSelect?.addEventListener('change', load);
    q('[name="month"]')?.addEventListener('change', load);
    search?.addEventListener('input', U.debounce(renderStudents, 200));
    filter?.addEventListener('change', renderStudents);
    q('form[data-fee-payment]')?.addEventListener('submit', async (e) => { e.preventDefault(); try { const body = formObj(e.currentTarget); body.student_id = Number(studentSelect.value); if (!body.student_id) throw Error('Select a student first'); const r = await Api.post('/fees/payment', body); U.toast('Fee payment recorded'); location.href = `receipt-print.html?id=${r.receipt_id}`; } catch (x) { U.toast(x.message, 'error'); } });

    renderStudents();
  }

  function receiptMarkup(r) {
    return `<div class="receipt-doc" data-receipt-capture style="border:1px solid #d6dde6;border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 8px 24px rgba(15,23,42,.08)">
      <div style="padding:22px 26px;background:#0f3d5e;color:#fff;display:flex;justify-content:space-between;gap:20px;align-items:center"><div style="display:flex;gap:14px;align-items:center"><img crossorigin="anonymous" src="${U.photoUrl('/asset/image.jpeg')}" style="width:54px;height:54px;border-radius:10px;background:#fff;padding:4px;object-fit:contain"><div><div style="font-size:22px;font-weight:800;letter-spacing:.02em">RMCTI</div><div style="font-size:12px;opacity:.86">Ratna's Modern Computer Training Institute</div></div></div><div style="text-align:right"><div style="font-size:11px;opacity:.78;text-transform:uppercase;letter-spacing:.1em">Official Fee Receipt</div><div style="font-size:18px;font-weight:800;margin-top:4px">${U.esc(r.receipt_number)}</div></div></div>
      <div style="padding:24px 26px"><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 28px"><div><div class="muted" style="font-size:11px;text-transform:uppercase">Student</div><div style="font-weight:800;font-size:17px;margin-top:5px">${U.esc(r.student)}</div><div class="muted" style="margin-top:3px">${U.esc(r.student_id)}</div></div><div><div class="muted" style="font-size:11px;text-transform:uppercase">Course</div><div style="font-weight:700;margin-top:5px">${U.esc(r.class||'—')}</div>${r.teacher?`<div class="muted" style="margin-top:3px">Teacher: ${U.esc(r.teacher)}</div>`:''}</div><div><div class="muted" style="font-size:11px;text-transform:uppercase">Fee Month</div><div style="font-weight:700;margin-top:5px">${U.esc(r.fee_month)}</div></div><div><div class="muted" style="font-size:11px;text-transform:uppercase">Payment Date</div><div style="font-weight:700;margin-top:5px">${U.date(r.payment_date)}</div></div></div>
      <div style="margin:24px 0;border-top:1px solid #e2e8f0"></div><div style="display:flex;justify-content:space-between;align-items:flex-end;gap:20px"><div><div class="muted" style="font-size:11px;text-transform:uppercase">Payment Method</div><div style="font-weight:700;margin-top:5px;text-transform:capitalize">${U.esc(String(r.payment_method||'').replace('_',' '))}</div></div><div style="text-align:right"><div class="muted" style="font-size:11px;text-transform:uppercase">Amount Paid</div><div style="font-size:30px;font-weight:900;margin-top:2px;color:#0f3d5e">${U.money(r.amount)}</div></div></div>
      <div style="margin-top:28px;padding-top:14px;border-top:1px dashed #cbd5e1;display:flex;justify-content:space-between;gap:20px;font-size:11px;color:#64748b"><span>Collected by: ${U.esc(r.collected_by||'Admin')}</span><span>System generated receipt</span></div></div></div>`;
  }

  async function showReceipt(r, openPrint=false) {
    const m=U.modal('Fee Receipt', `<div class="receipt-preview-wrap">${receiptMarkup(r)}</div><div class="right" style="justify-content:flex-end;margin-top:14px"><button type="button" class="btn secondary" data-download-receipt>Download JPEG</button><button type="button" class="btn primary" data-print-receipt>Print</button></div>`);
    const capture=m.querySelector('[data-receipt-capture]');
    m.querySelector('[data-download-receipt]')?.addEventListener('click',async ev=>{try{ev.currentTarget.disabled=true;await U.downloadElementAsJpeg(capture,`${r.receipt_number}.jpg`);U.toast('Receipt JPEG downloaded')}catch(e){console.error(e);U.toast('Could not create receipt JPEG','error')}finally{ev.currentTarget.disabled=false;}});
    m.querySelector('[data-print-receipt]')?.addEventListener('click',()=>U.openPrintWindow(`RMCTI Receipt ${r.receipt_number}`,receiptMarkup(r)));
    if(openPrint) m.querySelector('[data-print-receipt]')?.click();
  }

  async function receipts() {
    const search = q('[data-search]');
    const load = async () => { const rows = await Api.get('/receipts', { q: search?.value || '' }); fill(q('[data-body]'), rows.map((r) => `<tr><td>${U.esc(r.receipt_number)}</td><td>${U.esc(r.student_name)}</td><td>${U.esc(r.month)}</td><td>${U.money(r.amount)}</td><td>${U.esc(r.method)}</td><td>${U.date(r.generated_at)}</td><td><button class="btn secondary small" data-view-receipt="${r.id}">Print / View</button></td></tr>`).join('') || tableEmpty(7)); };
    search?.addEventListener('input', U.debounce(load));
    q('[data-body]')?.addEventListener('click',async e=>{const id=e.target.dataset.viewReceipt;if(!id)return;try{const r=await Api.get(`/receipts/${id}`);await showReceipt(r,false)}catch(x){U.toast(x.message||'Could not load receipt','error')}});
    await load();
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
    const load = async () => { const rows = await Api.get('/teacher/students', { q: search?.value || '' }); fill(body, rows.map((s) => `<tr><td>${U.esc(s.student_id)}</td><td>${U.esc(s.name)}</td><td>${U.esc((s.classes || []).map((c) => c.class_name).join(', ') || '—')}</td><td>${U.esc(s.phone || '—')}</td><td><button class="btn secondary small" data-view="${s.id}">View</button></td></tr>`).join('') || tableEmpty(5, 'No assigned students found.')); };
    search?.addEventListener('input', U.debounce(load)); body?.addEventListener('click', async (e) => { const id = e.target.dataset.view; if (!id) return; const s = await Api.get('/teacher/students', { q: '' }); const student = s.find((x) => String(x.id) === String(id)); if (student) U.modal('Student details', `<h3>${U.esc(student.name)}</h3><p>${U.esc(student.student_id)} · ${U.esc(student.school_name || '')}</p><p>Phone: ${U.esc(student.phone || '—')}</p><p>Class: ${U.esc((student.classes || []).map((c) => `${c.class_name} · ${c.subject}`).join('; ') || '—')}</p>`); }); await load();
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
        const active = !!c.attendance_active;
        const schedules = (c.allocations || []).map((a) => `<div class="item"><b>${U.esc(a.day)}</b> · ${U.esc(a.start_time)}–${U.esc(a.end_time)} · ${U.esc(a.room || '')}</div>`).join('');
        return `<article class="card pad">
          <h3>${U.esc(c.class_name)} · ${U.esc(c.batch)}</h3>
          <p class="muted">${U.esc(c.subject)} · ${U.esc(c.room || 'No room')}</p>
          <p><b>${c.student_count}</b> students</p>
          <div>${schedules || '<div class="empty">No schedule assigned.</div>'}</div>
          <div class="right" style="justify-content:space-between;align-items:center;margin-top:14px">
            <span class="badge ${active ? 'active' : 'inactive'}">${active ? 'Class active' : 'Outside class hours'}</span>
            <div class="right">
              <button class="btn secondary small" data-see-attendance="${c.id}">See Attendance</button>
              <button class="btn ${active ? 'success' : 'danger'} small" data-attendance="${c.id}" ${active ? '' : 'disabled'}>${active ? 'Attendance' : 'Attendance unavailable'}</button>
            </div>
          </div>
        </article>`;
      }).join('') || '<div class="empty">No classes assigned.</div>');
    };

    const refresh = async () => {
      try { rows = await Api.get('/teacher/classes'); render(); }
      catch (e) { U.toast(e.message || 'Could not load classes', 'error'); }
    };

    const openAttendance = async (classId) => {
      try {
        const d = await Api.get(`/teacher/classes/${classId}/attendance`);
        if (!d.active) { await refresh(); return U.toast('Attendance is only available during class hours', 'error'); }

        // Keep all changes locally. Nothing is written to the database until Submit Attendance.
        const marks = new Map((d.students || []).map(s => [Number(s.id), s.status || null]));
        const modal = U.modal('Mark Attendance', `
          <div class="right" style="justify-content:space-between;align-items:center;margin-bottom:12px">
            <div class="muted">Date: ${U.date(d.date)} · ${U.esc(d.start_time)}–${U.esc(d.end_time)}</div>
            <span class="badge active">Class active</span>
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
                <div><b>${U.date(day.date)}</b> <span class="muted">(${U.esc(day.day)})</span></div>
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
      if(attendance && !attendance.disabled)openAttendance(Number(attendance.dataset.attendance));
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
    if (kind === 'routine') { const by = {}; rows.forEach((x) => (by[x.day] ??= []).push(x)); fill(q('[data-calendar]'), days.map((day) => `<div class="day"><b>${day}</b>${(by[day] || []).map((x) => `<div class="item"><b>${U.esc(x.subject)}</b><div>${U.esc(x.start_time)}–${U.esc(x.end_time)}</div><div class="muted">${U.esc(x.teacher_name || '')} · ${U.esc(x.room || '')}</div></div>`).join('')}</div>`).join('')); }
    if (kind === 'homework') fill(q('[data-body]'), rows.map((x) => `<tr><td>${U.date(x.homework_date)}</td><td>${U.esc(x.subject)}</td><td>${U.esc(x.teacher_name)}</td><td>${U.esc(x.title)}</td><td>${U.date(x.due_date)}</td><td>${U.esc(x.description)}</td></tr>`).join('') || tableEmpty(6));
    if (kind === 'classwork') fill(q('[data-body]'), rows.map((x) => `<tr><td>${U.date(x.work_date)}</td><td>${U.esc(x.subject)}</td><td>${U.esc(x.topic)}</td><td>${U.esc(x.description)}</td><td>${U.esc(x.teacher_name)}</td></tr>`).join('') || tableEmpty(5));
    if (kind === 'teacher') fill(q('[data-teachers]'), rows.map((t) => `<div class="card pad"><h3>${U.esc(t.name)}</h3><div class="muted">${U.esc(t.subject || '')} · ${U.esc(t.qualification || '')}</div><p>Phone: ${U.esc(t.phone || '—')}</p><p>Email: ${U.esc(t.email || '—')}</p><p>Class: ${U.esc(t.class_name || '')} · ${U.esc(t.batch || '')}</p></div>`).join('') || '<div class="empty">No teacher assigned.</div>');
  }

  async function enquiries() {
    const status=q('[data-status]'), body=q('[data-body]');
    const load=async()=>{
      const rows=await Api.get('/admin/enquiries',{status:status?.value||''});
      fill(body,rows.map(e=>`<tr><td>${U.date(e.created_at)}</td><td><b>${U.esc(e.name)}</b></td><td>${U.esc(e.phone)}</td><td style="white-space:pre-wrap;max-width:360px">${U.esc(e.message)}</td><td><span class="badge ${e.status==='new'?'due':e.status==='resolved'?'paid':'active'}">${U.esc(e.status)}</span></td><td><button class="btn warning small" data-enquiry-edit="${e.id}">Update</button></td></tr>`).join('')||tableEmpty(6,'No enquiries found.'));
      body?.querySelectorAll('[data-enquiry-edit]').forEach(btn=>btn.onclick=async()=>{const item=rows.find(x=>String(x.id)===String(btn.dataset.enquiryEdit));if(!item)return;const m=U.modal('Update enquiry',`<form id="enquiryEdit" class="form"><div><label class="label">Name</label><input class="input" value="${U.esc(item.name)}" disabled></div><div><label class="label">Phone</label><input class="input" value="${U.esc(item.phone)}" disabled></div><div class="full"><label class="label">Message</label><textarea class="input" rows="5" disabled>${U.esc(item.message)}</textarea></div><div><label class="label">Status</label><select class="select" name="status"><option value="new" ${item.status==='new'?'selected':''}>New</option><option value="read" ${item.status==='read'?'selected':''}>Read</option><option value="resolved" ${item.status==='resolved'?'selected':''}>Resolved</option></select></div><div><label class="label">Admin note</label><textarea class="input" name="admin_note" rows="3">${U.esc(item.admin_note||'')}</textarea></div><div class="full right" style="justify-content:flex-end"><button class="btn primary">Save update</button></div></form>`);m.querySelector('#enquiryEdit').onsubmit=async ev=>{ev.preventDefault();try{await Api.put(`/admin/enquiries/${item.id}`,formObj(ev.currentTarget));m.remove();U.toast('Enquiry updated');load()}catch(x){U.toast(x.message,'error')}};});
    };
    status?.addEventListener('change',load);
    q('[data-refresh-enquiries]')?.addEventListener('click',load);
    await load();
  }

  async function adminComplaints() {
    const body=q('[data-body]'), status=q('[data-status]'); let rows=[];
    const load=async()=>{ rows=await Api.get('/complaints',{status:status?.value||''}); fill(body,rows.map(c=>`<tr><td>${U.date(c.complaint_date)}</td><td><b>${U.esc(c.student_name)}</b><div class="muted">${U.esc(c.student_code)}</div></td><td>${U.esc(c.subject)}</td><td>${U.esc(c.description)}</td><td><span class="badge ${c.status==='resolved'?'paid':c.status==='in_progress'?'active':'due'}">${U.esc(c.status.replace('_',' '))}</span></td><td><button class="btn warning small" data-complaint-edit="${c.id}">Update</button></td></tr>`).join('')||tableEmpty(6,'No complaints found.')); };
    status?.addEventListener('change',load);
    body?.addEventListener('click',async e=>{const id=e.target.dataset.complaintEdit;if(!id)return;const c=rows.find(x=>String(x.id)===String(id));if(!c)return;const m=U.modal('Update complaint',`<form id="complaintEdit" class="form"><div><label class="label">Student</label><input class="input" value="${U.esc(c.student_name)} · ${U.esc(c.student_code)}" disabled></div><div><label class="label">Date</label><input class="input" value="${U.date(c.complaint_date)}" disabled></div><div class="full"><label class="label">Subject</label><input class="input" value="${U.esc(c.subject)}" disabled></div><div class="full"><label class="label">Description</label><textarea class="input" rows="4" disabled>${U.esc(c.description)}</textarea></div><div><label class="label">Status</label><select class="select" name="status"><option value="open" ${c.status==='open'?'selected':''}>Open</option><option value="in_progress" ${c.status==='in_progress'?'selected':''}>In progress</option><option value="resolved" ${c.status==='resolved'?'selected':''}>Resolved</option></select></div><div><label class="label">Admin note</label><textarea class="input" name="admin_note" rows="2">${U.esc(c.admin_note||'')}</textarea></div><div class="full right" style="justify-content:flex-end"><button class="btn primary">Save update</button></div></form>`);m.querySelector('#complaintEdit').onsubmit=async ev=>{ev.preventDefault();try{await Api.put(`/complaints/${id}`,formObj(ev.currentTarget));m.remove();U.toast('Complaint updated');load()}catch(x){U.toast(x.message,'error')}}});
    await load();
  }

  async function studentComplaints() {
    const body=q('[data-body]'), form=q('[data-complaint-form]');
    const load=async()=>{const rows=await Api.get('/student/complaints');fill(body,rows.map(c=>`<tr><td>${U.date(c.complaint_date)}</td><td>${U.esc(c.subject)}</td><td>${U.esc(c.description)}</td><td><span class="badge ${c.status==='resolved'?'paid':c.status==='in_progress'?'active':'due'}">${U.esc(c.status.replace('_',' '))}</span></td><td>${U.esc(c.admin_note||'—')}</td></tr>`).join('')||tableEmpty(5,'You have not submitted any complaints yet.'));};
    form?.addEventListener('submit',async e=>{e.preventDefault();const btn=form.querySelector('button[type="submit"]');btn.disabled=true;try{await Api.post('/student/complaints',formObj(form));form.reset();form.querySelector('[name="complaint_date"]').value=new Date().toISOString().slice(0,10);U.toast('Complaint submitted successfully');load()}catch(x){U.toast(x.message,'error')}finally{btn.disabled=false}});
    const dateInput=form?.querySelector('[name="complaint_date"]');if(dateInput&&!dateInput.value)dateInput.value=new Date().toISOString().slice(0,10);await load();
  }

  async function auditLogs() {
    const rows = await Api.get('/audit-logs');
    fill(q('[data-body]'), rows.map((x) => `<tr><td>${U.date(x.created_at)}</td><td>${U.esc(x.action)}</td><td>${U.esc(x.entity_type)}</td><td>${U.esc(x.entity_id || '—')}</td><td>${U.esc(x.description || '')}</td></tr>`).join('') || tableEmpty(5, 'No audit history yet.'));
  }

  async function studentFees() {
    const d = await Api.get('/student/dashboard'); const f = await Api.get(`/fees/student/${d.student.id}`);
    fill(q('[data-fees]'), `<div class="g2"><div><div class="muted">Current monthly fee</div><div class="statv">${U.money(f.current_monthly_fee)}</div></div><div><div class="muted">Current status</div><div class="statv">${U.esc(d.current_fee.status)}</div></div></div><div class="table" style="margin-top:18px"><table><tr><th>Month</th><th>Amount</th><th>Status</th><th>Payment Date</th><th>Receipt</th></tr>${(f.history || []).map((h) => `<tr><td>${U.esc(h.month_label)}</td><td>${U.money(h.amount)}</td><td><span class="badge ${h.status === 'PAID' ? 'paid' : h.status === 'DUE' ? 'due' : 'inactive'}">${U.esc(h.status)}</span></td><td>${h.payment_date ? U.date(h.payment_date) : '—'}</td><td>${U.esc(h.receipt_number || '—')}</td></tr>`).join('')}</table></div>`);
  }

  return { auth, dashboard, teachersPage, studentsPage, allClasses, registerPage, feeStructure, allocationPage, feePayment, receipts, receiptPrint, workPage, studentList, studentFees, teacherStudents, teacherClasses, auditLogs, studentDetails, adminComplaints, enquiries, studentComplaints };
})();
