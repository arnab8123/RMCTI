
(function(){
  const esc=s=>U.esc(String(s??""));
  const money=n=>U.money(Number(n||0));
  async function loadClasses(role){
    const data=await Api.get(role==='teacher'?'/teacher/classes':'/classes');
    return Array.isArray(data)?data:[];
  }
  async function teacherTestsPage(){
    const list=document.querySelector('[data-tests-list]'), form=document.querySelector('#testForm'), qbox=document.querySelector('[data-questions]');
    const classes=await loadClasses('teacher');
    const subjects=await Api.get('/subjects');
    document.querySelector('[name=class_id]').innerHTML=classes.map(c=>`<option value="${c.id}" data-subject="${c.subject_id}">${esc(c.class_name)} · ${esc(c.batch)} · ${esc(c.subject||'')}</option>`).join('');
    document.querySelector('[name=subject_id]').innerHTML=subjects.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
    function addQ(){
      const n=qbox.children.length;
      qbox.insertAdjacentHTML('beforeend',`<div class="card pad question-builder" data-q>
        <div class="right" style="justify-content:space-between"><b>Question ${n+1}</b><button type="button" class="btn danger small" data-remove-q>Remove</button></div>
        <label class="label">Question</label><textarea class="textarea" name="question_text" required></textarea>
        <div class="grid g3"><div><label class="label">Type</label><select class="select" name="question_type"><option value="mcq">MCQ</option><option value="true_false">True/False</option><option value="short_answer">Short answer</option><option value="numerical">Numerical</option><option value="multiple_choice">Multiple choice</option></select></div><div><label class="label">Marks</label><input class="input" name="marks" type="number" min="0.1" step="0.1" value="1"></div><div><label class="label">Correct answer</label><input class="input" name="answer" placeholder="For multiple choice: A,B"></div></div>
        <label class="label">Options (comma separated; leave empty for non-MCQ)</label><input class="input" name="options" placeholder="A, B, C, D">
      </div>`);
    }
    addQ();
    qbox.addEventListener('click',e=>{if(e.target.matches('[data-remove-q]'))e.target.closest('[data-q]').remove()});
    document.querySelector('[data-add-question]').onclick=addQ;
    form.onsubmit=async e=>{
      e.preventDefault();const fd=new FormData(form);const questions=[...qbox.querySelectorAll('[data-q]')].map(q=>{
        const type=q.querySelector('[name=question_type]').value, raw=q.querySelector('[name=answer]').value.trim();
        return {question_text:q.querySelector('[name=question_text]').value,question_type:type,marks:q.querySelector('[name=marks]').value,
          answer:type==='multiple_choice'?raw.split(',').map(x=>x.trim()).filter(Boolean):raw,
          options:q.querySelector('[name=options]').value.split(',').map(x=>x.trim()).filter(Boolean)};
      });
      try{const r=await Api.post('/teacher/tests',{title:fd.get('title'),class_id:Number(fd.get('class_id')),subject_id:Number(fd.get('subject_id')),duration_minutes:Number(fd.get('duration_minutes')),questions});await Api.post(`/teacher/tests/${r.id}/publish`,{});U.toast('Test published');form.reset();qbox.innerHTML='';addQ();render();}catch(x){U.toast(x.message,'error')}
    };
    async function render(){const rows=await Api.get('/teacher/tests');list.innerHTML=rows.map(x=>`<div class="list-row"><div><b>${esc(x.title)}</b><small>${x.duration_minutes} min · ${x.total_marks} marks · ${esc(x.status)}</small></div><span class="badge active">${esc(x.status)}</span></div>`).join('')||'<div class="empty-card">No tests yet.</div>'}
    render();
  }
  async function studentTestsPage(){
    const list=document.querySelector('[data-tests-list]');
    async function render(){const rows=await Api.get('/student/tests');list.innerHTML=rows.map(x=>`<div class="card pad"><div class="right" style="justify-content:space-between"><div><h3>${esc(x.title)}</h3><p class="muted">${x.duration_minutes} min · ${x.total_marks} marks</p></div>${x.result?`<b>${x.result.percentage}%</b>`:`<button class="btn primary" data-start="${x.id}">${x.attempted?'View Result':'Start Test'}</button>`}</div></div>`).join('')||'<div class="empty-card">No tests are currently available.</div>'}
    list.onclick=async e=>{const id=e.target.dataset.start;if(!id)return;try{const t=await Api.get(`/tests/${id}`);const a=await Api.post(`/student/tests/${id}/start`,{});testModal(t,a.id)}catch(x){U.toast(x.message,'error')}};
    async function testModal(t,attemptId){
      const m=U.modal(t.title,`<div id="testArea"><div class="right" style="justify-content:space-between"><span class="badge active">Timed Test</span><b data-timer>--:--</b></div><form id="attemptForm">${t.questions.map((q,i)=>`<div class="card pad" style="margin:12px 0"><b>${i+1}. ${esc(q.question_text)}</b><div style="margin-top:10px">${q.question_type==='mcq'||q.question_type==='true_false'?q.options.map(o=>`<label style="display:block;margin:7px"><input type="${q.question_type==='mcq'?'radio':'radio'}" name="q_${q.id}" value="${esc(o)}"> ${esc(o)}</label>`).join(''):q.question_type==='multiple_choice'?q.options.map(o=>`<label style="display:block;margin:7px"><input type="checkbox" name="q_${q.id}" value="${esc(o)}"> ${esc(o)}</label>`).join():`<input class="input" name="q_${q.id}" type="${q.question_type==='numerical'?'number':'text'}">`}</div></div>`).join('')}<button class="btn primary" type="submit">Submit Test</button></form></div>`);
      let left=t.duration_minutes*60;const timer=m.querySelector('[data-timer]');const interval=setInterval(()=>{left--;timer.textContent=`${Math.floor(Math.max(0,left)/60)}:${String(Math.max(0,left)%60).padStart(2,'0')}`;if(left<=0){clearInterval(interval);m.querySelector('#attemptForm')?.requestSubmit()}},1000);
      m.querySelector('#attemptForm').onsubmit=async e=>{e.preventDefault();clearInterval(interval);const answers={};t.questions.forEach(q=>{const xs=[...m.querySelectorAll(`[name=q_${q.id}]:checked`)];const one=m.querySelector(`[name=q_${q.id}]`);answers[q.id]=q.question_type==='multiple_choice'?xs.map(x=>x.value):(xs[0]?.value ?? one?.value ?? '')});try{const r=await Api.post(`/student/tests/${t.id}/submit`,{answers});m.remove();U.toast(`Score ${r.score}/${t.total_marks} · ${r.percentage}%`);render()}catch(x){U.toast(x.message,'error')}};
    }
    render();
  }
  async function libraryPage(role){
    const list=document.querySelector('[data-materials]'), form=document.querySelector('#materialForm');
    if(role==='student'){const subs=await Api.get('/subjects');const sel=document.querySelector('[name=filter_subject]');if(sel)sel.innerHTML='<option value="">All subjects</option>'+subs.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');}
    if(form){
      const classes=await loadClasses('teacher'), subjects=await Api.get('/subjects');
      form.querySelector('[name=class_id]').innerHTML=classes.map(c=>`<option value="${c.id}">${esc(c.class_name)} · ${esc(c.batch)}</option>`).join('');
      form.querySelector('[name=subject_id]').innerHTML=subjects.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
      form.onsubmit=async e=>{e.preventDefault();try{await Api.uploadFormData('/teacher/study-materials',new FormData(form));U.toast('Material uploaded');form.reset();render()}catch(x){U.toast(x.message,'error')}};
    }
    async function render(){const params={};const s=document.querySelector('[name=filter_subject]')?.value,c=document.querySelector('[name=filter_chapter]')?.value,type=document.querySelector('[name=filter_type]')?.value;if(s)params.subject_id=s;if(c)params.chapter=c;if(type)params.material_type=type;const rows=await Api.get(role==='teacher'?'/teacher/study-materials':'/student/study-materials',params);list.innerHTML=rows.map(x=>`<a class="card pad" href="${esc(x.file_url)}" target="_blank" rel="noopener"><div class="right" style="justify-content:space-between"><div><b>📘 ${esc(x.title)}</b><small>${esc(x.chapter||'General')} · ${esc(x.material_type)} · ${Math.round(x.file_size/1024)} KB</small></div><span class="btn secondary small">Open</span></div></a>`).join('')||'<div class="empty-card">No study material found.</div>'}
    document.querySelectorAll('[data-library-filter]').forEach(x=>x.addEventListener('input',render));render();
  }
  async function adminFeePage(){
    const d=await Api.get('/admin/fee-dashboard');document.querySelector('[data-expected]').textContent=money(d.expected);document.querySelector('[data-collected]').textContent=money(d.collected);document.querySelector('[data-pending]').textContent=money(d.pending);document.querySelector('[data-fine]').textContent=money(d.fine);
    const students=await Api.get('/students');document.querySelector('[name=student_id]').innerHTML=students.map(s=>`<option value="${s.id}">${esc(s.name)} · ${esc(s.student_id)}</option>`).join('');
    document.querySelector('#adjustForm').onsubmit=async e=>{e.preventDefault();try{const fd=new FormData(e.target);await Api.post('/admin/fee-adjustments',{student_id:Number(fd.get('student_id')),fee_month:fd.get('fee_month'),kind:fd.get('kind'),amount:fd.get('amount'),note:fd.get('note')});U.toast('Adjustment saved');e.target.reset();}catch(x){U.toast(x.message,'error')}};
  }
  async function attendanceAnalytics(){const d=await Api.get('/admin/attendance-analytics');document.querySelector('[data-att-week]').textContent=d.this_week+'%';document.querySelector('[data-att-month]').textContent=d.this_month+'%';document.querySelector('[data-present]').textContent=d.present;document.querySelector('[data-absent]').textContent=d.absent;document.querySelector('[data-low]').innerHTML=(d.low_attendance||[]).map(x=>`<div class="list-row"><b>${esc(x.name)}</b><span class="badge pending">${x.percentage}%</span></div>`).join('')||'<div class="empty-card">No students below 75%.</div>'}
  async function teacherPerformance(){const d=await Api.get('/teacher/performance');Object.entries(d).forEach(([k,v])=>document.querySelector(`[data-perf="${k}"]`)&&(document.querySelector(`[data-perf="${k}"]`).textContent=v))}
  async function noticesPage(){
    const list=document.querySelector('[data-notices]'),form=document.querySelector('#noticeForm');
    if(form)form.onsubmit=async e=>{e.preventDefault();try{await Api.post('/admin/notices',Object.fromEntries(new FormData(form)));U.toast('Notice published');form.reset();render()}catch(x){U.toast(x.message,'error')}};
    async function render(){const rows=await Api.get('/notices');list.innerHTML=rows.map(x=>`<article class="card pad"><div class="right" style="justify-content:space-between"><div><span class="badge ${x.priority==='urgent'?'pending':'active'}">${esc(x.notice_type)}</span><h3>${esc(x.title)}</h3></div><small>${esc(x.created_at||'')}</small></div><p>${esc(x.body)}</p>${x.attachment_url?`<a href="${esc(x.attachment_url)}" target="_blank">📎 Attachment</a>`:''}<div class="right" style="justify-content:flex-end"><button class="btn secondary small" data-read="${x.id}" ${x.read?'disabled':''}>${x.read?'Read':'Mark read'}</button></div></article>`).join('')||'<div class="empty-card">No notices.</div>'}
    list.onclick=async e=>{if(e.target.dataset.read){await Api.post(`/notices/${e.target.dataset.read}/read`,{});render()}};render();
  }
  async function securityPage(){const d=await Api.get('/admin/security');document.querySelector('[data-security]').innerHTML=`<h3>Login History</h3><p class="muted">Recent successful logins (30 min): ${d.recent_logins_30m||0}</p>${d.login_history.map(x=>`<div class="list-row"><div><b>User #${x.user_id}</b><small>${esc(x.ip||'unknown')} · ${esc(x.user_agent||'')}</small></div><span>${x.success?'Success':'Failed'}</span></div>`).join('')||'<div class="empty-card">No login history.</div>'}`}
  async function studentRisk(){const rows=await Api.get('/admin/student-risk');document.querySelector('[data-risk]').innerHTML=rows.map(x=>`<div class="list-row"><div><b>⚠ ${esc(x.name)}</b><small>Attendance ${x.attendance}% · Marks ${x.marks_change>0?'+':''}${x.marks_change}% · Fee ${x.fee_overdue?'Overdue':'OK'}</small></div><span class="badge ${x.severity==='high'?'pending':'active'}">${x.severity}</span></div>`).join('')||'<div class="empty-card">No students currently meet the risk rules.</div>';}
  async function assistantPage(){const form=document.querySelector('#assistantForm'),out=document.querySelector('[data-assistant-output]');if(!form)return;form.onsubmit=async e=>{e.preventDefault();out.innerHTML='<div class="loading">Querying RMCTI database…</div>';try{const r=await Api.post('/assistant',{question:new FormData(form).get('question')});out.innerHTML=`<div class="card pad"><b>RMCTI Assistant</b><p>${esc(r.answer)}</p>${r.students?`<div>${r.students.map(x=>`<div class="list-row"><span>${esc(x.name)}</span><b>${x.percentage}%</b></div>`).join('')}</div>`:''}</div>`}catch(x){out.innerHTML=`<div class="empty-card">${esc(x.message)}</div>`}}}
  const page=document.body.dataset.page;
  const f={teacherTestsPage,studentTestsPage,libraryPage,adminFeePage,attendanceAnalytics,teacherPerformance,noticesPage,securityPage,assistantPage};
  if(page==='teacher-tests')teacherTestsPage();
  if(page==='student-tests')studentTestsPage();
  if(page==='teacher-library')libraryPage('teacher');
  if(page==='student-library')libraryPage('student');
  if(page==='admin-fee')adminFeePage();
  if(page==='attendance-analytics')attendanceAnalytics();
  if(page==='teacher-performance')teacherPerformance();
  if(page==='notices')noticesPage();
  if(page==='security')securityPage();
  if(page==='assistant')assistantPage();
  if(page==='student-risk')studentRisk();
})();
