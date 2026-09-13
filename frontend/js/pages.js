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
    const fields=isStudent?[['Name',person.name],['ID',id],['Gender',person.gender],['Date of Birth',U.date(person.dob)],['Phone',person.phone],['School',person.school_name],['Guardian',person.parent?.name],['Guardian Phone',person.parent?.phone],['Admission Date',U.date(person.admission_date)],['Status',person.status],['Classes',(person.classes||[]).map(c=>`${c.class_name} · ${c.subject}`).join('; ')||'—']]:[['Name',person.name],['ID',id],['Gender',person.gender],['Date of Birth',U.date(person.dob)],['Phone',person.phone],['Email',person.email],['Qualification',person.qualification],['Experience',person.experience],['Joining Date',U.date(person.joining_date)],['Status',person.status],['Classes',(person.classes||[]).map(c=>`${c.class_name} · ${c.subject}`).join('; ')||'—']];
    return `<div class="id-card"><img class="id-photo" src="${U.photoUrl(person.photo)}" alt="${U.esc(person.name)} photo"><div><div class="id-head"><img class="id-logo" src="${isStudent?'../asset/image.jpeg':'../asset/image.jpeg'}" alt="RMCTI"><div><b>RMCTI</b><div class="muted">${isStudent?'Student Identification Card':'Teacher Identification Card'}</div></div></div><div class="id-grid">${fields.map(([k,v])=>`<div class="id-field"><b>${U.esc(k)}</b><span>${U.esc(v||'—')}</span></div>`).join('')}</div></div></div>`;
  }

  async function dashboard(role) {
    const d = await Api.get(`/${role}/dashboard`);
    document.querySelectorAll('[data-stat]').forEach((el) => { el.textContent = d[el.dataset.stat] ?? 0; });
    if (role === 'admin') {
      fill(q('[data-payments]'), (d.recent_payments || []).map((p) => `<tr><td>${U.esc(p.receipt_number)}</td><td>${U.esc(p.student_name)}</td><td>${U.esc(p.month)}</td><td>${U.money(p.amount)}</td></tr>`).join('') || tableEmpty(4, 'No fee payments yet.'));
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
        U.modal('Teacher ID Card', idCard(t,'teacher'));
      }
    });
    await load();
  }

  async function studentsPage() {
    const search = q('[data-search]'); const status = q('[data-status]'); const body = q('[data-body]');
    let students = [];

    const currentMonth = () => {
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth(), 1);
    };
    const applicableFee = (fees, classId) => {
      const month = currentMonth();
      return (fees || [])
        .filter((f) => Number(f.class_id) === Number(classId) && f.status === 'active')
        .filter((f) => {
          const from = f.effective_from ? new Date(`${f.effective_from}T00:00:00`) : null;
          const to = f.effective_to ? new Date(`${f.effective_to}T23:59:59`) : null;
          return (!from || from <= month) && (!to || to >= month);
        })
        .sort((a,b) => String(b.effective_from || '').localeCompare(String(a.effective_from || '')))[0] || null;
    };

    const load = async () => {
      students = await Api.get('/students', { q: search?.value || '', status: status?.value || '' });
      fill(body, students.map((s) => `<tr><td>${U.esc(s.student_id)}</td><td>${U.esc(s.name)}</td><td>${U.esc((s.classes || []).map((c) => c.class_name).join(', ') || '—')}</td><td>${U.esc(s.phone || '—')}</td><td>${U.esc(s.parent?.name || '—')}</td><td>${U.esc(s.parent?.phone || '—')}</td><td><span class="badge ${s.current_month_status === 'PAID' ? 'paid' : s.current_month_status === 'DUE' ? 'due' : 'inactive'}">${U.esc(s.current_month_status || 'N/A')}</span></td><td><button class="btn success small" data-allot="${s.id}">＋ Allot Class</button> <button class="btn secondary small" data-view="${s.id}">View</button> <button class="btn warning small" data-edit="${s.id}">Edit</button> <button class="btn danger small" data-del="${s.id}">Unregister</button></td></tr>`).join('') || tableEmpty(8));
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
          <div class="full"><label class="label">Class *</label><select class="select" name="class_id" data-allot-class required><option value="">Select class</option>${classRows.map((c) => { const f=applicableFee(feeRows,c.id); return `<option value="${c.id}" data-fee="${f?f.monthly_fee:''}">${U.esc(c.class_name)} · ${U.esc(c.batch)} · ${U.esc(c.subject)}${f ? ` · ₹${Number(f.monthly_fee).toFixed(2)}/month` : ' · Fee not set'}</option>`; }).join('')}</select></div>
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
          fill(preview, `<div class="card pad"><div class="g2"><div><b>Class</b><p>${U.esc(c.class_name)} · ${U.esc(c.batch)}</p></div><div><b>Subject</b><p>${U.esc(c.subject)}</p></div><div><b>Room</b><p>${U.esc(c.room || '—')}</p></div><div><b>Capacity</b><p>${U.esc(c.student_count)} / ${U.esc(c.max_students)}</p></div><div class="full"><b>Teacher & Schedule</b><p>${schedule}</p></div><div><b>Monthly Fee</b><p class="statv">${f ? U.money(f.monthly_fee) : 'Not set'}</p></div><div><b>Fee Effective From</b><p>${f ? U.date(f.effective_from) : '—'}</p></div></div>${assigned ? '<p class="badge due">This student is already assigned to this class.</p>' : f ? '<p class="muted">Allotting this class automatically makes this class fee structure applicable to the student for fee collection.</p>' : '<p class="badge due">No active fee structure applies this month. Create one before collecting this student\'s fee.</p>'}</div>`);
        };
        classSelect.addEventListener('change', renderPreview); studentSelect.addEventListener('change', renderPreview); renderPreview();
        modal.querySelector('#allotStudentForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const sid = Number(studentSelect.value), cid = Number(classSelect.value);
          if (!sid || !cid) return U.toast('Select a student and class', 'error');
          const student = students.find((x) => Number(x.id) === sid); const c = classRows.find((x) => Number(x.id) === cid); const f = applicableFee(feeRows, cid);
          if ((student?.classes || []).some((x) => Number(x.class_id) === cid)) return U.toast('Student is already assigned to this class', 'error');
          if (!f) return U.toast('This class has no active fee structure for the current month. Create the fee structure first.', 'error');
          const btn = e.currentTarget.querySelector('button[type="submit"]'); btn.disabled = true;
          try { await Api.post('/student-classes', { student_id: sid, class_id: cid }); modal.remove(); U.toast(`${student.name} allotted to ${c.class_name}. Monthly fee: ${U.money(f.monthly_fee)}`); await load(); }
          catch (x) { U.toast(x.message, 'error'); }
          finally { btn.disabled = false; }
        });
      } catch (x) { U.toast(x.message || 'Could not load classes', 'error'); }
    };

    q('[data-allot-student]')?.addEventListener('click', () => openAllot());
    search?.addEventListener('input', U.debounce(load)); status?.addEventListener('change', load);
    body?.addEventListener('click', async (e) => {
      const id = e.target.dataset.view || e.target.dataset.edit || e.target.dataset.del || e.target.dataset.allot; if (!id) return;
      if (e.target.dataset.allot) return openAllot(id);
      if (e.target.dataset.del) return adminVerifiedAction('Confirm student unregistration', 'Enter an administrator ID and password to confirm. The student will become inactive; historical records remain.', async () => { await Api.del(`/students/${id}`); U.toast('Student unregistered'); load(); });
      const s = await Api.get(`/students/${id}`);
      if (e.target.dataset.edit) {
        const m = U.modal('Edit student', `<form id="editStudent"><div class="g2"><div><label class="label">Name</label><input class="input" name="name" value="${U.esc(s.name)}" required></div><div><label class="label">Phone</label><input class="input" name="phone" value="${U.esc(s.phone || '')}"></div><div><label class="label">School</label><input class="input" name="school_name" value="${U.esc(s.school_name || '')}"></div><div><label class="label">Status</label><select class="select" name="status"><option ${s.status === 'active' ? 'selected' : ''}>active</option><option ${s.status === 'inactive' ? 'selected' : ''}>inactive</option></select></div></div><label class="label">Address</label><textarea class="input" name="address">${U.esc(s.address || '')}</textarea><div class="right"><button class="btn primary">Save changes</button></div></form>`);
        m.querySelector('#editStudent').onsubmit = async (ev) => { ev.preventDefault(); try { await Api.put(`/students/${id}`, formObj(ev.currentTarget)); m.remove(); U.toast('Student updated'); load(); } catch (x) { U.toast(x.message, 'error'); } };
      } else {
        U.modal('Student ID Card', idCard(s,'student'));
      }
    });
    await load();
  }

  async function registerPage(kind) {
    const form = q('form[data-register]'); if (!form) return;
    if (kind === 'student') {
      const classes = await Api.get('/classes', { status: 'active' });
      fill(q('[data-class-list]'), classes.map((c) => `<label class="card pad"><input type="checkbox" name="class_ids" value="${c.id}"> ${U.esc(c.class_name)} · ${U.esc(c.batch)} · ${U.esc(c.subject)}</label>`).join('') || '<div class="empty">Create a class first.</div>');
    }
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); const data = formObj(e.currentTarget); const file=q('[name="photo_file"]')?.files?.[0];
      try {
        if (file) { const up=await Api.upload('/uploads/photo',file); data.photo=up.photo; }
        delete data.photo_file;
        if (kind === 'teacher') {
          const r = await Api.post('/teachers', data);
          U.modal('Teacher created', idCard(r.teacher,'teacher') + `<div class="card pad" style="margin-top:12px"><b>Login credentials</b><p>Username: <b>${U.esc(r.credentials.username)}</b></p><p>Temporary password: <b>${U.esc(r.credentials.temporary_password)}</b></p></div>`);
        } else {
          data.class_ids = [...form.querySelectorAll('[name="class_ids"]:checked')].map((x) => Number(x.value));
          data.parent = { name: data.parent_name, relationship: data.parent_relationship, phone: data.parent_phone, email: data.parent_email, address: data.parent_address };
          ['class_ids','parent_name','parent_relationship','parent_phone','parent_email','parent_address'].forEach((k) => delete data[k]);
          const r = await Api.post('/students', data);
          U.modal('Student created', idCard(r.student,'student') + `<div class="card pad" style="margin-top:12px"><b>Login credentials</b><p>Username: <b>${U.esc(r.credentials.username)}</b></p><p>Temporary password: <b>${U.esc(r.credentials.temporary_password)}</b></p></div>`);
        }
        U.toast('Saved successfully'); form.reset();
      } catch (x) { U.toast(x.message, 'error'); }
    });
  }

  async function feeStructure() {
    const classes = await Api.get('/classes', { status: 'active' });
    fill(q('[data-class-id]'), classes.map((c) => `<option value="${c.id}">${U.esc(c.class_name)} · ${U.esc(c.batch)} · ${U.esc(c.subject)}</option>`).join(''));
    const body = q('[data-body]'); const form = q('form[data-fee-form]');
    const load = async () => { const rows = await Api.get('/fee-structures'); fill(body, rows.map((f) => `<tr><td>${U.esc(f.class_name)}</td><td>${U.esc(f.batch)}</td><td>${U.esc(f.subject)}</td><td>${U.money(f.monthly_fee)}</td><td>${U.date(f.effective_from)}</td><td>${U.date(f.effective_to)}</td><td><span class="badge ${U.esc(f.status)}">${U.esc(f.status)}</span></td><td><button class="btn warning small" data-edit="${f.id}">Edit</button> ${f.status === 'active' ? `<button class="btn danger small" data-del="${f.id}">Deactivate</button>` : ''}</td></tr>`).join('') || tableEmpty(8)); };
    form?.addEventListener('submit', async (e) => { e.preventDefault(); try { await Api.post('/fee-structures', formObj(e.currentTarget)); U.toast('Fee structure created'); e.currentTarget.reset(); load(); } catch (x) { U.toast(x.message, 'error'); } });
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
    form?.addEventListener('submit', async (e) => { e.preventDefault(); try { const id = form.dataset.editId; const payload = formObj(form); if (id) { await Api.put(`/teacher-classes/${id}`, payload); delete form.dataset.editId; form.querySelector('button[type=\"submit\"]').textContent = 'Allocate class'; U.toast('Allocation updated'); } else { await Api.post('/teacher-classes', payload); U.toast('Class allocated'); } form.reset(); load(); } catch (x) { U.toast(x.message, 'error'); } });
    body?.addEventListener('click', async (e) => { const del = e.target.dataset.del; const edit = e.target.dataset.editAllocation; if (del) { await Api.del(`/teacher-classes/${del}`); U.toast('Allocation deactivated'); load(); return; }
      if (edit) { q('[name="teacher_id"]').value = e.target.dataset.teacher; q('[name="class_id"]').value = e.target.dataset.classId; q('[name="day_of_week"]').value = e.target.dataset.day; q('[name="start_time"]').value = e.target.dataset.start; q('[name="end_time"]').value = e.target.dataset.end; form.dataset.editId = edit; form.querySelector('button[type="submit"]').textContent = 'Update allocation'; window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });
    await load();
  }

  async function feePayment() {
    const list = await Api.get('/students', { status: 'active' });
    fill(q('[data-student]'), list.map((s) => `<option value="${s.id}">${U.esc(s.student_id)} · ${U.esc(s.name)}</option>`).join(''));
    const load = async () => { if (!q('[data-student]').value) return; const d = await Api.get(`/fees/student/${q('[data-student]').value}`); fill(q('[data-history]'), `<div class="table"><table><tr><th>Month</th><th>Amount</th><th>Status</th><th>Receipt</th></tr>${(d.history || []).map((h) => `<tr><td>${U.esc(h.month_label)}</td><td>${U.money(h.amount)}</td><td><span class="badge ${h.status === 'PAID' ? 'paid' : h.status === 'DUE' ? 'due' : 'inactive'}">${U.esc(h.status)}</span></td><td>${U.esc(h.receipt_number || '—')}</td></tr>`).join('')}</table></div>`); const m = d.history?.find((x) => x.month === q('[name="month"]').value); q('[name="amount"]').value = m?.due_amount ?? d.current_monthly_fee; };
    q('[data-student]')?.addEventListener('change', load); q('[name="month"]')?.addEventListener('change', load);
    q('form[data-fee-payment]')?.addEventListener('submit', async (e) => { e.preventDefault(); try { const body = formObj(e.currentTarget); body.student_id = Number(q('[data-student]').value); const r = await Api.post('/fees/payment', body); U.toast('Fee payment recorded'); location.href = `receipt-print.html?id=${r.receipt_id}`; } catch (x) { U.toast(x.message, 'error'); } });
    await load();
  }

  async function receipts() {
    const search = q('[data-search]');
    const load = async () => { const rows = await Api.get('/receipts', { q: search?.value || '' }); fill(q('[data-body]'), rows.map((r) => `<tr><td>${U.esc(r.receipt_number)}</td><td>${U.esc(r.student_name)}</td><td>${U.esc(r.month)}</td><td>${U.money(r.amount)}</td><td>${U.esc(r.method)}</td><td>${U.date(r.generated_at)}</td><td><a class="btn secondary small" target="_blank" href="receipt-print.html?id=${r.id}">Print</a></td></tr>`).join('') || tableEmpty(7)); };
    search?.addEventListener('input', U.debounce(load)); await load();
  }

  async function receiptPrint() { const id = new URLSearchParams(location.search).get('id'); if (!id) return U.toast('Receipt ID missing', 'error'); const r = await Api.get(`/receipts/${id}`); document.querySelectorAll('[data-r]').forEach((el) => { const key = el.dataset.r; el.textContent = key === 'amount' ? U.money(r[key]) : key === 'payment_date' ? U.date(r[key]) : (r[key] || '—'); }); }

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
    const rows = await Api.get('/teacher/classes'); fill(q('[data-classes]'), rows.map((c) => `<article class="card pad"><h3>${U.esc(c.class_name)} · ${U.esc(c.batch)}</h3><p class="muted">${U.esc(c.subject)} · ${U.esc(c.room || 'No room')}</p><p><b>${c.student_count}</b> students</p><div>${(c.allocations || []).map((a) => `<div class="item"><b>${U.esc(a.day)}</b> · ${U.esc(a.start_time)}–${U.esc(a.end_time)} · ${U.esc(a.room || '')}</div>`).join('') || '<div class="empty">No schedule assigned.</div>'}</div></article>`).join('') || '<div class="empty">No classes assigned.</div>');
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

  async function auditLogs() {
    const rows = await Api.get('/audit-logs');
    fill(q('[data-body]'), rows.map((x) => `<tr><td>${U.date(x.created_at)}</td><td>${U.esc(x.action)}</td><td>${U.esc(x.entity_type)}</td><td>${U.esc(x.entity_id || '—')}</td><td>${U.esc(x.description || '')}</td></tr>`).join('') || tableEmpty(5, 'No audit history yet.'));
  }

  async function studentFees() {
    const d = await Api.get('/student/dashboard'); const f = await Api.get(`/fees/student/${d.student.id}`);
    fill(q('[data-fees]'), `<div class="g2"><div><div class="muted">Current monthly fee</div><div class="statv">${U.money(f.current_monthly_fee)}</div></div><div><div class="muted">Current status</div><div class="statv">${U.esc(d.current_fee.status)}</div></div></div><div class="table" style="margin-top:18px"><table><tr><th>Month</th><th>Amount</th><th>Status</th><th>Payment Date</th><th>Receipt</th></tr>${(f.history || []).map((h) => `<tr><td>${U.esc(h.month_label)}</td><td>${U.money(h.amount)}</td><td><span class="badge ${h.status === 'PAID' ? 'paid' : h.status === 'DUE' ? 'due' : 'inactive'}">${U.esc(h.status)}</span></td><td>${h.payment_date ? U.date(h.payment_date) : '—'}</td><td>${U.esc(h.receipt_number || '—')}</td></tr>`).join('')}</table></div>`);
  }

  return { auth, dashboard, teachersPage, studentsPage, registerPage, feeStructure, allocationPage, feePayment, receipts, receiptPrint, workPage, studentList, studentFees, teacherStudents, teacherClasses, auditLogs, studentDetails };
})();
