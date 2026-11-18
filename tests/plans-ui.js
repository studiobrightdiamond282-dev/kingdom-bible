#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const REF = require('../public/bible-ref.js');
const plansModule = require('../public/reading-plans.js');
const books = require('../public/data/books.json').books;
const app = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
const audit = fs.readFileSync(require.resolve('../public/audit-fix.js'), 'utf8');
const appBlock = app.slice(app.indexOf('function renderPlans(){'), app.indexOf('/* MINISTRY */'));
assert(appBlock.startsWith('function renderPlans(){'), 'the reading-plan UI block must exist');

function makeUi({ progress = {}, customPlans = [] } = {}) {
  const main = { innerHTML: '' };
  let modalHtml = '';
  let opened = null;
  let completeButton = null;
  let deletionButtons = [];
  let planButtons = [];
  let readingButtons = [];
  const state = { planProgress: { ...progress }, customPlans: customPlans.slice() };
  const saved = [];
  const notices = [];
  const customButton = {};
  const bookPlan = [
    { id: 'year', icon: '◫', name: 'Bible in One Year', days: 365, desc: 'The whole Bible.' }
  ];
  const buttons = (selector, html, attribute) => {
    const re = new RegExp(attribute + '="([^"]+)"', 'g');
    const out = [];
    let m;
    while ((m = re.exec(html))) {
      if (selector === '[data-plan-ref]') {
        const i = Number(m[1]);
        const refs = [...html.matchAll(/class="plan-reading-link"[^>]*>[\s\S]*?<span>([^<]+)<\/span>/g)].map(x => x[1]);
        out.push({ dataset: { planRef: String(i) }, textContent: refs[i] || '' });
      } else if (selector === '[data-plan]') out.push({ dataset: { plan: m[1] } });
      else { const id = m[1]; out.push({ getAttribute: key => key === 'data-kb-delplan' ? id : null, onclick: null }); }
    }
    return out;
  };
  const doc = {
    getElementById(id) {
      if (id === 'main') return main;
      if (id === 'customPlan') return customButton;
      if (id === 'completePlanDay') return completeButton || (completeButton = { disabled: /id="completePlanDay" disabled/.test(modalHtml), onclick: null });
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-kb-delplan]') return (deletionButtons = buttons(selector, main.innerHTML, 'data-kb-delplan'));
      return [];
    }
  };
  const ctx = {
    console, document: doc, window: { KingdomPlans: plansModule, KingdomRef: REF },
    URLSearchParams, Date, Math, Number, String, Boolean, Object, Array, Map, Set,
    books, PLANS: bookPlan,
    state,
    $: selector => selector === '#main' ? main : selector === '#customPlan' ? customButton
      : selector === '#completePlanDay' ? doc.getElementById('completePlanDay') : null,
    $$: selector => selector === '[data-plan]' ? (planButtons = buttons(selector, main.innerHTML, 'data-plan'))
      : selector === '[data-plan-ref]' ? (readingButtons = buttons(selector, modalHtml, 'data-plan-ref')) : [],
    setTitle() {}, esc: x => String(x), clamp: (n, lo, hi) => Math.max(lo, Math.min(hi, n)),
    modal: html => { modalHtml = html; completeButton = { disabled: /id="completePlanDay" disabled/.test(html), onclick: null }; }, closeModal: () => { modalHtml = ''; completeButton = null; },
    openReference: ref => { opened = ref; }, save() { saved.push(JSON.parse(JSON.stringify(state))); },
    toast: message => notices.push(message), renderRoute() {}
  };
  vm.createContext(ctx);
  vm.runInContext(appBlock, ctx, { filename: 'reading-plan-ui.js' });
  return { ctx, main, doc, get modalHtml() { return modalHtml; }, get opened() { return opened; },
    get planButtons() { return planButtons; }, get readingButtons() { return readingButtons; },
    get deletionButtons() { return deletionButtons; }, saved, notices, customButton };
}

// Execute the actual plan renderer and day modal, not a copied implementation.
{
  const ui = makeUi();
  ui.ctx.renderPlans();
  assert(ui.main.innerHTML.includes('Bible in One Year'));
  assert(ui.main.innerHTML.includes('data-plan="year"'));
  const start = ui.planButtons[0];
  assert(start, 'the plan card must render a start button');
  start.onclick();
  assert(ui.modalHtml.includes('Genesis 1') && ui.modalHtml.includes('Genesis 2'), 'the day view lists the scheduled chapter references');
  const readingLinks = ui.readingButtons;
  assert(readingLinks.length >= 3, 'a daily plan can expose multiple distinct reading links');
  readingLinks[1].onclick();
  assert.strictEqual(ui.opened, 'Genesis 2', 'a reading link opens its matching passage');
  ui.ctx.openPlan('year');
  ui.ctx.$('#completePlanDay').onclick();
  assert.strictEqual(ui.ctx.state.planProgress.year, 1, 'completing a day advances reading-plan progress');
  assert(ui.main.innerHTML.includes('Continue'), 'progress refresh changes the plan action to Continue');
  assert(ui.notices.includes('Today’s reading marked complete'));
}

// The custom-plan form validates and canonicalizes references before saving.
function customForm(refText) {
  const elements = {
    kbPlanName: { value: 'Faith foundations' },
    kbPlanRefs: { value: refText },
    kbPlanSave: { onclick: null }
  };
  const state = { customPlans: [], planProgress: {} };
  const toasts = [];
  const ctx = {
    window: { KingdomRef: REF }, document: { getElementById: id => elements[id] },
    books, state, Date, String, Array, Math, Number,
    modal() {}, closeModal() {}, save() {}, renderPlans() {}, toast: m => toasts.push(m),
    esc: x => String(x)
  };
  vm.createContext(ctx);
  const start = audit.indexOf('function openCustomPlan()');
  const end = audit.indexOf('function openReminderPlus()', start);
  vm.runInContext(audit.slice(start, end), ctx, { filename: 'custom-plan-form.js' });
  ctx.openCustomPlan();
  elements.kbPlanSave.onclick();
  return { state, toasts };
}
{
  const valid = customForm('Jn 3:16\nPsalm 23');
  assert.strictEqual(valid.state.customPlans.length, 1);
  assert.deepStrictEqual(Array.from(valid.state.customPlans[0].refs), ['John 3:16', 'Psalms 23']);
  assert.strictEqual(valid.state.customPlans[0].days, 2);
  const invalid = customForm('John 999');
  assert.strictEqual(invalid.state.customPlans.length, 0, 'an invalid reference must not be persisted');
  assert(invalid.toasts[0].startsWith('Check this Scripture reference:'));
}

// The actual audit hook handles delete, persists the removal, and clears progress.
{
  const custom = { id: 'custom-test', icon: '◫', name: 'My plan', days: 1, desc: 'Custom plan', refs: ['John 3:16'], custom: true };
  const ui = makeUi({ progress: { 'custom-test': 1 }, customPlans: [custom] });
  const start = audit.indexOf('function seedCustomPlans()');
  const end = audit.indexOf('function openCustomPlan()', start);
  ui.ctx.openCustomPlan = () => {};
  vm.runInContext(audit.slice(start, end), ui.ctx, { filename: 'custom-plan-hooks.js' });
  ui.ctx.hookPlans();
  ui.ctx.renderPlans();
  assert(ui.main.innerHTML.includes('data-kb-delplan="custom-test"'));
  const del = ui.deletionButtons[0];
  assert(del && typeof del.onclick === 'function', 'rendered custom plans have a wired delete button');
  del.onclick({ stopPropagation() {} });
  assert.strictEqual(ui.ctx.state.customPlans.length, 0);
  assert.strictEqual(ui.ctx.PLANS.some(p => p.id === 'custom-test'), false);
  assert.strictEqual(Object.hasOwn(ui.ctx.state.planProgress, 'custom-test'), false);
  assert(ui.notices.includes('Custom plan removed'));
}
console.log('✓ Reading-plan UI opens the right passages, advances progress, validates custom references, and deletes custom plans');
