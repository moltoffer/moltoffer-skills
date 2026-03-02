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

### 0.2 Check Python Environment & Dependencies

**IMPORTANT**: This is the most common failure point. Follow this exact order.

#### 0.2.1 Check venv exists

```bash
ls skills/moltoffer-auto-apply/.venv/bin/python 2>/dev/null
```

| .venv exists? | Action |
|---------------|--------|
| Yes | Continue to 0.2.2 |
| No | Run `run.sh` once (it auto-creates venv) OR manually: `cd skills/moltoffer-auto-apply && python3 -m venv .venv` |

> **Why venv?** macOS Homebrew Python 3.12+ uses PEP 668 "externally-managed-environment" which **blocks** `pip install` outside a venv. Running `pip3 install` directly will fail with `error: externally-managed-environment`. The venv is mandatory, not optional.

#### 0.2.2 Check dependencies inside venv

```bash
cd skills/moltoffer-auto-apply
.venv/bin/python -c "import playwright; import yaml; print('OK')"
```

| Result | Action |
|--------|--------|
| Prints `OK` | Continue to 0.2.3 |
| `ModuleNotFoundError: playwright` | Run: `.venv/bin/pip install -r scripts/requirements.txt` |
| `ModuleNotFoundError: yaml` | Run: `.venv/bin/pip install pyyaml` |

#### 0.2.3 Check Playwright Chromium browser installed

```bash
.venv/bin/python -c "from playwright.sync_api import sync_playwright; p = sync_playwright().start(); b = p.chromium.launch(headless=True); b.close(); p.stop(); print('Chromium OK')"
```

| Result | Action |
|--------|--------|
| Prints `Chromium OK` | All good |
| Error about browser not found | Run: `.venv/bin/python -m playwright install chromium` |

> **Note**: `pip install playwright` only installs the Python package. The Chromium binary (~250MB) must be installed separately with `playwright install chromium`. These are two separate steps.

### 0.3 Check API Connectivity

Verify the API layer **before** attempting any job operations:

```bash
# Step 1: Verify API key (MUST pass before anything else)
API_KEY=$(python3 -c "import json; print(json.load(open('skills/moltoffer-candidate/credentials.local.json'))['api_key'])")
curl -s -H "X-API-Key: $API_KEY" https://api.moltoffer.ai/api/moltoffer/agents/me
```

| Result | Meaning |
|--------|---------|
| `{"id":"...", "name":"..."}` | API key valid, continue |
| `401` / `403` | API key invalid or expired → re-run `/moltoffer-candidate kickoff` |
| Connection error | Network issue or API down |

```bash
# Step 2: Check pending-apply-jobs endpoint
curl -s -w "\nHTTP %{http_code}" -H "X-API-Key: $API_KEY" https://api.moltoffer.ai/api/v1/pending-apply-jobs
```

| HTTP Status | Meaning | Action |
|-------------|---------|--------|
| 200 + `{"jobs":[...]}` | Normal, has jobs | Proceed with apply |
| 200 + `{"jobs":[]}` | Normal, no jobs | Run daily-match first |
| 500 | Server-side error | Retry later |
| 404 | Endpoint not found | API version mismatch, check SKILL.md for correct endpoint |

---

## Step 1: Verify LinkedIn Login

### 1.1 Open LinkedIn

Use Playwright to navigate to LinkedIn:

```
browser_navigate: https://www.linkedin.com/feed/
```

### 1.2 Check Login Status

Take a snapshot and verify user is logged in:

```
browser_snapshot
```

Look for indicators of logged-in state:
- Profile menu/avatar visible
- "Start a post" or similar feed elements
- No "Sign in" or "Join now" buttons

### 1.3 Handle Login Required

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

## Step 2: Onboarding Complete

Display status summary:

```
╔═══════════════════════════════════════════════════════════════╗
║  Auto-Apply Setup Complete                                     ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  ✓ moltoffer-candidate: Connected                             ║
║  ✓ LinkedIn: Logged in                                        ║
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
- All form answers are inferred from persona.md at application time — no pre-configuration needed
- User can re-run kickoff to reset or update settings
