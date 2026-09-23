
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
      'admin:reports': () => Page.reportsPage(),
      'admin:audit-logs': () => Page.auditLogs(),
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
    if (role === 'admin' && !document.querySelector('.mobile-bottom-nav')) {
      const path=location.pathname.split('/').pop();
      const nav=document.createElement('nav');
      nav.className='mobile-bottom-nav';
      nav.innerHTML=`<a href="dashboard.html" class="${path==='dashboard.html'?'active':''}"><span>⌂</span>Home</a><a href="students.html" class="${path==='students.html'?'active':''}"><span>♧</span>Students</a><a href="teachers.html" class="${path==='teachers.html'?'active':''}"><span>♙</span>Teachers</a><a href="teacher-classes.html" class="${path==='teacher-classes.html'?'active':''}"><span>▦</span>Classes</a><a href="fee-payment.html" class="${path==='fee-payment.html'?'active':''}"><span>₹</span>Fees</a>`;
      document.body.appendChild(nav);
    }
    prepareMobileTables();
    if (!window.__rmctiMobileTableObserver) {
      window.__rmctiMobileTableObserver = new MutationObserver(() => prepareMobileTables());
      window.__rmctiMobileTableObserver.observe(document.body, {subtree:true, childList:true});
    }
  } catch (error) {
    console.error(error);
    if (window.U?.toast) U.toast(error.message || 'Unable to load this page.', 'error');
  }
});
