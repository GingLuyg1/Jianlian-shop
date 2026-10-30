import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from '../helpers/payment-session-guard-harness.mjs';

function fixture() {
  const observers = new Set();
  const state = { path: '/account/profile', pages: [], error: false };
  class Observer {
    constructor(callback) { this.callback = callback; }
    observe() { observers.add(this); }
    disconnect() { observers.delete(this); }
  }
  const document = {
    body: {},
    querySelectorAll: () => state.pages.map(page => ({ dataset: { accountPage: page.path }, getAttribute: () => page.busy ? 'true' : 'false' })),
    querySelector: selector => selector === 'main' ? {} : selector === '[data-account-page]' ? state.pages[0] : state.error ? {} : null,
  };
  const api = loadTs('lib/motion/account-page-ready.ts', {}, undefined, { document, window: { location: { get pathname() { return state.path; } } }, MutationObserver: Observer });
  return { ...api, state, observers, update: () => [...observers].forEach(o => o.callback()) };
}

test('old page or a busy target cannot release loading; settled target can', async () => {
  const f = fixture(); const abort = new AbortController(); let released = false;
  f.state.pages = [{ path: '/account/privacy', busy: false }];
  const waiting = f.waitForAccountPageSettled('/account/profile', abort.signal).then(value => { released = value; return value; });
  await Promise.resolve(); assert.equal(released, false);
  f.state.pages = [{ path: '/account/profile', busy: true }]; f.update();
  await Promise.resolve(); assert.equal(released, false);
  f.state.pages[0].busy = false; f.update(); assert.equal(await waiting, true); assert.equal(f.observers.size, 0);
});

test('an aborted superseded wait disconnects and cannot resolve a newer navigation', async () => {
  const f = fixture(); const old = new AbortController();
  const waiting = f.waitForAccountPageSettled('/account/profile', old.signal);
  old.abort(); assert.equal(await waiting, false); assert.equal(f.observers.size, 0);
  const next = new AbortController(); f.state.path = '/account/privacy'; f.state.pages = [{ path: '/account/privacy', busy: false }];
  assert.equal(await f.waitForAccountPageSettled('/account/privacy', next.signal), true);
});

test('a rendered GET failure or module error releases loading without claiming success', async () => {
  const f = fixture(); f.state.pages = [{ path: '/account/profile', busy: false }];
  assert.equal(await f.waitForAccountPageSettled('/account/profile', new AbortController().signal), true);
  f.state.pages = []; f.state.error = true;
  assert.equal(await f.waitForAccountPageSettled('/account/profile', new AbortController().signal), true);
});

test('normal auth redirect releases the overlay only after old account content is gone', async () => {
  const f = fixture(); f.state.path = '/login'; f.state.pages = [{ path: '/account/profile', busy: true }];
  let released = false; const waiting = f.waitForAccountPageSettled('/account/profile', new AbortController().signal).then(v => { released = v; });
  await Promise.resolve(); assert.equal(released, false);
  f.state.pages = []; f.update(); await waiting; assert.equal(released, true);
});

test('a pre-aborted wait adds no observer; catalog and checkout remain out of scope', async () => {
  const f = fixture(), abort = new AbortController(); abort.abort();
  assert.equal(await f.waitForAccountPageSettled('/account', abort.signal), false); assert.equal(f.observers.size, 0);
  for (const path of ['/products/digital-accounts', '/checkout', '/account/orders', '/']) assert.equal(f.isAccountDataPage(path), false);
  for (const path of ['/account', '/account/profile', '/account/security', '/account/privacy', '/account/api']) assert.equal(f.isAccountDataPage(path), true);
});
