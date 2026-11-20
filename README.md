# Inflekt OS

Static web app (`index.html` + `core.js`), no backend, no paid API. Data lives in a GitHub repo and is synced through the GitHub API. This folder is the **public code repo** (`inflekt-os`); it contains no client data.

```
index.html          the app (Today / Tasks / Capture / Library / Pipeline / Settings)
core.js             brief + recurring-task logic, shared by the app and the 8am Action
scripts/            brief-cli.js + send_mail.py (run by GitHub Actions)
workflow/morning-brief.yml   copy into the DATA repo
```

## One-time setup
1. **Code repo (public):** push this folder to `github.com/<you>/inflekt-os`. Settings > Pages > Deploy from branch `main` / root. Your app URL is `https://<you>.github.io/inflekt-os/`.
2. **Data repo (private, recommended):** push the seed data folder to a new private repo `inflekt-os-data`; add Vishnu and Abhishek as collaborators. If you put data in the public repo instead, client names, revenue, pipeline and meeting notes are world-readable and indexed by Google.
3. **Tokens:** each partner makes a fine-grained GitHub token (data repo only, Contents: read and write) and pastes it into the app's Settings once, with repo name and own name.
4. **8am email:** copy `workflow/morning-brief.yml` to `.github/workflows/` in the data repo. Repo Settings > Secrets and variables > Actions: variable `CODE_REPO` = `<you>/inflekt-os`; secrets `SMTP_USER` (sender Gmail) and `SMTP_PASS` (a Gmail app password; needs 2-step verification). In the app Settings add the recipient emails and the app link. Test via Actions > Morning brief > Run workflow.
5. **Drive import (each partner, own device):**
   - Google Cloud Console > new project > APIs & Services > enable *Google Drive API*.
   - OAuth consent screen: External, *Testing*, add the three partner Gmail addresses as test users. Scope `drive.readonly`.
   - Credentials > OAuth client ID > Web application > Authorized JavaScript origins = `https://<you>.github.io`. Copy the client ID.
   - App Settings > Google Drive: paste client ID and the meeting-notes folder ID (the last part of the folder URL). Capture > Import from Google Drive.
   - In Testing mode Google shows an "unverified app" warning; it is your own app, continue.

## Daily flow
- 8am: the brief arrives by email, and recurring tasks are already created. Open the app, **Copy brief + open WhatsApp group**, paste, send.
- After a meeting: **Capture** > import from Drive or **Pull latest from Granola** > Claude extracts > review > push.
- **Ask Claude** on a task: pick template, edit, send to claude.ai, paste the answer back into the Library.

## Granola
See the table in the chat reply / `GRANOLA.md`.
