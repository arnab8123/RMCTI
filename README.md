# Tuition Institute Management System

A full-stack tuition/coaching institute management system using HTML5, CSS3, Vanilla JavaScript, Python REST APIs, and MySQL. It follows the supplied specification for three separate role portals and keeps the frontend framework-free. 

## Portals
- Admin: teachers, students, classes/allocation, fee structures, payment collection, receipts, audit history.
- Teacher: dashboard, assigned students/classes, homework, classwork.
- Student: dashboard, weekly routine, homework, classwork, assigned teacher, read-only fee history.

## Stack
- Frontend: HTML5 + CSS3 + Vanilla JavaScript
- Backend: Flask REST API
- Database: MySQL
- Auth: JWT access tokens with bcrypt password hashes

## Project structure

```text
tuition-management-system/
├── frontend/
│   ├── admin/
│   ├── teacher/
│   ├── student/
│   ├── css/
│   └── js/
├── backend/
├── database/database.sql
├── scripts/seed_admin.py
├── requirements.txt
├── .env.example
└── README.md
```

## 1. Requirements
Python 3.11+ is recommended. Install MySQL 8.x or a compatible MySQL server.

## 2. Create the database

```bash
mysql -u root -p < database/database.sql
```

The schema creates the `tuition_management` database and the required tables, indexes, foreign keys, unique constraints, status fields, timestamps, and audit records.

## 3. Configure environment variables

```bash
cp .env.example .env
```

Set the MySQL username/password and a strong `SECRET_KEY` in `.env`. Never commit `.env` with real credentials.

## 4. Install backend dependencies

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

On Windows PowerShell use `.venv\\Scripts\\Activate.ps1`.

## 5. Create the first admin

```bash
python scripts/seed_admin.py
```

The script prompts for the admin name, username and password. The password is bcrypt-hashed before storage.

## 6. Start the API

From the project root:

```bash
python -m backend.app
```

The API listens on `http://127.0.0.1:5000` by default. Health check: `GET /health`.

## 7. Serve the frontend

Because the frontend calls the REST API from a browser, serve it through a local HTTP server rather than `file://`:

```bash
cd frontend
python -m http.server 5500
```

Open `http://127.0.0.1:5500/login.html`.

## Authentication flow
1. Login at `login.html`.
2. The backend validates the account and returns a JWT.
3. The frontend stores the token in `sessionStorage`.
4. Each API request sends `Authorization: Bearer <token>`.
5. The backend checks the authenticated user and required role for every protected route.
6. A teacher is limited to their assigned classes/students and cannot access admin endpoints.
7. A student is limited to their own routine, homework, classwork, teacher information, and fee information.

## Dark mode
`frontend/css/variables.css` contains the central CSS variable system. The frontend detects the browser color preference on first load, then stores any manual theme choice in `localStorage`. The same variables are used for light/dark UI surfaces, text, borders, status badges and controls.

## Fee workflow
1. Admin creates a fee structure for a class.
2. The monthly fee becomes a calculated due amount for enrolled students.
3. Admin searches the student and selects the fee month.
4. A payment is recorded only once for a student/month and the payment amount is validated against the applicable fee structure.
5. A receipt record is generated and the printable receipt page can be opened.
6. Students can see the resulting PAID/DUE status and receipt number but cannot make payments.

## Historical records
Teacher and student unregister operations use inactive status and deactivate active allocations instead of destroying the underlying records. This preserves historical fee, receipt, homework, classwork, and schedule information.

## API groups
- `/api/auth/*`
- `/api/admin/dashboard`
- `/api/teachers*`
- `/api/students*`
- `/api/classes*`
- `/api/teacher-classes*`
- `/api/fee-structures*`
- `/api/fees*`
- `/api/receipts*`
- `/api/teacher/*`
- `/api/homework*`
- `/api/classwork*`
- `/api/student/*`
- `/api/audit-logs`

## Security notes
- Passwords are never stored in plaintext.
- ORM queries are used instead of raw SQL for application operations.
- JSON error responses intentionally avoid exposing internal database/Python tracebacks.
- Server-side role checks are authoritative; client-side page checks are only a navigation convenience.
- Form inputs are validated in the API and user-generated text is HTML-escaped when rendered.

## Current implementation scope
The supplied specification focuses its detailed workflow on routines/class schedules rather than defining a separate attendance schema or attendance screens. Therefore this implementation includes scheduling/routines but does not invent an attendance workflow that was not specified.
