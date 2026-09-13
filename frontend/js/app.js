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
      'admin:fee-structure': () => Page.feeStructure(),
      'admin:fee-payment': () => Page.feePayment(),
      'admin:receipts': () => Page.receipts(),
      'admin:receipt-print': () => Page.receiptPrint(),
      'admin:audit-logs': () => Page.auditLogs(),
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
      'student:fees': () => Page.studentFees()
    };

    const fn = dispatch[`${role}:${page}`];
    if (typeof fn === 'function') await fn();
    else console.warn(`No frontend handler for ${role}:${page}`);
  } catch (error) {
    console.error(error);
    if (window.U?.toast) U.toast(error.message || 'Unable to load this page.', 'error');
  }
});
