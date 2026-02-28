# MoltOffer Auto-Apply Workflow

Main workflow for applying to LinkedIn jobs using Playwright automation.

---

## Trigger

```
/moltoffer-auto-apply apply      # Apply with confirmation per job
/moltoffer-auto-apply yolo       # Apply without confirmation (YOLO mode)
/moltoffer-auto-apply            # Same as apply
```

---

## Flow

### Step 1: Pre-flight Check

#### 1.1 Verify Setup

Read and verify required files exist:

```
1. Read data/knowledge.json
2. Read ../moltoffer-candidate/persona.md
3. Read ../moltoffer-candidate/credentials.local.json
```

If any missing → Redirect to onboarding:
```
Setup required. Please run: /moltoffer-auto-apply kickoff
```

#### 1.2 Verify LinkedIn Login

```
browser_navigate: https://www.linkedin.com/feed/
browser_snapshot
```

Check for logged-in indicators. If not logged in → Prompt user to log in.

---

### Step 2: Get Jobs to Apply

#### 2.1 Check Pending Jobs

Read `data/pending-jobs.json`:

```json
{
  "jobs": [
    {
      "jobId": "abc123",
      "company": "Company A",
      "title": "Frontend Engineer",
      "linkedinUrl": "https://linkedin.com/jobs/view/123",
      "matchedAt": "2026-02-28T09:00:00Z"
    }
  ],
  "lastUpdated": "2026-02-28T09:00:00Z"
}
```

#### 2.2 If No Pending Jobs

Prompt user to run daily-match:

```
╔═══════════════════════════════════════════════════════════════╗
║  No Pending Jobs                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  No jobs in the queue. Would you like to:                     ║
║                                                               ║
║  1. Run /moltoffer-candidate daily-match to find new jobs     ║
║  2. Add jobs manually                                         ║
╚═══════════════════════════════════════════════════════════════╝
```

Use `AskUserQuestion`:
- **Find new jobs** → Guide to run daily-match, then return
- **Add manually** → Ask for LinkedIn job URLs

#### 2.3 If Has Pending Jobs

Display job summary:

```
╔═══════════════════════════════════════════════════════════════╗
║  Pending Applications: 5 jobs                                  ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  1. [Company A] Frontend Engineer                             ║
║  2. [Company B] React Developer                               ║
║  3. [Company C] Senior Frontend                               ║
║  4. [Company D] UI Engineer                                   ║
║  5. [Company E] Web Developer                                 ║
║                                                               ║
║  Mode: {apply|yolo}                                           ║
╚═══════════════════════════════════════════════════════════════╝
```

---

### Step 3: Application Loop

#### 3.1 Create Session

Initialize a new session in **both** `applied.json` and `logs.json`:

**applied.json session**:
```json
{
  "id": "session-20260228-100000",
  "startedAt": "2026-02-28T10:00:00Z",
  "endedAt": null,
  "mode": "apply",
  "total": 0,
  "successful": 0,
  "needsReview": 0,
  "skipped": 0
}
```

**logs.json session**:
```json
{
  "id": "session-20260228-100000",
  "name": "LinkedIn Auto Apply - 2026-02-28",
  "createdAt": "2026-02-28T10:00:00Z",
  "entries": []
}
```

#### 3.2 Process Each Job

For each job in pending-jobs.json:

**Normal Mode (apply)**:
1. Show job details
2. Ask user for confirmation via `AskUserQuestion`:
   - **Apply** → Execute apply.md workflow
   - **Skip** → Mark as skipped, continue
   - **Stop** → End session
3. Wait 3-5 seconds between jobs

**YOLO Mode**:
1. Log job being processed
2. Execute apply.md workflow
3. Wait 3-5 seconds
4. Continue to next (no confirmation)

#### 3.3 Execute Single Application

For each job, run the apply.md workflow:

```
apply.md(job) → result: {
  status: "applied" | "needs-human-review" | "error",
  reason: "...",
  questionsEncountered: [...]
}
```

#### 3.4 Update Records

After each application:

1. Remove job from pending-jobs.json
2. Add to applied.json:

```json
{
  "jobId": "abc123",
  "company": "Company A",
  "title": "Frontend Engineer",
  "linkedinUrl": "https://linkedin.com/jobs/view/123",
  "appliedAt": "2026-02-28T10:05:00Z",
  "status": "applied",
  "session": "session-20260228-100000"
}
```

3. Update session counters

---

### Step 4: Session Complete

#### 4.1 Finalize Session

Update session in applied.json:

```json
{
  "id": "session-20260228-100000",
  "startedAt": "2026-02-28T10:00:00Z",
  "endedAt": "2026-02-28T10:30:00Z",
  "mode": "apply",
  "total": 5,
  "successful": 4,
  "needsReview": 1,
  "skipped": 0
}
```

#### 4.2 Display Summary

```
╔═══════════════════════════════════════════════════════════════╗
║  Session Complete                                              ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Duration: 30 minutes                                         ║
║  Mode: apply                                                  ║
║                                                               ║
║  Results:                                                     ║
║  ✓ Applied: 4 jobs                                            ║
║  ⚠ Needs Review: 1 job                                        ║
║  ○ Skipped: 0 jobs                                            ║
║                                                               ║
║  Jobs requiring manual review:                                ║
║  - [Company C] Senior Frontend                                ║
║    Reason: External application required                      ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
```

#### 4.3 Suggest Next Steps

Use `AskUserQuestion`:
- **Run another batch** → Check for more pending jobs
- **View full history** → Run `/moltoffer-auto-apply status`
- **Done** → End session

---

## Error Handling

### LinkedIn Session Expired

If during application LinkedIn shows login page:
1. Pause application loop
2. Notify user to re-login
3. Wait for confirmation
4. Resume from current job

### Rate Limiting

If LinkedIn shows "You've reached the limit":
1. Log the error
2. Stop current session
3. Advise user to wait 24 hours

### Network Errors

1. Retry once after 5 seconds
2. If still failing, mark job as needs-review
3. Continue to next job

---

## Session Logging

Throughout the session, log significant actions to `data/logs.json`:

```json
{
  "timestamp": "2026-02-28T10:05:00Z",
  "action": "Starting application for Frontend Engineer at Company A",
  "reason": "Job matches persona criteria",
  "result": null,
  "type": "info"
}
```

**Log these events**:
- Starting application for a job (type: info)
- Filling each form field with reasoning (type: info)
- Skipping a job and why (type: warning)
- Successfully submitting application (type: success)
- Errors or issues encountered (type: error)
- Using assumed answers (type: warning)

**At session end**, update with summary:
```json
{
  "summary": {
    "totalApplications": 5,
    "successful": 4,
    "needsReview": 1,
    "skipped": 0
  }
}
```

---

## Notes

- YOLO mode is meant for high-confidence matches
- Always respect LinkedIn's rate limits
- Jobs marked needs-review should be manually applied
- Knowledge.json is updated with new Q&A during applications
- Logs.json tracks detailed session activity for debugging
