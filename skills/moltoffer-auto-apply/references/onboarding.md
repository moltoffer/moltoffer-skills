# MoltOffer Auto-Apply Onboarding

First-time setup for LinkedIn Easy Apply automation.

---

## Step 0: Pre-flight Check

**IMPORTANT**: Always run self-check first before any configuration steps.

### 0.1 Check moltoffer-candidate Setup

Use **Read tool directly** to verify moltoffer-candidate is configured:

```
# Check these files:
1. Read ../moltoffer-candidate/persona.md
2. Read ../moltoffer-candidate/credentials.local.json
```

**Decision Tree**:

| persona.md | credentials.local.json | Action |
|------------|------------------------|--------|
| ✓ Has content | ✓ Has api_key | Continue to Step 0.2 |
| ✗ Missing/Empty | Any | **STOP** - Guide user to run `/moltoffer-candidate kickoff` first |
| ✓ Has content | ✗ Missing | **STOP** - Guide user to run `/moltoffer-candidate kickoff` first |

If moltoffer-candidate not set up:

```
╔═══════════════════════════════════════════════════════════════╗
║  moltoffer-candidate Required                                  ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  This skill requires moltoffer-candidate to be set up first.  ║
║                                                               ║
║  Please run:                                                  ║
║    /moltoffer-candidate kickoff                               ║
║                                                               ║
║  This will:                                                   ║
║  - Create your persona.md profile                             ║
║  - Set up MoltOffer API credentials                           ║
║  - Configure job matching preferences                         ║
║                                                               ║
║  After setup, return here with:                               ║
║    /moltoffer-auto-apply kickoff                              ║
╚═══════════════════════════════════════════════════════════════╝
```

### 0.2 Check Existing Auto-Apply Setup

Read local data files:

```
1. Read data/knowledge.json
2. Read data/applied.json
3. Read data/pending-jobs.json
```

| knowledge.json | applied.json | Action |
|----------------|--------------|--------|
| ✓ Exists | ✓ Exists | Already set up → Skip to Step 3 |
| ✗ Missing | Any | Continue to Step 1 |

---

## Step 1: Initialize Data Files

Create the data directory structure and initial files.

### 1.1 Create knowledge.json

Extract common form answers from persona.md and create initial knowledge base:

```json
{
  "version": "1.0",
  "lastUpdated": "ISO timestamp",
  "commonAnswers": {
    "yearsOfExperience": "",
    "highestEducation": "",
    "visaStatus": "",
    "englishProficiency": "",
    "workAuthorization": "",
    "salaryExpectation": "",
    "noticePeriod": "",
    "willingToRelocate": ""
  },
  "assumptions": []
}
```

**Auto-extract from persona.md**:
- Years of experience → from Background section
- Education → from Background section
- Visa/work authorization → from Basic Info section
- Salary expectations → from Preferences section

### 1.2 Create applied.json

Initialize empty application history:

```json
{
  "version": "1.0",
  "applications": [],
  "sessions": []
}
```

### 1.3 Create pending-jobs.json

Initialize empty job queue:

```json
{
  "version": "1.0",
  "jobs": [],
  "lastUpdated": null
}
```

---

## Step 2: Verify LinkedIn Login

### 2.1 Open LinkedIn

Use Playwright to navigate to LinkedIn:

```
browser_navigate: https://www.linkedin.com/feed/
```

### 2.2 Check Login Status

Take a snapshot and verify user is logged in:

```
browser_snapshot
```

Look for indicators of logged-in state:
- Profile menu/avatar visible
- "Start a post" or similar feed elements
- No "Sign in" or "Join now" buttons

### 2.3 Handle Login Required

If not logged in, display:

```
╔═══════════════════════════════════════════════════════════════╗
║  LinkedIn Login Required                                       ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Please log in to LinkedIn in the browser window.             ║
║                                                               ║
║  I'll wait here. Let me know when you're logged in.           ║
╚═══════════════════════════════════════════════════════════════╝
```

Use `AskUserQuestion` to wait for confirmation:
- **I'm logged in** → Verify again with snapshot
- **I need help** → Provide troubleshooting steps

---

## Step 3: Collect Missing Knowledge

### 3.1 Review Extracted Info

Show user what was extracted from persona.md:

```
╔═══════════════════════════════════════════════════════════════╗
║  Form Auto-Fill Setup                                          ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  I extracted this info from your persona:                     ║
║                                                               ║
║  • Years of Experience: 5 years                               ║
║  • Highest Education: Bachelor's Degree                       ║
║  • Visa Status: (not found)                                   ║
║  • Work Authorization: (not found)                            ║
║                                                               ║
║  Some fields need your input for accurate form filling.       ║
╚═══════════════════════════════════════════════════════════════╝
```

### 3.2 Collect Missing Fields

Use `AskUserQuestion` to collect missing common fields:

**Visa/Work Authorization**:
```
What is your work authorization status?
- US Citizen
- Green Card / Permanent Resident
- Work Visa (H1B, L1, etc.)
- Need Sponsorship
- Other (specify)
```

**Notice Period**:
```
How soon can you start a new role?
- Immediately
- 2 weeks notice
- 1 month notice
- 2+ months notice
```

**Relocation**:
```
Are you willing to relocate?
- Yes, anywhere
- Yes, within country
- No, remote only
- Depends on location
```

### 3.3 Save Knowledge

Update knowledge.json with collected answers:

```json
{
  "version": "1.0",
  "lastUpdated": "2026-02-28T10:00:00Z",
  "commonAnswers": {
    "yearsOfExperience": "5",
    "highestEducation": "Bachelor's Degree",
    "visaStatus": "Need Sponsorship",
    "workAuthorization": "Authorized to work",
    "salaryExpectation": "120000",
    "noticePeriod": "2 weeks",
    "willingToRelocate": "Yes, within country"
  },
  "assumptions": []
}
```

---

## Step 4: Onboarding Complete

Display status summary:

```
╔═══════════════════════════════════════════════════════════════╗
║  Auto-Apply Setup Complete                                     ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  ✓ moltoffer-candidate: Connected                             ║
║  ✓ LinkedIn: Logged in                                        ║
║  ✓ Knowledge base: Initialized                                ║
║                                                               ║
║  Ready to auto-apply!                                         ║
║                                                               ║
║  Next steps:                                                  ║
║  1. Run /moltoffer-candidate daily-match to find jobs         ║
║  2. Run /moltoffer-auto-apply apply to submit applications    ║
╚═══════════════════════════════════════════════════════════════╝
```

Use `AskUserQuestion` to offer next steps:
- **Find jobs now** → Run `/moltoffer-candidate daily-match`
- **I already have matches** → Proceed to apply workflow
- **Done for now** → End session

---

## Notes

- This onboarding only needs to run once
- knowledge.json grows over time as new questions are encountered
- User can re-run kickoff to reset or update settings
