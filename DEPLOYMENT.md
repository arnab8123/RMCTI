# RMCTI — deployment to the existing Render service

This package is prepared to be copied into the **existing Git repository** connected to the current Render web service. It does not require creating a new Render service or database.

## Before pushing

1. In Render, open the existing `rmcti` web service and confirm it is still connected to the intended Git repository and branch.
2. Back up the existing Aiven/MySQL database before deploying. The build runs `python scripts/migrate.py`, which applies schema/data migrations.
3. In Render → Environment, keep the existing database and secret values. Confirm these keys exist:
   - `APP_ENV=production`
   - `SECRET_KEY` and `JWT_SECRET_KEY` (different random values, each at least 32 characters)
   - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` (needed for R2-backed uploads)
   - `GEMINI_API_KEY` is optional.
4. Do **not** upload the local `.env` file. It is intentionally excluded from this deployment package. Use Render's Environment settings for secrets.

## Update the existing Git repository

1. Extract this ZIP.
2. Copy the **contents** of the extracted `RMCTI` project folder into the root of your existing RMCTI Git working copy, replacing matching project files. Do not create an extra nested `RMCTI/RMCTI` folder.
3. Keep the repository's existing `.git` directory. Do not delete or reinitialize it.
4. Review the changes, then commit and push to the same branch already connected to Render:

   ```bash
   git status
   git add -A
   git commit -m "Prepare RMCTI for production deployment"
   git push
   ```

5. Render should auto-deploy on the push. If auto-deploy is disabled, use **Manual Deploy → Deploy latest commit** on the existing service.

## Render build and start commands

The included `render.yaml` defines:

- Build: `pip install -r requirements.txt && python scripts/migrate.py`
- Start: `gunicorn --workers 1 --threads 4 --timeout 60 --keep-alive 5 backend.app:app`
- Health check: `/health`

The included `runtime.txt` pins Python 3.12.10 for a consistent Render runtime. If the existing service has manually configured commands, confirm they match the commands above before changing them.

## After deployment

1. Wait for the Render deploy to finish successfully.
2. Open `https://YOUR-EXISTING-RMCTI-DOMAIN/health` and confirm it returns JSON with `success: true`.
3. Test the public landing page, admin login, teacher login, student login, file/photo viewing, fee collection, and attendance.
4. Check Render logs for database, R2, or missing-environment-variable errors.

## Important

- This package does not contain your `.env`, `.venv`, or Git metadata.
- It does not create or reset a database and does not change your existing Render service configuration in the dashboard.
- Keep the current Aiven database credentials and secrets unchanged unless you intentionally rotate them.
- Take a database backup before the first deployment because the migration script can alter existing tables and update legacy photo references.
