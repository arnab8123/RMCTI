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


## November 2026 — responsiveness pass

- Added an 8-second in-tab GET response cache with in-flight request deduplication. All JSON write requests and uploads invalidate it, so normal edits and fee payments are reflected immediately after a write.
- Notification polling uses a shorter 2.5-second cache window.
- Changed student dropdown/recipient-picker requests in Fee Collection and attachment targeting to use the existing lightweight `select=1` API mode. These pickers no longer load parent details, class memberships, or fee histories for every student.
- Added a bounded 8-second process-local cache for bulk historical fee calculations. The cache is keyed by the exact sorted student-ID set, returns copies to callers, expires automatically, and does not write to or alter fee records.
- Added idempotent covering indexes for fee-month/payment-date aggregation, active class/subject lookups, and class/target-date schedule exception lookups.
- Kept the existing one-worker/four-thread Gunicorn configuration. Increasing worker count on Render's free instance without measuring memory can cause restarts or out-of-memory failures.

### Performance notes

The application still uses the existing Render free instance and external Aiven database. Cold-start delays from a sleeping free instance and network latency to Aiven cannot be eliminated by application code alone. The first uncached request can also still be expensive for very large historical fee datasets. Use Render request logs and browser Network timings after deployment to confirm the remaining bottleneck before changing hosting tiers or database regions.
