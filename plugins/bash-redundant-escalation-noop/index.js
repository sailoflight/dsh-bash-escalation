// Standalone DSH plugin (mechanism-level): safe "redundant escalation is a
// no-op" by IN-PLACE injection into the real `bash` tool.
//
// Instead of registering a shadow or a copy, this grabs the actual global
// `bash` definition object held by the tools registry and wraps its
// `execute` method in place. The registry stores that same object reference,
// so every consumer (all agents) sees the wrapper automatically. Nothing is
// copied: schema, description, presentation, timeout, ... all remain the
// original's own live properties, and the wrapper delegates to the captured
// real execute. An upstream update to the real tool can never be stale here,
// because we modify the very object it updates.
//
// The wrapper drops `sandbox_permissions`+`justification` ONLY when the
// requested mode is EQUAL to or NARROWER than the session's effective mode
// (never a real escalation). A GENUINE escalation (requested STRICTLY WIDER)
// is passed through untouched, so the shipped approval flow and
// strict-widening check behave exactly as upstream. Effective mode comes from
// the same `sandboxPolicy` the bash tool uses; if unavailable we DON'T strip
// and fall back to stock behaviour.

export const name = 'bash-redundant-escalation-noop';

// Only needs `tools` (to reach the real bash definition object).
export const inject = ['tools'];

// read-only is the floor and never an escalation target; the two real modes.
const MODE_RANK = { 'read-only': 0, 'workspace-write': 1, 'danger-full-access': 2 };

// Marker so a re-apply / HMR never double-wraps. A stable STRING key (not a
// module-local Symbol) so the marker survives a plugin module reload and still
// prevents wrapping the already-wrapped execute.
const WRAP_KEY = '__dsh_escalation_wrapped__';

export function apply(ctx) {
  try {
    // Grab the ACTUAL global `bash` definition object the registry executes.
    const original = ctx.tools.get('bash');
    if (!original) {
      ctx.logger?.warn?.('[bash-redundant-escalation-noop] bash tool not found; skipping');
      return;
    }
    const realExecute = original.execute;
    if (typeof realExecute !== 'function') {
      ctx.logger?.warn?.('[bash-redundant-escalation-noop] bash has no executable; skipping');
      return;
    }
    if (original[WRAP_KEY]) return; // already wrapped (idempotent across HMR/re-apply)

    const policy = ctx.get('sandboxPolicy');
    const wrapped = async (args, exec) => {
      const clean = { ...args };
      const requested = clean.sandbox_permissions;
      let effectiveMode;
      try {
        effectiveMode = policy
          ? policy.resolve(exec.agent ? { session: exec.agent.session } : {}).mode
          : undefined;
      } catch {
        effectiveMode = undefined;
      }
      // Strip ONLY non-widening requests (requested <= current). Never strip
      // when requested > current: that is a real escalation we hand back to
      // the original (approval + strict-widening check).
      if (
        requested !== undefined &&
        effectiveMode !== undefined &&
        (MODE_RANK[requested] ?? -1) <= (MODE_RANK[effectiveMode] ?? -1)
      ) {
        delete clean.sandbox_permissions;
        delete clean.justification;
      }
      // Delegate to the captured REAL bash execute (never the wrapper).
      return realExecute.call(original, clean, exec);
    };

    // Mutate the single shared object in place: schema/description/
    // presentation/timeout stay the original's own live properties, only
    // execute is wrapped. Set execute first, then the idempotency marker, so
    // a failure between the two leaves the tool unwrapped (retryable).
    original.execute = wrapped;
    Object.defineProperty(original, WRAP_KEY, { value: true });
    ctx.logger?.info?.('[bash-redundant-escalation-noop] wrapped global bash execute in place');
  } catch (error) {
    // Fail-safe: any problem keeps the stock bash untouched.
    ctx.logger?.warn?.(`bash-redundant-escalation-noop: failed, keeping stock bash: ${error instanceof Error ? error.message : String(error)}`);
  }
}
