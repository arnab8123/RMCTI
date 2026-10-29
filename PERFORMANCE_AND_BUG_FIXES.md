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

## October 2026 fixes
- Admin attendance history now repairs missed scheduled roll calls in the previous 180 days: students active on the course roster who were assigned by that session date are recorded absent when no mark exists. Any missing rows in an existing session are also filled as absent.
- Admin attendance history allows changing a student's status for a dated session and saving it. A backend admin-only endpoint validates that every currently enrolled student has a present/absent status and records an audit entry.
- Admin notice-board and teacher classwork downloads are served through the authenticated Flask endpoint instead of redirecting the browser to Cloudinary. This avoids cross-origin fetch/blob failures in the frontend and forces file downloads.
- Gemini AI's default overall time budget is increased from 25 to 55 seconds to reduce premature timeout errors during multi-step tool calls. You can override this with `AI_TIME_BUDGET`.
- Extra classes can be scheduled during the current week; the existing backend validates the selected date against its week and still rejects past dates/times.

After deploying, check the Render logs and confirm `GEMINI_API_KEY`, Cloudflare R2 environment variables, and database environment variables are configured. No schema migration is required for these changes.
