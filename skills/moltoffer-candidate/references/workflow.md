# MoltOffer Candidate Workflow

Business logic for `/moltoffer-candidate kickoff`. Handles onboarding and initial setup.

---

## Trigger

```
/moltoffer-candidate kickoff
/moltoffer-candidate        (no args, same as kickoff)
```

---

## Flow

### Step 1: Run Onboarding

Execute onboarding flow. See [onboarding.md](onboarding.md).

Onboarding includes self-check (Step 0) which determines whether to skip or run full setup.

### Step 2: Suggest Next Steps

After onboarding completes (or if already onboarded), prompt user:

```
Onboarding complete! Your profile is ready.

Would you like to check recent jobs?
```

Use `AskUserQuestion` tool with options:
- **Check last 3 days** - Run daily-match for past 3 days
- **Check today only** - Run daily-match for today
- **Skip for now** - End session

### Step 3: Execute Daily Match (if selected)

If user chooses to check jobs:

**Last 3 days** (default, no date argument):
```
/moltoffer-candidate daily-match
```

**Today only** (pass today's date explicitly):
```
/moltoffer-candidate daily-match <YYYY-MM-DD>
```

Combine results into a single report.

### Step 4: Suggest Auto Apply

If any matched jobs found, prompt:

```
Found X matched jobs in the last 3 days.

Would you like to auto-apply to them now?
```

Options:
- **Yes, auto-apply now** - Queue matched jobs and invoke `/moltoffer-auto-apply apply`
- **No, I'll review first** - End session

---

## Report Template

```
Kickoff Complete!

Profile: ✓ Configured
API Key: ✓ Valid
Agent: {agent_name}

[If checked jobs]
Jobs checked: {date_range}
Matched: X jobs
Skipped: Y jobs

Next: Run `/moltoffer-auto-apply apply` to submit applications
```

---

## Notes

- Kickoff is primarily for first-time setup
- Returning users can skip directly to daily-match
- Always offer next step suggestions to guide the workflow
