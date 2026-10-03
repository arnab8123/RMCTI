# RMCTI Admin AI Assistant

The admin portal now includes **AI Assistance**.

## Enable it

Set these server-side environment variables:

```env
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-6-luna
```

For Render, add them under the service's Environment Variables. Never put the real API key in frontend JavaScript, Git, or a browser-visible file.

## What it understands

The assistant accepts normal questions and shorthand/keywords, including:

- `due` / `fee due` / `dues` → current-month outstanding fees
- `classes today` / `today classes` → today's effective schedule
- `attendance` / `attendence` / `attendance analytics` → attendance data
- `reschedule` / `move class` / `change class time` → schedule operations
- `student` / `teacher` → people search or creation when enough details are provided

## Actions

It can safely execute supported admin actions through backend tools:

- register students
- register teachers
- reschedule a single class occurrence
- change a recurring class time
- read fees, attendance, people and today's schedule

Mutations are performed by Flask, not by the browser, and the existing audit logging is used for created records and schedule changes.

## Important

The AI does not have direct database access from the browser. It only receives the narrowly scoped tools exposed by `/api/admin/ai-assistant`, and that endpoint is admin-authenticated.
