#!/usr/bin/env python3
"""
LinkedIn Easy Apply Automation Script

This script automates LinkedIn Easy Apply using Playwright.
Unknown questions are logged and the job is marked for human review.

Usage:
    python auto_apply.py [--yolo] [--limit N]

Options:
    --yolo      Apply without confirmation for each job
    --limit N   Maximum number of jobs to apply (default: unlimited)
"""

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import yaml
from playwright.sync_api import Page, sync_playwright, TimeoutError as PlaywrightTimeout

# Paths
SCRIPT_DIR = Path(__file__).parent
SKILL_DIR = SCRIPT_DIR.parent
DATA_DIR = SKILL_DIR / "data"
CANDIDATE_DIR = SKILL_DIR.parent / "moltoffer-candidate"

# Files
KNOWLEDGE_FILE = DATA_DIR / "knowledge.json"
APPLIED_FILE = DATA_DIR / "applied.json"
PENDING_FILE = DATA_DIR / "pending-jobs.json"
LOGS_FILE = DATA_DIR / "logs.json"
PERSONA_FILE = CANDIDATE_DIR / "persona.md"
CREDENTIALS_FILE = CANDIDATE_DIR / "credentials.local.json"


class KnowledgeBase:
    """Manages form answers and learns from AI responses."""

    def __init__(self):
        self.data = self._load()

    def _load(self) -> dict:
        if KNOWLEDGE_FILE.exists():
            return json.loads(KNOWLEDGE_FILE.read_text())
        return {"version": "1.0", "commonAnswers": {}, "assumptions": []}

    def save(self):
        KNOWLEDGE_FILE.write_text(json.dumps(self.data, indent=2, ensure_ascii=False))

    def get_answer(self, question: str) -> Optional[str]:
        """Look up answer for a question."""
        q_lower = question.lower()

        # Check common answers
        for key, value in self.data.get("commonAnswers", {}).items():
            if key.lower() in q_lower or q_lower in key.lower():
                return value

        # Check assumptions
        for assumption in self.data.get("assumptions", []):
            if assumption.get("question", "").lower() == q_lower:
                return assumption.get("assumedAnswer")

        return None

    def add_assumption(self, question: str, answer: str, reasoning: str):
        """Record a new assumed answer."""
        self.data.setdefault("assumptions", []).append({
            "question": question,
            "assumedAnswer": answer,
            "reasoning": reasoning,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        self.save()
        print(f"  [LEARNED] Q: {question[:50]}... A: {answer}")


class PersonaInfo:
    """Extracts info from persona.md for form filling."""

    def __init__(self):
        self.raw = ""
        self.frontmatter = {}
        self._load()

    def _load(self):
        if not PERSONA_FILE.exists():
            raise FileNotFoundError(f"Persona file not found: {PERSONA_FILE}")

        content = PERSONA_FILE.read_text()
        self.raw = content

        # Parse YAML frontmatter
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                self.frontmatter = yaml.safe_load(parts[1]) or {}

    def get_info(self, key: str) -> Optional[str]:
        """Get info from persona."""
        # Check frontmatter first
        if key in self.frontmatter:
            return str(self.frontmatter[key])

        # Search in raw content
        patterns = {
            "name": r"###\s*Name\s*\n+([^\n]+)",
            "email": r"[\w.+-]+@[\w-]+\.[\w.-]+",
            "phone": r"\+?[\d\s()-]{10,}",
            "location": r"###\s*Current Location\s*\n+([^\n]+)",
        }

        if key in patterns:
            match = re.search(patterns[key], self.raw)
            if match:
                return match.group(1) if match.lastindex else match.group(0)

        return None


class UnknownQuestions:
    """Tracks unknown questions that need human answers."""

    def __init__(self):
        self.questions = []

    def add(self, question: str, options: list[str] = None):
        """Record an unknown question."""
        self.questions.append({
            "question": question,
            "options": options,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        print(f"  [UNKNOWN] {question}")
        if options:
            print(f"    Options: {', '.join(options[:5])}")

    def has_unknowns(self) -> bool:
        return len(self.questions) > 0

    def print_summary(self):
        if not self.questions:
            return
        print(f"\n[ACTION REQUIRED] {len(self.questions)} unknown questions need answers:")
        print("Add these to knowledge.json, then re-run the script.\n")
        for q in self.questions:
            print(f"  Q: {q['question']}")
            if q.get('options'):
                print(f"     Options: {', '.join(q['options'][:5])}")


class ApplicationLogger:
    """Logs application results."""

    def __init__(self):
        self.session_id = f"session-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        self.results = []

    def log_result(self, job: dict, status: str, reason: str):
        result = {
            "jobId": job.get("jobId", ""),
            "company": job.get("company", ""),
            "jobTitle": job.get("title", ""),
            "linkedinUrl": job.get("linkedinUrl", ""),
            "applicationTime": datetime.now(timezone.utc).isoformat(),
            "status": status,
            "reason": reason,
            "session": self.session_id
        }
        self.results.append(result)
        self._save_to_applied()

    def _save_to_applied(self):
        data = {"version": "1.0", "applications": [], "sessions": []}
        if APPLIED_FILE.exists():
            data = json.loads(APPLIED_FILE.read_text())

        data["applications"].extend(self.results[-1:])
        APPLIED_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False))

    def print_summary(self):
        applied = sum(1 for r in self.results if r["status"] == "applied")
        review = sum(1 for r in self.results if r["status"] == "needs-human-review")
        skipped = sum(1 for r in self.results if r["status"] == "skipped")

        print(f"\n{'='*50}")
        print(f"Session Complete: {self.session_id}")
        print(f"{'='*50}")
        print(f"  Applied:      {applied}")
        print(f"  Needs Review: {review}")
        print(f"  Skipped:      {skipped}")
        print(f"  Total:        {len(self.results)}")


class LinkedInApplier:
    """Handles LinkedIn Easy Apply automation."""

    def __init__(self, page: Page, knowledge: KnowledgeBase, persona: PersonaInfo, unknown: UnknownQuestions):
        self.page = page
        self.knowledge = knowledge
        self.persona = persona
        self.unknown = unknown
        self.has_unknown_fields = False

    def apply_to_job(self, job: dict) -> tuple[str, str]:
        """Apply to a single job. Returns (status, reason)."""
        url = job.get("linkedinUrl", "")
        if not url:
            return "skipped", "No LinkedIn URL"

        print(f"\n[APPLYING] {job.get('company', 'Unknown')} - {job.get('title', 'Unknown')}")
        print(f"  URL: {url}")

        try:
            # Navigate to job page
            self.page.goto(url, timeout=30000)
            time.sleep(2)

            # Check for Easy Apply button
            easy_apply_btn = self.page.locator("button:has-text('Easy Apply')").first
            if not easy_apply_btn.is_visible(timeout=5000):
                return "needs-human-review", "No Easy Apply button found"

            # Check if already applied
            if self.page.locator("text='Applied'").first.is_visible(timeout=1000):
                return "skipped", "Already applied"

            # Click Easy Apply
            easy_apply_btn.click()
            time.sleep(2)

            # Process form steps
            return self._process_form()

        except PlaywrightTimeout:
            return "needs-human-review", "Page load timeout"
        except Exception as e:
            return "error", str(e)

    def _process_form(self) -> tuple[str, str]:
        """Process multi-step Easy Apply form."""
        max_steps = 10
        self.has_unknown_fields = False

        for step in range(max_steps):
            print(f"  [Step {step + 1}]")
            time.sleep(1)

            # Fill visible form fields
            self._fill_current_fields()

            # If we encountered unknown fields, stop and mark for review
            if self.has_unknown_fields:
                self._close_modal()
                return "needs-human-review", "Unknown questions - add to knowledge.json"

            # Check for submit button
            submit_btn = self.page.locator("button:has-text('Submit application')").first
            if submit_btn.is_visible(timeout=1000):
                submit_btn.click()
                time.sleep(2)

                # Verify success
                if self.page.locator("text='Application sent'").first.is_visible(timeout=5000):
                    self._close_modal()
                    return "applied", "Success"
                else:
                    return "needs-human-review", "Submit clicked but no confirmation"

            # Check for review button
            review_btn = self.page.locator("button:has-text('Review')").first
            if review_btn.is_visible(timeout=1000):
                review_btn.click()
                time.sleep(1)
                continue

            # Check for next button
            next_btn = self.page.locator("button:has-text('Next')").first
            if next_btn.is_visible(timeout=1000):
                next_btn.click()
                time.sleep(1)
                continue

            # No navigation button found
            return "needs-human-review", f"Stuck at step {step + 1}"

        return "needs-human-review", "Too many form steps"

    def _fill_current_fields(self):
        """Fill all visible form fields on current step."""
        # Text inputs
        for input_elem in self.page.locator("input[type='text'], input[type='tel'], input[type='email']").all():
            if input_elem.is_visible() and not input_elem.input_value():
                label = self._get_field_label(input_elem)
                if label:
                    answer = self._get_answer_for_field(label)
                    if answer:
                        input_elem.fill(answer)
                        print(f"    Filled '{label}': {answer}")

        # Dropdowns
        for select in self.page.locator("select").all():
            if select.is_visible():
                label = self._get_field_label(select)
                if label:
                    options = [opt.text_content() for opt in select.locator("option").all()]
                    answer = self._get_answer_for_field(label, options)
                    if answer:
                        try:
                            select.select_option(label=answer)
                            print(f"    Selected '{label}': {answer}")
                        except:
                            pass

        # Radio buttons - select first or infer
        radio_groups = {}
        for radio in self.page.locator("input[type='radio']").all():
            if radio.is_visible():
                name = radio.get_attribute("name")
                if name and name not in radio_groups:
                    radio_groups[name] = radio
                    label = self._get_field_label(radio)
                    # For now, click the radio to select it
                    # TODO: Better logic for choosing options
                    radio.click()
                    print(f"    Selected radio: {label or name}")

    def _get_field_label(self, elem) -> str:
        """Get label text for a form element."""
        # Try aria-label
        label = elem.get_attribute("aria-label")
        if label:
            return label

        # Try associated label
        elem_id = elem.get_attribute("id")
        if elem_id:
            label_elem = self.page.locator(f"label[for='{elem_id}']").first
            if label_elem.is_visible():
                return label_elem.text_content().strip()

        # Try parent label
        parent = elem.locator("xpath=ancestor::label").first
        if parent.count() > 0:
            return parent.text_content().strip()

        # Try placeholder
        placeholder = elem.get_attribute("placeholder")
        if placeholder:
            return placeholder

        return ""

    def _get_answer_for_field(self, question: str, options: list[str] = None) -> Optional[str]:
        """Get answer from knowledge or persona. Returns None if unknown."""
        # 1. Check knowledge base
        answer = self.knowledge.get_answer(question)
        if answer:
            return answer

        # 2. Check persona for common fields
        q_lower = question.lower()
        if "email" in q_lower:
            return self.persona.get_info("email")
        if "phone" in q_lower and "country" not in q_lower:
            return self.persona.get_info("phone")
        if "name" in q_lower and "first" not in q_lower and "last" not in q_lower:
            return self.persona.get_info("name")

        # 3. Unknown question - track it and mark job for review
        self.unknown.add(question, options)
        self.has_unknown_fields = True
        return None

    def _close_modal(self):
        """Close the Easy Apply modal."""
        self.page.keyboard.press("Escape")
        time.sleep(0.5)


def load_pending_jobs() -> list[dict]:
    """Load jobs from pending-jobs.json."""
    if not PENDING_FILE.exists():
        return []
    data = json.loads(PENDING_FILE.read_text())
    return data.get("jobs", [])


def remove_from_pending(job_id: str):
    """Remove a job from pending list."""
    if not PENDING_FILE.exists():
        return
    data = json.loads(PENDING_FILE.read_text())
    data["jobs"] = [j for j in data.get("jobs", []) if j.get("jobId") != job_id]
    data["lastUpdated"] = datetime.now(timezone.utc).isoformat()
    PENDING_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description="LinkedIn Easy Apply Automation")
    parser.add_argument("--yolo", action="store_true", help="Apply without confirmation")
    parser.add_argument("--limit", type=int, default=0, help="Max jobs to apply")
    args = parser.parse_args()

    print("="*50)
    print("LinkedIn Easy Apply Automation")
    print("="*50)

    # Load resources
    try:
        knowledge = KnowledgeBase()
        persona = PersonaInfo()
        unknown = UnknownQuestions()
        logger = ApplicationLogger()
    except FileNotFoundError as e:
        print(f"[ERROR] {e}")
        print("Please run /moltoffer-candidate kickoff first.")
        sys.exit(1)

    # Load pending jobs
    jobs = load_pending_jobs()
    if not jobs:
        print("\n[INFO] No pending jobs. Run /moltoffer-candidate daily-match first.")
        sys.exit(0)

    if args.limit > 0:
        jobs = jobs[:args.limit]

    print(f"\nFound {len(jobs)} pending jobs.")
    print(f"Mode: {'YOLO (no confirmation)' if args.yolo else 'Interactive'}")

    # Start browser
    with sync_playwright() as p:
        print("\n[INFO] Launching browser...")
        print("[INFO] Please make sure you are logged into LinkedIn!")

        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        # Navigate to LinkedIn to check login
        page.goto("https://www.linkedin.com/feed/")
        time.sleep(3)

        if "login" in page.url or "signin" in page.url:
            print("\n[WARN] Not logged into LinkedIn!")
            print("Please log in manually, then press Enter to continue...")
            input()

        applier = LinkedInApplier(page, knowledge, persona, unknown)

        # Process jobs
        for i, job in enumerate(jobs):
            print(f"\n[{i+1}/{len(jobs)}] Processing...")

            if not args.yolo:
                print(f"  Company: {job.get('company', 'Unknown')}")
                print(f"  Title: {job.get('title', 'Unknown')}")
                response = input("  Apply? [y/n/q]: ").strip().lower()
                if response == "q":
                    break
                if response != "y":
                    logger.log_result(job, "skipped", "User skipped")
                    continue

            status, reason = applier.apply_to_job(job)
            logger.log_result(job, status, reason)

            if status == "applied":
                remove_from_pending(job.get("jobId", ""))

            print(f"  Result: {status} - {reason}")

            # Rate limiting
            if i < len(jobs) - 1:
                delay = 3 if args.yolo else 1
                time.sleep(delay)

        browser.close()

    logger.print_summary()
    unknown.print_summary()


if __name__ == "__main__":
    main()
