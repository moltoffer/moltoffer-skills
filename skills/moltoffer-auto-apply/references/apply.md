# Single Job Application Flow

Detailed Playwright automation for applying to a single LinkedIn Easy Apply job.

---

## Input

```json
{
  "jobId": "abc123",
  "company": "Company A",
  "title": "Frontend Engineer",
  "linkedinUrl": "https://www.linkedin.com/jobs/view/123456789",
  "postedTime": "2026-02-28T08:00:00Z"
}
```

---

## Output

```json
{
  "status": "applied" | "needs-human-review" | "already-applied" | "error",
  "reason": "Success" | "External application required" | "...",
  "questionsEncountered": [
    {
      "question": "Years of React experience",
      "answer": "5",
      "source": "inferred" | "default"
    }
  ]
}
```

---

## Operation Requirements

### 1. Verbose Mode - Explain Every Step

For each action you take, provide a brief explanation of:
- **What** you are about to do
- **Why** you are doing it (the reasoning/basis)
- **What information or rule** you are following

Examples:
- "Filling 'No' for visa sponsorship field because persona.md shows Chinese citizen needing sponsorship"
- "Skipping this job because it requires external application"
- "Filling email as 'john@example.com' from persona.md Basic Info"

### 2. Minimize Operations

Reduce the number of snapshot calls. When you see all input fields visible, fill them all at once using `browser_fill_form` to reduce the total number of operations.

### 3. Information Processing Priority

1. **Prioritize** reading from `../moltoffer-candidate/persona.md` for all personal/resume information
2. **Infer** reasonable assumptions when information is not explicitly in persona.md
3. **Cannot determine** → Mark job as needs-human-review

### 4. Update Status via API

After completing each application, **immediately** call:

```
PATCH /api/v1/pending-apply-jobs/{jobId}
Body: {
  "status": "applied" | "needs-human-review" | "error",
  "reason": "Success" | "External application required" | "...",
  "appliedAt": "<ISO 8601 timestamp>"
}
```

The API is the single source of truth. Do **not** write to local files.

---

## Flow

### Step 1: Navigate to Job Page

```
browser_navigate(linkedinUrl)
browser_wait_for: time=3  # Wait for page load
browser_snapshot
```

#### 1.1 Verify Job Page Loaded

Check snapshot for:
- Job title visible
- Company name visible
- "Easy Apply" or "Apply" button present

If job not found (404 or removed):
```
return {
  status: "error",
  reason: "Job no longer available"
}
```

### Step 2: Check Application Type

Look for these elements in snapshot:

| Element | Meaning | Action |
|---------|---------|--------|
| "Easy Apply" button | LinkedIn native application | Continue to Step 3 |
| "Apply" button (external) | Redirects to company site | Return needs-human-review |
| "Applied" badge | Already applied | Return already-applied |

If external application:
```
return {
  status: "needs-human-review",
  reason: "External application required - redirects to company site"
}
```

If already applied:
```
return {
  status: "already-applied",
  reason: "Previously applied to this job"
}
```

### Step 3: Click Easy Apply

```
browser_snapshot  # Get fresh snapshot
# Find "Easy Apply" button ref
browser_click(ref: "easy-apply-button-ref", element: "Easy Apply button")
browser_wait_for: time=2  # Wait for modal
browser_snapshot
```

### Step 4: Form Processing Loop

LinkedIn Easy Apply forms have multiple steps. Process each step until submission.

```
while true:
    snapshot = browser_snapshot()

    # Analyze current form step
    formFields = analyzeFormFields(snapshot)

    # Fill ALL visible fields at once (minimize operations)
    browser_fill_form(fields: [...all visible fields...])

    # Check for next/submit buttons
    if hasSubmitButton(snapshot):
        clickSubmit()
        break
    elif hasNextButton(snapshot):
        clickNext()
        wait(1)
    elif hasReviewButton(snapshot):
        clickReview()
        wait(1)
    else:
        # Unexpected state
        return error("Unknown form state")
```

### Step 5: Fill Form Fields

For each field type, use appropriate Playwright tool:

#### 5.1 Text Fields

```
browser_type(
  ref: "field-ref",
  text: "answer value",
  element: "Field label description"
)
```

Or batch fill (preferred for efficiency):
```
browser_fill_form(fields: [
  {
    name: "First name",
    type: "textbox",
    ref: "first-name-ref",
    value: "John"
  },
  {
    name: "Email",
    type: "textbox",
    ref: "email-ref",
    value: "john@example.com"
  }
])
```

#### 5.2 Dropdowns/Select

```
browser_select_option(
  ref: "dropdown-ref",
  values: ["Selected Option"],
  element: "Dropdown label"
)
```

#### 5.3 Radio Buttons

```
browser_click(
  ref: "radio-option-ref",
  element: "Radio option label"
)
```

#### 5.4 Checkboxes

```
browser_fill_form(fields: [
  {
    name: "Agree to terms",
    type: "checkbox",
    ref: "checkbox-ref",
    value: "true"
  }
])
```

#### 5.5 File Upload (Resume)

If resume upload required and not pre-filled:
```
browser_file_upload(
  paths: ["/path/to/resume.pdf"]
)
```

**Note**: LinkedIn often has resume on file. Check if already attached before uploading.

### Step 6: Answer Determination

For each question, determine the answer using this priority:

1. **Inference from persona.md** → Read relevant sections and infer
2. **Common defaults** → Use sensible defaults
3. **Cannot determine** → Mark for human review

#### 6.1 Common Question Mappings

| Question Pattern | Persona Source |
|------------------|----------------|
| "years of experience" | Background section |
| "highest education" | Background section |
| "work authorization" | Basic Info (nationality) |
| "visa sponsorship" | Basic Info (nationality) |
| "salary expectation" | Preferences section |
| "notice period" | Preferences section |
| "willing to relocate" | Preferences section |
| "first name" | Basic Info |
| "last name" | Basic Info |
| "email" | Basic Info |
| "phone" | Basic Info |

#### 6.2 Inference Rules

For skill-specific questions like "Years of Python experience":

1. Check persona.md Technical Skills section
2. If skill mentioned with years → use that
3. If skill mentioned without years → use 2 (conservative)
4. If skill not mentioned → use 0

#### 6.3 Default Values

For yes/no questions without clear answer:
- "Willing to..." → Default: Yes
- "Have you been convicted..." → Default: No
- "Authorized to work..." → Check persona, default: Yes
- "Need sponsorship..." → Check persona, default based on nationality

### Step 7: Navigate Form Steps

#### 7.1 Click Next

```
browser_click(
  ref: "next-button-ref",
  element: "Next button"
)
browser_wait_for: time=1
```

#### 7.2 Click Review

Some forms have a "Review" step:
```
browser_click(
  ref: "review-button-ref",
  element: "Review button"
)
browser_wait_for: time=1
```

#### 7.3 Click Submit

```
browser_click(
  ref: "submit-button-ref",
  element: "Submit application button"
)
browser_wait_for: text="Application sent"
```

### Step 8: Verify Submission

After clicking submit:

```
browser_wait_for: time=2
browser_snapshot
```

Check for success indicators:
- "Application sent" message
- "Your application was sent" confirmation
- Success checkmark

If success confirmation found:
```
return {
  status: "applied",
  reason: "Success",
  questionsEncountered: [...]
}
```

### Step 9: Close Modal

**IMPORTANT - Use ESC key for fastest close**:

```
browser_press_key(key: "Escape")
```

**Why ESC is preferred over clicking close button**:
- When using `browser_click` on close buttons (like "Done", "Dismiss"), the tool may wait for:
  - Analytics data to be sent to server
  - Page state updates
  - Multiple event listeners to fire
  - Network requests to complete
- This causes slow response times
- ESC key closes modal immediately without these delays

**Alternative fast close methods** (if ESC doesn't work):
1. **Trigger ESC event via JavaScript**:
   ```
   browser_evaluate(
     function: "() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))"
   )
   ```
2. **Click background overlay** (if modal supports close-on-background-click)

---

## LinkedIn-Specific Notes

### UUID Radio Buttons - Critical

LinkedIn's radio/checkbox buttons' `value` attributes are usually **UUIDs**, not visible text like "Yes"/"No".

If you cannot select radio/checkbox through `browser_click` or CSS selectors, use this approach:

1. **Inspect DOM structure**:
   ```
   browser_evaluate(
     function: "() => { const el = document.querySelector('[name=\"your-field\"]'); return { id: el.id, value: el.value, type: el.type }; }"
   )
   ```

2. **Get element by ID and click**:
   ```
   browser_evaluate(
     function: "() => { const el = document.getElementById('actual-element-id'); el.click(); }"
   )
   ```

3. **Force selection with events** (if click doesn't work):
   ```
   browser_evaluate(
     function: "() => { const el = document.getElementById('element-id'); el.click(); el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('click', { bubbles: true })); }"
   )
   ```

### Hidden Required Fields

Some fields may be hidden until others are filled. Process form in order and re-snapshot after each fill if validation fails.

### Pre-filled Fields

LinkedIn often pre-fills:
- Name
- Email
- Phone
- Resume

Check if field already has value before filling:
```
If field.value is not empty:
    Skip filling
```

### Multiple Resume Options

If LinkedIn shows multiple saved resumes:
1. Check for "most recent" or default
2. Or look for resume matching persona name
3. Select first option if unsure

---

## Error Handling

### Form Validation Errors

If form shows validation errors:
1. Read error messages from snapshot
2. Attempt to fix (e.g., format phone number)
3. If cannot fix, mark needs-human-review

### Unexpected Questions

If encounter a question with no clear answer:
1. Use reasonable default
2. Flag in return for user awareness

### Modal Closes Unexpectedly

If Easy Apply modal closes:
1. Check if application was submitted
2. If not, attempt to reopen
3. If still failing, mark as error

### Timeout

If any step takes >30 seconds:
1. Take screenshot for debugging
2. Mark as needs-human-review
3. Continue to next job

---

## Example: Complete Application

```
# Log: Starting application for Frontend Engineer at Company A (type: info)

1. browser_navigate("https://linkedin.com/jobs/view/123")
   # Reason: Opening job page to check application type

2. browser_wait_for(time=3)
3. browser_snapshot → Find "Easy Apply" button
   # Reason: Verifying this is an Easy Apply job

4. browser_click(ref="easy-apply-btn")
   # Reason: Opening Easy Apply modal

5. browser_wait_for(time=2)
6. browser_snapshot → Form step 1: Contact info
   # Reason: Analyzing form fields to fill

7. browser_fill_form([
     {name: "Phone", type: "textbox", ref: "phone", value: "555-1234"}
   ])
   # Reason: Phone from persona.md Basic Info section

8. browser_click(ref="next-btn")
9. browser_wait_for(time=1)

10. browser_snapshot → Form step 2: Experience questions
11. browser_select_option(ref="years-exp", values=["5"])
    # Reason: 5 years total experience from persona.md Background

12. browser_click(ref="radio-yes", element="Yes, authorized to work")
    # Reason: persona.md Basic Info shows work authorization status

13. browser_click(ref="next-btn")
14. browser_wait_for(time=1)

15. browser_snapshot → Form step 3: Review
16. browser_click(ref="submit-btn", element="Submit application")
    # Reason: All fields complete, submitting application

17. browser_wait_for(text="Application sent")
    # Log: Successfully submitted application (type: success)

18. browser_press_key(key="Escape")
    # Reason: Using ESC for fast modal close

19. return { status: "applied", reason: "Success" }
```
