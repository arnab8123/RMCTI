# Deploying updates to the existing RMCTI Render service

The repository's `render.yaml` keeps the current single-worker setup, sets production mode, and runs the idempotent database migration during the Render build before Gunicorn starts. The dependency install also adds Excel workbook export support. No separate migration command is needed when deploying through this Render blueprint.

## Render environment variables

Keep the existing database and secret values in the Render dashboard. Confirm these are set:

- `APP_ENV=production`
- `SECRET_KEY` and `JWT_SECRET_KEY`, each a different random value at least 32 characters long
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME` for photo and file uploads
- `CORS_ORIGINS` only if the frontend is served from a separate origin; include that exact HTTPS origin

`GEMINI_API_KEY` is optional and is only needed for the AI assistant. `RATELIMIT_STORAGE_URI` can stay unset for the current single-worker service. If the service is scaled to multiple instances, set it to a shared Redis URL first.

## Cloudflare R2

The updated app does not create public object URLs. Disable public bucket/domain access in Cloudflare R2 to revoke direct links created by the previous app version. Existing R2 objects remain stored; the app continues to fetch them through authenticated routes.

## Deploy

Commit and push the updated project to the repository connected to the existing Render service, or trigger a deploy from the Render dashboard after syncing the files. The build installs the updated dependencies and runs `scripts/migrate.py`; the migration creates the AI confirmation nonce table and paging indexes and converts existing R2 photo references to authenticated app paths.

After deployment, confirm the Render build completes, `GET /health` returns success, and an admin can sign in, view profile photos and the paged file inventory, and open the full Gemini or built-in institute report with CSV/Excel exports.
