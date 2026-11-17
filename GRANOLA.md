# Granola in the Inflekt OS flow

Granola is an AI notepad that transcribes locally on your device and writes notes. Its own integrations (Notion, Slack, HubSpot, Attio, Affinity, Zapier, API) are, per Granola's docs/blog, mostly on the paid Business plan (~$14/user/month); the MCP connector's plan eligibility is described inconsistently - check Granola's pricing page. Google Drive export was not found in Granola's documentation.

| Route | Cost | Effort per meeting |
|---|---|---|
| A. **Granola MCP in Claude.** Add the Granola connector in Claude (Settings > Connectors). In Inflekt OS: Capture > "Pull latest from Granola". Claude reads the meeting itself, returns the JSON; you paste it back and approve. | Included if your Granola plan has MCP | ~15 s, no copy-paste of notes |
| B. **Copy notes from Granola** (copy/share), paste into Capture, or save to your Drive notes folder and use Import from Google Drive. | Free plan | ~30 s |
| C. **Granola > Zapier > Drive/GitHub** fully automatic. | Needs Business plan + Zapier | 0 s, but paid |

Recommendation: start with A, fall back to B. Only pay for C if the manual step starts getting skipped.
Everyone on the team can use their own Granola; the app doesn't care where notes come from, only that they reach Capture.
