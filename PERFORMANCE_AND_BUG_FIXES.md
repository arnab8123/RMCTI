# RMCTI Performance & Bug Fixes

## Fixed bugs
- Fixed an undefined `credit` variable in the fee-balance engine. It now correctly exposes remaining carry-forward credit.
- Preserved the existing partial-payment, fine, and session-specific attendance logic while removing avoidable repeated database work.

## Backend performance
- Added a batched effective-schedule resolver for dashboards/routines.
- Admin dashboard no longer executes the schedule resolver once per active class.
- Teacher dashboard schedule loading is batched across all assigned classes.
- Student dashboard and weekly routine schedule loading are batched.
- Teacher "My Classes" now batches active-student counts and attendance counts instead of querying them per class/session.
- Admin notification polling no longer rebuilds the complete fee dataset every 60 seconds; it only loads notification data the dashboard actually uses.
- Added schedule-exception indexes for weekly/teacher and date-based lookups.
- Existing performance-index migration remains safe to run repeatedly through `scripts/migrate.py`.

## Frontend / delivery performance
- Removed four unused multi-megabyte duplicate image assets.
- Reduced the main RMCTI logo from roughly 282 KB to roughly 75 KB.
- Reduced the Est. 2019 image from roughly 76 KB to roughly 54 KB.
- Added lazy loading and asynchronous decoding to portal/landing-page images.
- Increased static asset caching to one year; the project's versioned CSS/JS query strings allow updated assets to be fetched when versions change.

## Verification
- Python syntax compilation passed for backend and migration scripts.
- JavaScript syntax checks passed for all frontend JS files.


## RMCTI Ultra feature update · 2026-09-29

Added:
- Teacher online tests: MCQ, true/false, short answer, numerical, multiple choice; timed attempts and server-side scoring.
- Student online-test result summary with score, percentage, correct/wrong answers and time taken.
- Teacher/student Study Material Library with subject/chapter/type filters and Cloudinary-backed uploads.
- Advanced fee dashboard and fee adjustments for discounts, scholarships, installments, custom/admission/exam/registration/material fees, refunds, advances, carry-forward and fines.
- Attendance analytics with automatic <75% attention flags.
- Teacher performance dashboard.
- Notice Board 2.0 with targeting, priority, expiry and read tracking.
- Security dashboard with login history and failed-login visibility plus account enable/disable.
- Database-backed RMCTI Assistant for fee, attendance and homework questions.
- Professional receipt PDF endpoint and WhatsApp sharing action.
- Admin dashboard fee summary changed from full historical fee recalculation to bounded current-month SQL aggregation, while detailed fee history remains unchanged.
- New Ultra tables are created automatically by `scripts/migrate.py` during the Render build.
- Increased default request limit to 20 MB for study-material uploads.
