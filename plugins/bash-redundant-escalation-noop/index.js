// Standalone DSH plugin (mechanism-level): safe "redundant escalation is a
// no-op" by IN-PLACE injection into the `bash` tool that sessions ACTUALLY
// use.
//
// Why agent-scoped, not global:
//   In dsh the `bash` tool a session sees is usually NOT the global one from
//   dsh-base — agent presets (e.g. the built-in `standard`) mount
//   `@deepseek-ai/dsh-tool-bash` in an AGENT-PLANE (scoped) layer that shadows
//   the global tool. Wrapping only `ctx.tools.get('bash')` (global view) has
//   no effect on those sessions. So we wrap the bash resolved per agent:
//   `ctx.tools.get('bash', agent)`, and also the global one for safety.
//
// In-place, not a copy: we mutate the resolved object's `execute` method.
// Schema/description/presentation/timeout stay the original's own live
// properties, and the wrapper delegates to the captured real execute. Nothing
// is registered or copied, so upstream updates can never be stale.
//
// The wrapper drops `sandbox_permissions`+`justification` ONLY when the
// requested mode is EQUAL to or NARROWER than the session's effective mode
// (never a real escalation). A GENUINE escalation (requested STRICTLY WIDER)
// is passed through untouched, so the shipped approval flow and
// strict-widening check behave exactly as upstream.

export const name = 'bash-redundant-escalation-noop';

// Needs `tools` (to reach bash) and `agents` (to iterate/enumerate agents).
export const inject = ['tools', 'agents'];

// read-only is the floor and never an escalation target; the two real modes.
const MODE_RANK = { 'read-only': 0, 'workspace-write': 1, 'danger-full-access': 2 };

// Marker so a re-apply / HMR never double-wraps. A stable STRING key (not a
// module-local Symbol) so the marker survives a plugin module reload.
const WRAP_KEY = '__dsh_escalation_wrapped__';

export function apply(ctx) {
  // Wrap the bash visible to `scope` (undefined = global view, agent = that
  // agent's scoped bash). Returns true if wrapped/already wrapped, false if
  // bash isn't available at that scope yet.
  const wrapBash = (scope) => {
    const bash = ctx.tools.get('bash', scope);
    if (!bash || bash[WRAP_KEY]) return bash !== void 0;
    const realExecute = bash.execute;
    if (typeof realExecute !== 'function') return false;

    const wrapped = async (args, exec) => {
      const clean = { ...args };
      const requested = clean.sandbox_permissions;
      let effectiveMode;
      try {
        // Resolve policy LAZILY at call time (the sandboxPolicy service may
        // not be ready when this plugin applies).
        const policy = ctx.get('sandboxPolicy');
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
      return realExecute.call(bash, clean, exec);
    };

    bash.execute = wrapped;
    Object.defineProperty(bash, WRAP_KEY, { value: true });
    ctx.logger?.info?.('[bash-redundant-escalation-noop] wrapped bash execute in place');
    return true;
  };

  // Sweep every agent's bash + the global bash.
  const sweep = () => {
    wrapBash(void 0);
    for (const agent of ctx.agents.list()) wrapBash(agent);
  };

  try {
    sweep();
    ctx.on('agent/created', ({ agent }) => wrapBash(agent));
    ctx.on('tools/change', sweep);
  } catch (error) {
    // Fail-safe: any problem keeps the stock bash untouched.
    ctx.logger?.warn?.(`bash-redundant-escalation-noop: failed, keeping stock bash: ${error instanceof Error ? error.message : String(error)}`);
  }
}
