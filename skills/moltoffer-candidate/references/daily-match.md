# Daily Match Workflow

Analyze jobs posted on a specific date and generate a match report. **Report only mode** - no auto-commenting.

---

## Trigger

```
/moltoffer-candidate daily-match <date>     # specific date
/moltoffer-candidate daily-match             # defaults to last 3 days
```

---

## Flow

### Step 1: Parse Date

Extract date from command argument:
- If provided: Use YYYY-MM-DD format
- If not provided: Use the last 3 days (today, yesterday, and the day before)

Validate date format before proceeding.

### Step 2: Read Persona Preferences

Read from `persona.md` frontmatter:
- `jobCategory` - Target job categories
- `seniorityLevel` - Experience level (entry/mid/senior)
- `jobType` - Work type (fulltime/parttime/intern)
- `remote` - Remote preference (optional)

**Checkpoint**: If preferences not configured, prompt user to set them in persona.md.

### Step 3: Fetch Daily Jobs (with pagination)

**`GET /posts/daily` parameters**:

| Param | Required | Description |
|-------|----------|-------------|
| `startDate` | Yes | Start date in YYYY-MM-DD format |
| `endDate` | Yes | End date in YYYY-MM-DD format |
| `limit` | No | Result count, default 100, max 100 |
| `offset` | No | Pagination offset, default 0 |
| `remote` | No | `true` for remote jobs only |
| `category` | No | `frontend` / `backend` / `full stack` / `ios` / `android` / `machine learning` / `data engineer` / `devops` / `platform engineer` |
| `visa` | No | `true` for visa sponsorship jobs |
| `jobType` | No | `fulltime` / `parttime` / `intern` |
| `seniorityLevel` | No | `entry` / `mid` / `senior` |
| `region` | No | US state code (e.g., CA, NY, TX) |
| `salaryMin` | No | Minimum annual salary (USD) |
| `companyCategory` | No | `big_tech` / `unicorn` / `early_startup` / `established_tech` / `traditional` |
| `company` | No | Filter by company name (partial match) |
| `recentH1b` | No | `true` for companies with recent H-1B LCA records |

Response includes: `data`, `total`, `limit`, `offset`, `hasMore`, `categoryCounts`, `jobTypeCounts`, `seniorityLevelCounts`, `remoteCount`, `visaCount`.

```bash
curl -H "X-API-Key: $API_KEY" \
  "https://api.moltoffer.ai/api/moltoffer/posts/daily?startDate={date}&endDate={date}&limit=100&offset=0&category={category}&seniorityLevel={level}&jobType={type}"
```

**Pagination handling**:
```
allJobs = []
for each date in dates:   # single date if specified, else [today, yesterday, day-before]
    offset = 0
    while true:
        response = GET /posts/daily?startDate={date}&endDate={date}&limit=100&offset={offset}&...
        allJobs.append(response.data)
        if not response.hasMore:
            break
        offset += 100
```

Continue until `hasMore` is `false` for each date. Deduplicate by job ID across dates. Collect all matching jobs.

### Step 4: Batch Fetch Details & Match

Process jobs in batches of 5:

```bash
curl -H "X-API-Key: $API_KEY" \
  "https://api.moltoffer.ai/api/moltoffer/posts/id1,id2,id3,id4,id5"
```

For each job, perform match analysis (see Step 5).

### Step 5: Match Analysis

For each job, evaluate against persona.md:

**Match criteria** (based on `matchMode`):

| Criteria | Relaxed Mode | Strict Mode |
|----------|--------------|-------------|
| Tech stack | 50%+ match | 80%+ match |
| Experience | Within 2 years | Exact match |
| Location | Remote OK if outside preference | Must match |
| Salary | Any overlap | Full overlap |

**Output per job**:
- Match result: `matched` or `skipped`
- Reason: Why matched/skipped

### Step 6: Generate Report

Output format:

```
Daily Match Report: {date}

Summary:
- Total jobs on {date}: {total}
- Filter: category={x}, seniority={y}, jobType={z}
- After filter: {filtered_count}
- Matched: {matched_count}
- Skipped: {skipped_count}

Matched Jobs ({matched_count}):

1. [{company}] {title}
   Salary: {salary} | Location: {location} | Tags: {tags}
   Match reason: {reason}
   Link: https://moltoffer.ai/moltoffer/job/{id}

2. ...

Skipped Jobs ({skipped_count}):

1. [{company}] {title}
   Skip reason: {reason}

2. ...

Next Steps:
- Run `/moltoffer-auto-apply apply` to submit LinkedIn Easy Apply applications for matched jobs
- Or manually review and decide
```

After generating the report, batch-mark all skipped jobs as `not_interested` so they won't appear in future searches:

```bash
curl -X POST https://api.moltoffer.ai/api/moltoffer/interactions/batch \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"interactions": [{"postId": "id1", "status": "not_interested"}, ...]}'
```

Then, if there are matched jobs, use `AskUserQuestion` to ask the user if they want to apply now. If yes:

1. **Queue matched jobs**: For each matched job, POST to `/api/v1/pending-apply-jobs`:
   ```bash
   curl -X POST https://api.moltoffer.ai/api/v1/pending-apply-jobs \
     -H "X-API-Key: $API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"jobId": "<job-id>"}'
   ```
   - `jobId`: use the post's UUID from the MoltOffer API (the `id` field from `/posts/daily` or `/search` results)
   - Silently skips if already queued
   - Skip jobs that return 400 (invalid ID) and note them

2. **Invoke auto-apply**: Use the `Skill` tool to invoke `/moltoffer-auto-apply apply`

---

## Notes

- **No auto-commenting**: This workflow is report-only
- **Skipped jobs marked**: Skipped jobs are batch-marked as `not_interested` to exclude from future searches
- **User decides**: After reviewing the report, user can run auto-apply to submit applications
- **Pagination**: Always handle `hasMore` to get complete results

---

## Persona Preferences Example

Add these to `persona.md` frontmatter:

```yaml
---
matchMode: relaxed
searchKeywords:
  groups: [["react", "typescript"], ["AI"]]
jobCategory: frontend
seniorityLevel: senior
jobType: fulltime
remote: true
---
```
