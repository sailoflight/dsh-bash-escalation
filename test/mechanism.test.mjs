// Regression test for the bash-redundant-escalation-noop mechanism plugin.
// Run:  node test/mechanism.test.mjs   (Node >= 18, plain ESM, no deps)
//
// Guards the exact failure the plugin was improved for: a bash definition
// that appears AFTER apply (a fresh per-agent object mounted by an agent
// preset, invisible to agent/created and tools/change sweeps) must still be
// wrapped the moment it first resolves — the "occasionally degrades to an
// unwrapped bash" regression. Also covers: redundant vs genuine escalation,
// policy-resolution failure (pass-through, never wrong-strip), HMR re-apply
// (fresh wrapper, no chained patches) and dispose (get() restored).
//
// NOTE: the plugin wraps IN PLACE — after wrapping, bash.definition.execute
// IS the wrapper — so every "still wrapped" assertion compares against the
// original execute captured BEFORE apply.

import assert from 'node:assert/strict';
import { apply } from '../plugins/bash-redundant-escalation-noop/index.js';

let failures = 0;
const pending = [];
function check(label, fn) {
  try {
    fn();
    console.log('  ok  ' + label);
  } catch (error) {
    failures++;
    console.error('FAIL  ' + label + '\n      ' + (error && error.message));
  }
}
function checkAwait(label, promise) {
  pending.push(promise.then(
    () => console.log('  ok  ' + label),
    (error) => { failures++; console.error('FAIL  ' + label + '\n      ' + (error && error.message)); },
  ));
}

// ── fakes ──────────────────────────────────────────────────────────────────
function makeRealBash() {
  const calls = [];
  const realExecute = async function (args) {
    calls.push(args);
    return { ok: true };
  };
  return { definition: { execute: realExecute }, calls };
}

// A tools service whose get() lives on a prototype (like the real Service
// class), so deleting our patch restores the original method.
function makeTools() {
  const state = { global: undefined, byAgent: new Map() };
  const proto = {
    get(name, scope) {
      if (name !== 'bash') return void 0;
      return scope === void 0 ? state.global : state.byAgent.get(scope);
    },
  };
  const tools = Object.create(proto);
  return { tools, proto, state };
}

function makeCtx({ tools, defaultMode = 'workspace-write' } = {}) {
  const listeners = new Map();
  const agents = new Set();
  const policy = {
    defaultMode,
    resolve({ session } = {}) {
      if (session && session.throwOnResolve) throw new Error('session broke');
      return { mode: session && session.mode ? session.mode : defaultMode, workspaceRoot: '/ws' };
    },
  };
  const ctx = {
    tools,
    agents: { list: () => [...agents] },
    get(service) { return service === 'sandboxPolicy' ? policy : void 0; },
    logger: { info() {}, warn() {}, debug() {} },
    on(event, cb) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(cb);
    },
    emit(event, payload) { for (const cb of listeners.get(event) ?? []) cb(payload); },
  };
  return ctx;
}

// ── 1. apply wraps the global bash; redundant escalation is stripped ───────
{
  const tools = makeTools();
  const bash = makeRealBash();
  const originalExecute = bash.definition.execute;
  tools.state.global = bash.definition;
  const ctx = makeCtx({ tools: tools.tools });
  apply(ctx);

  check('global bash is wrapped at apply', () => {
    assert.notEqual(tools.tools.get('bash').execute, originalExecute);
  });

  checkAwait('redundant escalation stripped; genuine escalation untouched (sequential)', (async () => {
    // same global bash, executed sequentially so .at(-1) is unambiguous
    await tools.tools.get('bash').execute(
      { command: 'ls', description: 'x', sandbox_permissions: 'workspace-write', justification: 'redundant' },
      {},
    );
    let args = bash.calls.at(-1);
    assert.equal(args.sandbox_permissions, void 0);
    assert.equal(args.justification, void 0);
    assert.equal(args.command, 'ls');

    await tools.tools.get('bash').execute(
      { command: 'ls', description: 'x', sandbox_permissions: 'danger-full-access', justification: 'need it' },
      {},
    );
    args = bash.calls.at(-1);
    assert.equal(args.sandbox_permissions, 'danger-full-access');
    assert.equal(args.justification, 'need it');
  })());

  checkAwait('narrower request under a wider session mode is stripped', (async () => {
    const agentHi = { id: 'hi' };
    const hi = makeRealBash();
    tools.state.byAgent.set(agentHi, hi.definition);
    await tools.tools.get('bash', agentHi).execute(
      { command: 'pwd', description: 'x', sandbox_permissions: 'workspace-write', justification: 'r' },
      { agent: { session: { mode: 'danger-full-access' } } },
    );
    assert.equal(hi.calls.at(-1).sandbox_permissions, void 0);
  })());
}

// ── 2. THE regression: bash mounted AFTER apply, with no events fired ──────
// Simulates the web profile: the plugin applied at boot, then a session
// mounts a preset that registers a FRESH bash object in the agent's scope —
// the agent was neither in agents.list() nor announced, and tools/change
// never fired. The get() patch must still wrap it on first resolution (which
// is exactly what dispatchToolBody does at call time).
{
  const tools = makeTools();
  const g = makeRealBash();
  const gOriginal = g.definition.execute;
  tools.state.global = g.definition;
  const ctx = makeCtx({ tools: tools.tools });
  apply(ctx);

  const lateAgent = { id: 'late' };
  const lateBash = makeRealBash();
  const lateOriginal = lateBash.definition.execute;
  // mount "later" — no event, no agents.list() entry
  tools.state.byAgent.set(lateAgent, lateBash.definition);

  check('late-mounted agent bash is wrapped on first get()', () => {
    assert.notEqual(tools.tools.get('bash', lateAgent).execute, lateOriginal);
  });

  checkAwait('that late bash strips a redundant escalation', (async () => {
    await tools.tools.get('bash', lateAgent).execute(
      { command: 'whoami', description: 'x', sandbox_permissions: 'workspace-write', justification: 'r' },
      { agent: { session: {} } },
    );
    assert.equal(lateBash.calls.at(-1).sandbox_permissions, void 0);
  })());

  // degradation to the GLOBAL bash (a session whose preset has no scoped
  // bash): the global object was wrapped at apply and stays wrapped.
  check('global fallback object stays wrapped through get()', () => {
    assert.notEqual(tools.tools.get('bash').execute, gOriginal);
  });
}

// ── 3. policy resolution failure -> pass through, never wrong-strip ────────
{
  const tools = makeTools();
  const g = makeRealBash();
  tools.state.global = g.definition;
  const ctx = makeCtx({ tools: tools.tools });
  apply(ctx);

  checkAwait('resolve() throw -> args passed through untouched, no crash', (async () => {
    await tools.tools.get('bash').execute(
      { command: 'ls', description: 'x', sandbox_permissions: 'workspace-write', justification: 'r' },
      { agent: { session: { throwOnResolve: true } } },
    );
    assert.equal(g.calls.at(-1).sandbox_permissions, 'workspace-write');
  })());

  checkAwait('no sandboxPolicy service -> pass through', (async () => {
    const toolsB = makeTools();
    const gB = makeRealBash();
    toolsB.state.global = gB.definition;
    const ctxB = makeCtx({ tools: toolsB.tools });
    ctxB.get = () => void 0; // no services at all
    apply(ctxB);
    await toolsB.tools.get('bash').execute(
      { command: 'ls', description: 'x', sandbox_permissions: 'danger-full-access', justification: 'r' },
      { agent: { session: {} } },
    );
    assert.equal(gB.calls.at(-1).sandbox_permissions, 'danger-full-access');
  })());
}

// ── 4. HMR re-apply: fresh wrapper, single patch, no chaining ──────────────
{
  const tools = makeTools();
  const g = makeRealBash();
  const gOriginal = g.definition.execute;
  tools.state.global = g.definition;
  const ctx = makeCtx({ tools: tools.tools });
  apply(ctx);
  const firstWrapper = tools.tools.get('bash').execute;
  const firstGet = tools.tools.get;

  apply(ctx); // simulate the reloaded module re-applying

  check('re-apply replaces the wrapper with a fresh one (no stale closure)', () => {
    assert.notEqual(tools.tools.get('bash').execute, firstWrapper);
  });
  check('re-apply installs a fresh patch (replaces, never chains)', () => {
    assert.notEqual(tools.tools.get, firstGet);
  });
  check('re-apply keeps the marker pointing at the ORIGINAL execute', () => {
    const marker = tools.tools.get('bash').__dsh_escalation_wrapped__;
    assert.equal(marker.real, gOriginal);
  });

  checkAwait('re-applied plugin still strips redundant escalations', (async () => {
    await tools.tools.get('bash').execute(
      { command: 'echo', description: 'x', sandbox_permissions: 'workspace-write', justification: 'r' },
      { agent: { session: {} } },
    );
    assert.equal(g.calls.at(-1).sandbox_permissions, void 0);
  })());

  // after re-apply, ONE dispose still restores the ORIGINAL prototype get
  // (proof the re-patch replaced rather than chained: a chained patch would
  // need two deletes to surface the prototype method).
  ctx.emit('dispose');
  check('dispose after re-apply restores the prototype get() exactly once', () => {
    assert.equal(tools.tools.get, tools.proto.get);
  });
}

// ── 5. dispose restores the original get() ─────────────────────────────────
{
  const tools = makeTools();
  const g = makeRealBash();
  tools.state.global = g.definition;
  const ctx = makeCtx({ tools: tools.tools });
  apply(ctx);
  check('get() is patched while applied', () => {
    assert.notEqual(tools.tools.get, tools.proto.get);
  });
  ctx.emit('dispose');
  check('dispose restores the prototype get()', () => {
    assert.equal(tools.tools.get, tools.proto.get);
  });
  check('dispose clears the patch marker', () => {
    assert.equal(tools.tools.__dsh_escalation_get_patched__, void 0);
  });
  // after dispose a NEW bash object is NOT auto-wrapped (plugin gone)
  const postAgent = { id: 'post' };
  const post = makeRealBash();
  tools.state.byAgent.set(postAgent, post.definition);
  check('after dispose, a new bash resolves unwrapped (plugin truly removed)', () => {
    assert.equal(tools.tools.get('bash', postAgent).execute, post.definition.execute);
  });
}

await Promise.all(pending);
console.log(failures === 0 ? '\nAll mechanism tests passed.' : '\n' + failures + ' test(s) FAILED.');
process.exit(failures === 0 ? 0 : 1);
