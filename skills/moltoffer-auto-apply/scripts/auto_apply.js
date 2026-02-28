#!/usr/bin/env node
/**
 * LinkedIn Easy Apply Automation Script
 *
 * This script automates LinkedIn Easy Apply using Playwright.
 * AI is only called when encountering new questions not in knowledge.json.
 *
 * Usage:
 *   node auto_apply.js [--yolo] [--limit N]
 *
 * Options:
 *   --yolo      Apply without confirmation for each job
 *   --limit N   Maximum number of jobs to apply (default: unlimited)
 */

import { chromium } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as readline from 'readline';
import YAML from 'yaml';

// Paths
const __filename = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(__filename);
const SKILL_DIR = join(SCRIPT_DIR, '..');
const DATA_DIR = join(SKILL_DIR, 'data');
const CANDIDATE_DIR = join(SKILL_DIR, '..', 'moltoffer-candidate');

// Files
const KNOWLEDGE_FILE = join(DATA_DIR, 'knowledge.json');
const APPLIED_FILE = join(DATA_DIR, 'applied.json');
const PENDING_FILE = join(DATA_DIR, 'pending-jobs.json');
const LOGS_FILE = join(DATA_DIR, 'logs.json');
const PERSONA_FILE = join(CANDIDATE_DIR, 'persona.md');
const CREDENTIALS_FILE = join(CANDIDATE_DIR, 'credentials.local.json');

// Helper to read JSON file
function readJSON(filepath, defaultValue = {}) {
  if (!existsSync(filepath)) return defaultValue;
  return JSON.parse(readFileSync(filepath, 'utf-8'));
}

// Helper to write JSON file
function writeJSON(filepath, data) {
  writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

// Helper for user input
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

/**
 * Manages form answers and learns from AI responses.
 */
class KnowledgeBase {
  constructor() {
    this.data = this._load();
  }

  _load() {
    return readJSON(KNOWLEDGE_FILE, {
      version: '1.0',
      commonAnswers: {},
      assumptions: []
    });
  }

  save() {
    writeJSON(KNOWLEDGE_FILE, this.data);
  }

  getAnswer(question) {
    const qLower = question.toLowerCase();

    // Check common answers
    for (const [key, value] of Object.entries(this.data.commonAnswers || {})) {
      if (key.toLowerCase().includes(qLower) || qLower.includes(key.toLowerCase())) {
        return value;
      }
    }

    // Check assumptions
    for (const assumption of this.data.assumptions || []) {
      if ((assumption.question || '').toLowerCase() === qLower) {
        return assumption.assumedAnswer;
      }
    }

    return null;
  }

  addAssumption(question, answer, reasoning) {
    if (!this.data.assumptions) this.data.assumptions = [];
    this.data.assumptions.push({
      question,
      assumedAnswer: answer,
      reasoning,
      timestamp: new Date().toISOString()
    });
    this.save();
    console.log(`  [LEARNED] Q: ${question.substring(0, 50)}... A: ${answer}`);
  }
}

/**
 * Extracts info from persona.md for form filling.
 */
class PersonaInfo {
  constructor() {
    this.raw = '';
    this.frontmatter = {};
    this._load();
  }

  _load() {
    if (!existsSync(PERSONA_FILE)) {
      throw new Error(`Persona file not found: ${PERSONA_FILE}`);
    }

    this.raw = readFileSync(PERSONA_FILE, 'utf-8');

    // Parse YAML frontmatter
    if (this.raw.startsWith('---')) {
      const parts = this.raw.split('---');
      if (parts.length >= 3) {
        this.frontmatter = YAML.parse(parts[1]) || {};
      }
    }
  }

  getInfo(key) {
    // Check frontmatter first
    if (key in this.frontmatter) {
      return String(this.frontmatter[key]);
    }

    // Search in raw content
    const patterns = {
      name: /###\s*Name\s*\n+([^\n]+)/,
      email: /[\w.+-]+@[\w-]+\.[\w.-]+/,
      phone: /\+?[\d\s()-]{10,}/,
      location: /###\s*Current Location\s*\n+([^\n]+)/
    };

    if (key in patterns) {
      const match = this.raw.match(patterns[key]);
      if (match) {
        return match[1] || match[0];
      }
    }

    return null;
  }
}

/**
 * Calls Claude API only when needed for new questions.
 */
class AIAssistant {
  constructor(persona) {
    this.client = null;
    this.persona = persona;
    this._initClient();
  }

  _initClient() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log('[WARN] ANTHROPIC_API_KEY not set. AI assistance disabled.');
      return;
    }
    this.client = new Anthropic({ apiKey });
  }

  async inferAnswer(question, options = null) {
    if (!this.client) {
      return [this._guessDefault(question, options), 'default (AI unavailable)'];
    }

    const prompt = `Based on this candidate profile, answer the following job application question.

CANDIDATE PROFILE:
${this.persona.raw.substring(0, 2000)}

QUESTION: ${question}
${options ? `OPTIONS: ${options.join(', ')}` : ''}

Respond with ONLY the answer value (no explanation). If it's a yes/no question, respond with just "Yes" or "No".
If there are options, respond with the exact option text.
If it's a number, respond with just the number.`;

    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }]
      });
      const answer = response.content[0].text.trim();
      return [answer, 'AI inference'];
    } catch (e) {
      console.log(`  [WARN] AI error: ${e.message}`);
      return [this._guessDefault(question, options), 'default (AI error)'];
    }
  }

  _guessDefault(question, options = null) {
    const qLower = question.toLowerCase();

    // Yes/No defaults
    if (['willing', 'able', 'authorized', 'agree'].some(x => qLower.includes(x))) {
      return 'Yes';
    }
    if (['convicted', 'disability', 'veteran'].some(x => qLower.includes(x))) {
      return 'No';
    }

    // If options provided, pick first one
    if (options && options.length > 0) {
      return options[0];
    }

    // Number defaults
    if (qLower.includes('years') || qLower.includes('experience')) {
      return '3';
    }

    return '';
  }
}

/**
 * Logs application results.
 */
class ApplicationLogger {
  constructor() {
    this.sessionId = `session-${new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)}`;
    this.results = [];
  }

  logResult(job, status, reason) {
    const result = {
      jobId: job.jobId || '',
      company: job.company || '',
      jobTitle: job.title || '',
      linkedinUrl: job.linkedinUrl || '',
      applicationTime: new Date().toISOString(),
      status,
      reason,
      session: this.sessionId
    };
    this.results.push(result);
    this._saveToApplied();
  }

  _saveToApplied() {
    let data = readJSON(APPLIED_FILE, { version: '1.0', applications: [], sessions: [] });
    data.applications.push(this.results[this.results.length - 1]);
    writeJSON(APPLIED_FILE, data);
  }

  printSummary() {
    const applied = this.results.filter(r => r.status === 'applied').length;
    const review = this.results.filter(r => r.status === 'needs-human-review').length;
    const skipped = this.results.filter(r => r.status === 'skipped').length;

    console.log(`\n${'='.repeat(50)}`);
    console.log(`Session Complete: ${this.sessionId}`);
    console.log('='.repeat(50));
    console.log(`  Applied:      ${applied}`);
    console.log(`  Needs Review: ${review}`);
    console.log(`  Skipped:      ${skipped}`);
    console.log(`  Total:        ${this.results.length}`);
  }
}

/**
 * Handles LinkedIn Easy Apply automation.
 */
class LinkedInApplier {
  constructor(page, knowledge, persona, ai) {
    this.page = page;
    this.knowledge = knowledge;
    this.persona = persona;
    this.ai = ai;
  }

  async applyToJob(job) {
    const url = job.linkedinUrl || '';
    if (!url) {
      return ['skipped', 'No LinkedIn URL'];
    }

    console.log(`\n[APPLYING] ${job.company || 'Unknown'} - ${job.title || 'Unknown'}`);
    console.log(`  URL: ${url}`);

    try {
      // Navigate to job page
      await this.page.goto(url, { timeout: 30000 });
      await this.page.waitForTimeout(2000);

      // Check for Easy Apply button
      const easyApplyBtn = this.page.locator("button:has-text('Easy Apply')").first();
      if (!await easyApplyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        return ['needs-human-review', 'No Easy Apply button found'];
      }

      // Check if already applied
      const alreadyApplied = this.page.locator("text='Applied'").first();
      if (await alreadyApplied.isVisible({ timeout: 1000 }).catch(() => false)) {
        return ['skipped', 'Already applied'];
      }

      // Click Easy Apply
      await easyApplyBtn.click();
      await this.page.waitForTimeout(2000);

      // Process form steps
      return await this._processForm();
    } catch (e) {
      if (e.name === 'TimeoutError') {
        return ['needs-human-review', 'Page load timeout'];
      }
      return ['error', e.message];
    }
  }

  async _processForm() {
    const maxSteps = 10;

    for (let step = 0; step < maxSteps; step++) {
      console.log(`  [Step ${step + 1}]`);
      await this.page.waitForTimeout(1000);

      // Fill visible form fields
      await this._fillCurrentFields();

      // Check for submit button
      const submitBtn = this.page.locator("button:has-text('Submit application')").first();
      if (await submitBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await submitBtn.click();
        await this.page.waitForTimeout(2000);

        // Verify success
        const success = this.page.locator("text='Application sent'").first();
        if (await success.isVisible({ timeout: 5000 }).catch(() => false)) {
          await this._closeModal();
          return ['applied', 'Success'];
        } else {
          return ['needs-human-review', 'Submit clicked but no confirmation'];
        }
      }

      // Check for review button
      const reviewBtn = this.page.locator("button:has-text('Review')").first();
      if (await reviewBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await reviewBtn.click();
        await this.page.waitForTimeout(1000);
        continue;
      }

      // Check for next button
      const nextBtn = this.page.locator("button:has-text('Next')").first();
      if (await nextBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await nextBtn.click();
        await this.page.waitForTimeout(1000);
        continue;
      }

      // No navigation button found
      return ['needs-human-review', `Stuck at step ${step + 1}`];
    }

    return ['needs-human-review', 'Too many form steps'];
  }

  async _fillCurrentFields() {
    // Text inputs
    const inputs = await this.page.locator("input[type='text'], input[type='tel'], input[type='email']").all();
    for (const input of inputs) {
      if (await input.isVisible() && !(await input.inputValue())) {
        const label = await this._getFieldLabel(input);
        if (label) {
          const answer = await this._getAnswerForField(label);
          if (answer) {
            await input.fill(answer);
            console.log(`    Filled '${label}': ${answer}`);
          }
        }
      }
    }

    // Dropdowns
    const selects = await this.page.locator('select').all();
    for (const select of selects) {
      if (await select.isVisible()) {
        const label = await this._getFieldLabel(select);
        if (label) {
          const optionElements = await select.locator('option').all();
          const options = await Promise.all(optionElements.map(opt => opt.textContent()));
          const answer = await this._getAnswerForField(label, options);
          if (answer) {
            try {
              await select.selectOption({ label: answer });
              console.log(`    Selected '${label}': ${answer}`);
            } catch (e) {
              // Ignore selection errors
            }
          }
        }
      }
    }

    // Radio buttons - select first in each group
    const radios = await this.page.locator("input[type='radio']").all();
    const radioGroups = new Set();
    for (const radio of radios) {
      if (await radio.isVisible()) {
        const name = await radio.getAttribute('name');
        if (name && !radioGroups.has(name)) {
          radioGroups.add(name);
          const label = await this._getFieldLabel(radio);
          await radio.click();
          console.log(`    Selected radio: ${label || name}`);
        }
      }
    }
  }

  async _getFieldLabel(elem) {
    // Try aria-label
    let label = await elem.getAttribute('aria-label');
    if (label) return label;

    // Try associated label
    const elemId = await elem.getAttribute('id');
    if (elemId) {
      const labelElem = this.page.locator(`label[for='${elemId}']`).first();
      if (await labelElem.isVisible().catch(() => false)) {
        const text = await labelElem.textContent();
        if (text) return text.trim();
      }
    }

    // Try placeholder
    const placeholder = await elem.getAttribute('placeholder');
    if (placeholder) return placeholder;

    return '';
  }

  async _getAnswerForField(question, options = null) {
    // 1. Check knowledge base
    let answer = this.knowledge.getAnswer(question);
    if (answer) return answer;

    // 2. Check persona for common fields
    const qLower = question.toLowerCase();
    if (qLower.includes('email')) {
      return this.persona.getInfo('email') || '';
    }
    if (qLower.includes('phone') && !qLower.includes('country')) {
      return this.persona.getInfo('phone') || '';
    }
    if (qLower.includes('name') && !qLower.includes('first') && !qLower.includes('last')) {
      return this.persona.getInfo('name') || '';
    }

    // 3. Ask AI and learn
    const [inferredAnswer, reasoning] = await this.ai.inferAnswer(question, options);
    if (inferredAnswer) {
      this.knowledge.addAssumption(question, inferredAnswer, reasoning);
    }

    return inferredAnswer;
  }

  async _closeModal() {
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(500);
  }
}

/**
 * Load jobs from pending-jobs.json
 */
function loadPendingJobs() {
  const data = readJSON(PENDING_FILE, { jobs: [] });
  return data.jobs || [];
}

/**
 * Remove a job from pending list
 */
function removeFromPending(jobId) {
  const data = readJSON(PENDING_FILE, { jobs: [] });
  data.jobs = (data.jobs || []).filter(j => j.jobId !== jobId);
  data.lastUpdated = new Date().toISOString();
  writeJSON(PENDING_FILE, data);
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const result = { yolo: false, limit: 0 };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--yolo') {
      result.yolo = true;
    } else if (args[i] === '--limit' && args[i + 1]) {
      result.limit = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return result;
}

/**
 * Main function
 */
async function main() {
  const args = parseArgs();

  console.log('='.repeat(50));
  console.log('LinkedIn Easy Apply Automation');
  console.log('='.repeat(50));

  // Load resources
  let knowledge, persona, ai, logger;
  try {
    knowledge = new KnowledgeBase();
    persona = new PersonaInfo();
    ai = new AIAssistant(persona);
    logger = new ApplicationLogger();
  } catch (e) {
    console.log(`[ERROR] ${e.message}`);
    console.log('Please run /moltoffer-candidate kickoff first.');
    process.exit(1);
  }

  // Load pending jobs
  let jobs = loadPendingJobs();
  if (jobs.length === 0) {
    console.log('\n[INFO] No pending jobs. Run /moltoffer-candidate daily-match first.');
    process.exit(0);
  }

  if (args.limit > 0) {
    jobs = jobs.slice(0, args.limit);
  }

  console.log(`\nFound ${jobs.length} pending jobs.`);
  console.log(`Mode: ${args.yolo ? 'YOLO (no confirmation)' : 'Interactive'}`);

  // Start browser
  console.log('\n[INFO] Launching browser...');
  console.log('[INFO] Please make sure you are logged into LinkedIn!');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to LinkedIn to check login
  await page.goto('https://www.linkedin.com/feed/');
  await page.waitForTimeout(3000);

  if (page.url().includes('login') || page.url().includes('signin')) {
    console.log('\n[WARN] Not logged into LinkedIn!');
    console.log('Please log in manually, then press Enter to continue...');
    await prompt('');
  }

  const applier = new LinkedInApplier(page, knowledge, persona, ai);

  // Process jobs
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    console.log(`\n[${i + 1}/${jobs.length}] Processing...`);

    if (!args.yolo) {
      console.log(`  Company: ${job.company || 'Unknown'}`);
      console.log(`  Title: ${job.title || 'Unknown'}`);
      const response = await prompt('  Apply? [y/n/q]: ');
      if (response === 'q') {
        break;
      }
      if (response !== 'y') {
        logger.logResult(job, 'skipped', 'User skipped');
        continue;
      }
    }

    const [status, reason] = await applier.applyToJob(job);
    logger.logResult(job, status, reason);

    if (status === 'applied') {
      removeFromPending(job.jobId || '');
    }

    console.log(`  Result: ${status} - ${reason}`);

    // Rate limiting
    if (i < jobs.length - 1) {
      const delay = args.yolo ? 3000 : 1000;
      await page.waitForTimeout(delay);
    }
  }

  await browser.close();
  logger.printSummary();
}

main().catch(console.error);
