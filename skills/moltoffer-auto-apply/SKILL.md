---
name: moltoffer-auto-apply
description: "LinkedIn Easy Apply automation. Auto-fill and submit applications using Playwright Python script. Works with moltoffer-candidate job matches."
emoji: 🚀
user-invocable: true
metadata:
  openclaw:
    requires:
      bins: ["python3"]
      env: []
    primaryEnv: null
---

# MoltOffer Auto-Apply Skill

Automate LinkedIn Easy Apply submissions using a dedicated Python script with Playwright. This skill reads job matches from moltoffer-candidate and automatically fills and submits applications.

**No API Required**: The script runs entirely locally. Unknown questions are logged for you to add to `knowledge.json`, then re-run.

## Prerequisites

- **moltoffer-candidate** skill must be set up (for persona.md and job matching)
- **Python 3.8+** installed
- User must be **logged into LinkedIn** in the browser

## Commands

### Run Script (Auto-installs dependencies)

```bash
cd skills/moltoffer-auto-apply/scripts

# Apply with confirmation per job
./run.sh

# YOLO mode: Apply without confirmation
./run.sh --yolo

# Limit to N jobs
./run.sh --limit 5

# YOLO mode with limit
./run.sh --yolo --limit 10
```

The script auto-detects Python and installs dependencies on first run.

### Skill Commands

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
│     └── Generate match report (with LinkedIn URLs)          │
│     └── Save to data/pending-jobs.json                      │
│                                                             │
│  2. python auto_apply.py [--yolo] [--limit N]               │
│     └── Read pending-jobs.json                              │
│     └── Open LinkedIn Easy Apply via Playwright             │
│     └── Auto-fill forms from knowledge.json + persona.md    │
│     └── Unknown questions → needs-human-review              │
│     └── Save results to applied.json                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│              No API Required                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Automatic (runs locally):                                  │
│  • Navigate to job pages                                    │
│  • Click Easy Apply button                                  │
│  • Fill fields from knowledge.json + persona.md             │
│  • Click Next/Submit buttons                                │
│  • Close modals                                             │
│                                                             │
│  Unknown Questions:                                         │
│  • Job marked as needs-human-review                         │
│  • Questions logged at end of session                       │
│  • Add answers to knowledge.json, then re-run               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Data Files

| File | Purpose |
|------|---------|
| `data/applied.json` | Application history and session records |
| `data/knowledge.json` | Pre-filled answers for common form questions |
| `data/pending-jobs.json` | Queue of jobs to apply to |
| `data/logs.json` | Detailed session logs for debugging |

## Integration with moltoffer-candidate

This skill **depends on** moltoffer-candidate:

| Shared Resource | Path | Purpose |
|-----------------|------|---------|
| Persona | `../moltoffer-candidate/persona.md` | Personal info for form filling |
| API Credentials | `../moltoffer-candidate/credentials.local.json` | MoltOffer API access |

## Execution Flow

### First Time Setup

```bash
# 1. Ensure moltoffer-candidate is set up
/moltoffer-candidate kickoff

# 2. Run the script (auto-installs dependencies)
cd skills/moltoffer-auto-apply/scripts
./run.sh
```

### If Python Not Installed

When `run.sh` outputs `INSTALL_PYTHON_REQUIRED`, help the user install Python:

**macOS:**
```bash
brew install python3
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install python3 python3-pip
```

**Windows:** Download from https://www.python.org/downloads/

After installation, run `./run.sh` again.

See [references/onboarding.md](references/onboarding.md) for setup details.

### Regular Usage

```bash
# 1. Get matched jobs
/moltoffer-candidate daily-match

# 2. Run auto-apply script
cd skills/moltoffer-auto-apply/scripts
./run.sh           # with confirmation
./run.sh --yolo    # without confirmation
```

### Reference Docs

- [references/onboarding.md](references/onboarding.md) - First-time setup
- [references/workflow.md](references/workflow.md) - Main application workflow
- [references/apply.md](references/apply.md) - Single job application automation

## Script Components

| Class | Purpose |
|-------|---------|
| `KnowledgeBase` | Manages form answers, loads/saves knowledge.json |
| `PersonaInfo` | Extracts info from persona.md for form filling |
| `UnknownQuestions` | Tracks questions that need human answers |
| `ApplicationLogger` | Logs results to applied.json |
| `LinkedInApplier` | Handles Playwright automation |

## Core Principles

- **No API required**: Runs entirely locally, no external calls
- **Persona-driven**: Form answers derived from moltoffer-candidate persona.md
- **Knowledge accumulation**: Add answers to knowledge.json as you encounter new questions
- **Rate limiting**: 3-5 second delays between applications to avoid detection
- **Human fallback**: Jobs with unknown questions marked as `needs-human-review`

## YOLO Mode

YOLO mode enables continuous application without per-job confirmation:
- Applies to all pending jobs in sequence
- 3-5 second delay between applications
- Stops on critical errors
- Logs all results to applied.json

## LinkedIn Specifics

1. **Login required**: User must be logged into LinkedIn before running
2. **Easy Apply only**: Skip jobs that redirect to external sites
3. **Multi-step forms**: Handle forms with multiple pages (Next → Next → Submit)
4. **Unknown questions**: Jobs with new questions marked for review, questions logged for you to add to knowledge.json

## Security Notes

- Never store LinkedIn credentials
- User must log in manually before using this skill
- All automation is client-side via Playwright
