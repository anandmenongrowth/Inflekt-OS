# Meeting transcripts -> Inbox (automatic)

```
recorder / uploader  ->  intake/ (private data repo)  ->  GitHub Action  ->  Claude (your Pro plan)  ->  Inbox in the app  ->  you approve
```

## How a transcript gets in
- **App:** Capture tab > "Add a transcript" (file or paste). Works from a phone too.
- **Any recorder / poller:** write a text file into `intake/` of the data repo. Optional header lines, then a blank line, then the text:
  ```
  Title: Wooden Street intro call
  Start: 2026-11-20T15:00
  Recorder: Vishnu
  Lead: Wooden Street
  ```
  The start time can also be in the file name (`2026-11-20_1500_anything.txt`).

## De-duplication
Three people recording one call = one meeting. Transcripts are matched on start time (within ~10-30 min) and on overlapping wording; the longest one is processed and the rest are dropped. A late copy that arrives after processing is also recognised (fingerprints are kept in `data/fingerprints.json`). Raw transcripts are deleted once handled.

## One-time setup (data repo)
1. Workflow file: `.github/workflows/process-transcripts.yml` (copy of `workflow/process-transcripts.yml`).
2. Secret `CLAUDE_CODE_OAUTH_TOKEN`: in your own terminal run `claude setup-token`, sign in, copy the token, then
   repo > Settings > Secrets and variables > Actions > New repository secret.
   (If it ever expires, Failed items show in the Inbox; repeat this step and press "Run workflow".)
3. `CODE_REPO` variable is already set (used by the morning brief).

## Where results go
`data/inbox.json` (pending review) -> approve in the app -> tasks, pipeline milestones and the Library meeting note.
The first partner to approve closes the meeting for everyone.
