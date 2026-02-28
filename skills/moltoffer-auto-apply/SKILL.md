---
name: moltoffer-auto-apply
description: "LinkedIn Easy Apply automation. Auto-fill and submit applications using Playwright Python script. Works with moltoffer-candidate job matches."
emoji: 🚀
user-invocable: true
metadata:
  openclaw:
    requires:
      bins: ["python3"]
      env: ["ANTHROPIC_API_KEY"]
    primaryEnv: ANTHROPIC_API_KEY
---

# MoltOffer Auto-Apply Skill

Automate LinkedIn Easy Apply submissions using a dedicated Python script with Playwright. This skill reads job matches from moltoffer-candidate and automatically fills and submits applications.

**Token-Efficient Design**: The script handles 90% of browser operations without AI. Claude is only called when encountering new form questions not in knowledge.json.

## Prerequisites

- **moltoffer-candidate** skill must be set up (for persona.md and job matching)
- **Python 3.8+** installed
- **ANTHROPIC_API_KEY** environment variable set
- User must be **logged into LinkedIn** in the browser

## Setup

```bash
# Install dependencies
cd skills/moltoffer-auto-apply/scripts
pip install -r requirements.txt
playwright install chromium
```

## Commands

### Python Script (Recommended - Token Efficient)

```bash
cd skills/moltoffer-auto-apply/scripts

# Apply with confirmation per job
python auto_apply.py

# YOLO mode: Apply without confirmation
python auto_apply.py --yolo

# Limit to N jobs
python auto_apply.py --limit 5

# YOLO mode with limit
python auto_apply.py --yolo --limit 10
```

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
│     └── Auto-fill forms (90% local, 10% AI for new Q&A)     │
│     └── Save results to applied.json                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Token Efficiency

```
┌─────────────────────────────────────────────────────────────┐
│              Python Script Approach                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Browser Automation (No AI tokens):                         │
│  • Navigate to job pages                                    │
│  • Click Easy Apply button                                  │
│  • Fill known form fields from knowledge.json               │
│  • Click Next/Submit buttons                                │
│  • Close modals                                             │
│                                                             │
│  AI Called Only When Needed:                                │
│  • New questions not in knowledge.json                      │
│  • Answers cached for future use                            │
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

# 2. Install Python dependencies
cd skills/moltoffer-auto-apply/scripts
pip install -r requirements.txt
playwright install chromium

# 3. Set API key (for new question inference)
export ANTHROPIC_API_KEY="your-key"
```

See [references/onboarding.md](references/onboarding.md) for setup details.

### Regular Usage

```bash
# 1. Get matched jobs
/moltoffer-candidate daily-match

# 2. Run auto-apply script
cd skills/moltoffer-auto-apply/scripts
python auto_apply.py           # with confirmation
python auto_apply.py --yolo    # without confirmation
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
| `AIAssistant` | Calls Claude API only for unknown questions |
| `ApplicationLogger` | Logs results to applied.json |
| `LinkedInApplier` | Handles Playwright automation |

## Core Principles

- **Token-efficient**: AI called only for new questions not in knowledge.json
- **Persona-driven**: Form answers derived from moltoffer-candidate persona.md
- **Knowledge accumulation**: New form questions and answers saved to knowledge.json
- **Rate limiting**: 3-5 second delays between applications to avoid detection
- **Human fallback**: Jobs requiring manual intervention marked as `needs-human-review`

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
4. **Question inference**: Infer answers from persona when possible

## Security Notes

- Never store LinkedIn credentials
- User must log in manually before using this skill
- All automation is client-side via Playwright
