---
name: moltoffer-auto-apply
description: "LinkedIn Easy Apply automation. Auto-fill and submit applications using Playwright browser tools. Works with moltoffer-candidate job matches."
emoji: 🚀
user-invocable: true
metadata:
  openclaw:
    requires:
      bins: []
      env: []
    primaryEnv: null
---

# MoltOffer Auto-Apply Skill

Automate LinkedIn Easy Apply submissions using Claude + Playwright browser tools. Reads pending jobs from the MoltOffer API and automatically fills and submits applications based on your persona.md profile.

## Prerequisites

- **moltoffer-candidate** skill must be set up (for persona.md and job matching)
- User must be **logged into LinkedIn** in the browser

## Commands

```
/moltoffer-auto-apply <action>
```

- `/moltoffer-auto-apply` or `/moltoffer-auto-apply kickoff` - First-time setup
- `/moltoffer-auto-apply apply` - Apply to pending jobs (with confirmation for each)
- `/moltoffer-auto-apply yolo` - YOLO mode: Apply to all pending jobs without confirmation
- `/moltoffer-auto-apply status` - View application history and statistics

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      User Workflow                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. /moltoffer-candidate daily-match                        │
│     └── Search & match jobs via MoltOffer API               │
│     └── User confirms jobs to apply                         │
│     └── POST /api/v1/pending-apply-jobs → MoltOffer Platform│
│                                                             │
│  2. /moltoffer-auto-apply apply                             │
│     └── GET /api/v1/pending-apply-jobs ← Fetch from platform│
│     └── Open LinkedIn Easy Apply via Playwright             │
│     └── Auto-fill forms from persona.md                     │
│     └── PATCH /api/v1/pending-apply-jobs/{id} → Update status│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
┌──────────────┐  POST jobs   ┌──────────────┐  GET jobs   ┌──────────────┐
│ moltoffer-   │ ───────────→ │   MoltOffer  │ ←────────── │ moltoffer-   │
│ candidate    │              │   Platform   │             │ auto-apply   │
│ (daily-match)│              │   (API)      │ ←────────── │              │
└──────────────┘              └──────────────┘  PATCH status└──────────────┘
```

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/v1/pending-apply-jobs` | Fetch jobs confirmed for application |
| `PATCH` | `/api/v1/pending-apply-jobs/{id}` | Update job status after application |

**PATCH body:**
```json
{
  "status": "applied",
  "reason": "Success",
  "appliedAt": "2024-01-15T10:30:00Z"
}
```

Status values: `applied`, `skipped`, `needs-human-review`, `error`

## Integration with moltoffer-candidate

| Shared Resource | Path | Purpose |
|-----------------|------|---------|
| Persona | `../moltoffer-candidate/persona.md` | Personal info for form filling |
| API Credentials | `../moltoffer-candidate/credentials.local.json` | MoltOffer API access |

## Execution Flow

### First Time Setup

```
/moltoffer-candidate kickoff   # Set up persona + API key
/moltoffer-auto-apply kickoff  # Verify LinkedIn login
```

### Regular Usage

```
/moltoffer-candidate daily-match    # Find matched jobs
/moltoffer-auto-apply apply         # Apply with confirmation
/moltoffer-auto-apply yolo          # Apply without confirmation
```

### Reference Docs

- [references/onboarding.md](references/onboarding.md) - First-time setup
- [references/workflow.md](references/workflow.md) - Main application workflow
- [references/apply.md](references/apply.md) - Single job application automation

## Core Principles

- **API as source of truth**: Job status tracked via MoltOffer API, no local files
- **Persona-driven**: All form answers inferred from persona.md at application time
- **Rate limiting**: 3-5 second delays between applications
- **Human fallback**: Jobs requiring external application or unclear answers marked as `needs-human-review`

## YOLO Mode

Applies to all pending jobs without confirmation:
- 3-5 second delay between applications
- Stops on critical errors
- Updates status via API after each job

## LinkedIn Specifics

1. **Login required**: User must be logged into LinkedIn before running
2. **Easy Apply only**: Skip jobs that redirect to external sites
3. **Multi-step forms**: Handle forms with multiple pages (Next → Next → Submit)
4. **Unknown questions**: Use reasonable defaults, mark as needs-human-review if cannot determine

## Security Notes

- Never store LinkedIn credentials
- User must log in manually before using this skill
- All automation is client-side via Playwright
