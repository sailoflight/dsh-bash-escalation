// Standalone DSH plugin (mechanism-level): safe "redundant escalation is a
// no-op" by wrapping the `bash` execute that sessions ACTUALLY use.
//
// Why wrap-on-access, not wrap-on-discovery:
//   In dsh the `bash` a session sees is not a single stable object. The web
//   surface disables the global tool-bash row and each session mounts an agent
//   preset that registers a FRESH bash definition (defineTool) into that
//   agent's scope layer; tui/headless keep the process-global one. Objects
//   appear and disappear at runtime — session creation, preset (re)mount, HMR
//   re-registration — so wrapping only the objects visible at apply /
//   agent-created / tools/change time occasionally misses one: at
//   `agent/created` the preset's bash may not be mounted yet (we grab the
//   inherited/global object), and a `tools/change` sweep only covers agents
//   already in `agents.list()`. When the session's effective bash then
//   degrades to that unwrapped object, redundant escalations hard-fail again
//   ("sandbox escalation ... is not strictly wider ...").
//
//   Every dispatch re-resolves the tool through `ctx.tools.get(name, scope)`
//   at call time, so we patch `get` itself: ANY bash definition that becomes
//   reachable — global or per-agent, whenever it appears, including a
//   replacement object after HMR — is wrapped the moment it is first resolved,
//   with zero dependence on event timing or agent enumeration. The eager
//   apply-time sweep and the agent/tools events stay as belt-and-braces.
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
// strict-widening check behave exactly as upstream. If the effective mode
// cannot be resolved we pass through rather than guess: wrongly stripping
// would bypass a REAL user approval.
//
// SCOPE — this is not bash-only. Every tool that carries the escalation
// fields is wrapped with the same strip logic: @deepseek-ai/dsh-tool-bash,
// @deepseek-ai/dsh-tool-fs's write/edit, and @deepseek-ai/dsh-tool-pwsh all
// declare sandbox_permissions/justification in their parameter schema and all
// enforce the same strictly-wider check (the observed "not strictly wider"
// and "invalid justification" failures came from write/edit, not bash). The
// get() patch wraps ANY tool whose schema declares sandbox_permissions.
//
// BASH VARIANTS (custom agent presets): presets such as the user-installed
// `liangshen` disable the stock tool-bash row and mount PTY-backed bash
// implementations (@deepseek-ai/dsh-terminal-bash + @deepseek-ai/
// dsh-tool-bash-persistent) under the SAME tool name `bash`. Their parameter
// schema declares NO sandbox_permissions — no escalation machinery exists in
// the tool at all. Redundant escalations are still stripped exactly as above.
// A GENUINE escalation, however, cannot be honored by such a variant: handing
// it through would be silently IGNORED by the PTY execute, the command would
// run under the standing (narrower) mode and get re-denied by the sandbox
// with no visible reason. So for a variant without escalation support we fail
// loud with the upstream message ("sandbox_permissions is not available in
// this composition ..."), which is precisely what the stock tool says when no
// sandboxing executor can escalate. bash (including schema-less variants) is
// therefore ALWAYS wrapped by name; every other tool is wrapped only when its
// own schema declares the escalation fields.
//
// HMR / re-apply safe: the wrap marker records { real, wrapped } so a
// reloaded plugin instance restores the original execute and re-wraps with
// fresh closures (no stale wrapper over a disposed ctx), and the get() patch
// is restored on dispose and re-installed fresh on re-apply.

export const name = 'bash-redundant-escalation-noop';

// Needs `tools` (the registry whose get() we patch) and `agents` (for the
// eager per-agent sweep).
export const inject = ['tools', 'agents'];

// read-only is the floor and never an escalation target; the two real modes.
const MODE_RANK = { 'read-only': 0, 'workspace-write': 1, 'danger-full-access': 2 };

// Marker on a wrapped bash definition — { real, wrapped } so a later instance
// can unwrap cleanly. A stable STRING key (not a module-local Symbol) so the
// marker survives a plugin module reload.
const WRAP_KEY = '__dsh_escalation_wrapped__';
// Marker on the tools service while OUR get() patch is installed. The value
// is a per-apply token so dispose only ever removes the patch it installed.
const PATCH_KEY = '__dsh_escalation_get_patched__';

export function apply(ctx) {
  // Resolve the session's effective sandbox mode EXACTLY like the real bash
  // tool does (`sandboxPolicy.resolve(exec.agent ? { session: exec.agent.session } : {})`),
  // so strip decisions match the tool's own strictly-wider check. Failure
  // (no policy service, transient session state) passes through untouched.
  const resolveEffectiveMode = (exec) => {
    try {
      const policy = ctx.get('sandboxPolicy');
      if (!policy) return void 0;
      const resolved = policy.resolve(exec.agent === void 0 ? {} : { session: exec.agent.session });
      return resolved && typeof resolved.mode === 'string' ? resolved.mode : void 0;
    } catch (error) {
      ctx.logger?.debug?.(
        '[bash-redundant-escalation-noop] policy resolve failed, passing through: %s',
        error instanceof Error ? error.message : String(error),
      );
      return void 0;
    }
  };

  // Build the execute wrapper around the CURRENT real execute of one bash.
  // `supportsEscalation` is derived from the definition's OWN parameter
  // schema: a real escalation channel exists only when the tool declares the
  // sandbox_permissions field (the stock bash does; PTY-backed variants such
  // as @deepseek-ai/dsh-tool-bash-persistent do not).
  const makeWrapper = (bash, realExecute, supportsEscalation) => async (args, exec) => {
    const clean = { ...args };
    const requested = clean.sandbox_permissions;
    const effectiveMode = resolveEffectiveMode(exec);
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
      return realExecute.call(bash, clean, exec);
    }
    if (requested !== undefined && !supportsEscalation) {
      // Bash variant without escalation machinery (persistent/terminal bash
      // mounted by a custom agent preset, e.g. `liangshen`): a GENUINE
      // escalation cannot be honored. Silently dropping it would leave the
      // command running under the standing (narrower) mode, so the sandbox
      // would deny it and the model could not see why. Fail loud with the
      // upstream vocabulary instead — exactly what the stock tool reports
      // when no sandboxing executor can escalate.
      throw new Error(
        'sandbox_permissions is not available in this composition (no sandboxing executor to escalate)',
      );
    }
    // Delegate to the captured REAL bash execute (never a wrapper).
    return realExecute.call(bash, clean, exec);
  };

  // A tool has a real escalation channel only when its OWN parameter schema
  // declares `sandbox_permissions` (stock bash, fs write/edit, pwsh do;
  // PTY-backed bash variants such as @deepseek-ai/dsh-tool-bash-persistent
  // declare only `command` and do not).
  const hasEscalationSchema = (definition) =>
    !!definition &&
    !!definition.parameters &&
    typeof definition.parameters === 'object' &&
    !!definition.parameters.properties &&
    typeof definition.parameters.properties === 'object' &&
    'sandbox_permissions' in definition.parameters.properties;

  // In-place wrap of one tool definition. Idempotent via WRAP_KEY. When
  // `force` and our previous wrapper still sits on the object, restore the
  // original execute and re-wrap so a reloaded module never keeps a stale
  // wrapper (a closed-over, possibly disposed ctx).
  const wrapBash = (bash, force = false) => {
    if (!bash || typeof bash.execute !== 'function') return false;
    const marker = bash[WRAP_KEY];
    if (marker !== void 0) {
      if (force && typeof marker.wrapped === 'function' && bash.execute === marker.wrapped) {
        bash.execute = marker.real; // drop the stale wrapper, re-wrap below
      } else {
        return true; // already wrapped (or someone else owns execute)
      }
    }
    const realExecute = bash.execute;
    if (typeof realExecute !== 'function') return false;
    // Escalation support = the definition declares sandbox_permissions in its
    // OWN parameter schema. PTY-backed bash variants declare only `command`
    // and therefore cannot escalate; the wrapper must fail loud for them
    // instead of letting a genuine escalation be silently ignored.
    const supportsEscalation = hasEscalationSchema(bash);
    const wrapped = makeWrapper(bash, realExecute, supportsEscalation);
    bash.execute = wrapped;
    Object.defineProperty(bash, WRAP_KEY, {
      value: { real: realExecute, wrapped },
      configurable: true, // a reloaded instance may redefine it
    });
    ctx.logger?.info?.('[bash-redundant-escalation-noop] wrapped bash execute in place');
    return true;
  };

  // ── THE GUARANTEE: wrap at resolution time ───────────────────────────────
  // Every bash call re-resolves the definition through ctx.tools.get(name,
  // scope) at dispatch time, so patching get covers any bash that can ever
  // execute — the process-global one (tui/headless), a per-agent one mounted
  // by a preset (web), a definition swapped by HMR — the moment it first
  // becomes reachable, no matter when that happens relative to plugin apply
  // or agent creation. This is what removes the "occasionally unwrapped /
  // degraded to the original global bash" failure mode.
  const toolsService = ctx.tools;
  let patched = false;
  if (toolsService && typeof toolsService.get === 'function') {
    if (toolsService[PATCH_KEY] !== void 0) {
      // A previous instance's patch is installed — restore first so a
      // reloaded module wraps with fresh closures instead of chaining.
      delete toolsService[PATCH_KEY];
      delete toolsService.get;
    }
    const realGet = toolsService.get.bind(toolsService);
    toolsService.get = (name, scope) => {
      const definition = realGet(name, scope);
      // bash is ALWAYS wrapped (including schema-less PTY variants, so the
      // fail-loud branch applies); every other tool is wrapped only when its
      // own schema declares the escalation fields (fs write/edit, pwsh, ...).
      if (definition && (name === 'bash' || hasEscalationSchema(definition))) wrapBash(definition);
      return definition;
    };
    const patchToken = {};
    Object.defineProperty(toolsService, PATCH_KEY, { value: patchToken, configurable: true });
    patched = true;
  }

  // Eager belt-and-braces: wrap everything already reachable now, and on
  // future agent creation / tool changes. Covers bash (any variant) plus the
  // known escalation-capable tool names; the get() patch remains the real
  // guarantee for anything else (and for late-mounted objects).
  const ESCALATION_TOOL_NAMES = ['bash', 'write', 'edit', 'read', 'read_image', 'pwsh'];
  const sweepScope = (scope) => {
    if (!toolsService) return;
    for (const name of ESCALATION_TOOL_NAMES) {
      const tool = toolsService.get(name, scope);
      if (tool && (name === 'bash' || hasEscalationSchema(tool))) wrapBash(tool, true);
    }
  };
  const sweep = () => {
    sweepScope(void 0);
    for (const agent of ctx.agents.list()) sweepScope(agent);
  };

  try {
    sweep();
    ctx.on('agent/created', ({ agent }) => sweepScope(agent));
    ctx.on('tools/change', sweep);
  } catch (error) {
    // Fail-safe: any problem keeps the stock bash untouched.
    ctx.logger?.warn?.(
      'bash-redundant-escalation-noop: failed, keeping stock bash: %s',
      error instanceof Error ? error.message : String(error),
    );
  }

  // Restore the original get() on dispose (uninstall / HMR teardown), so no
  // stale patch with a closed-over ctx survives us.
  ctx.on('dispose', () => {
    if (patched && toolsService && toolsService[PATCH_KEY] !== void 0) {
      delete toolsService[PATCH_KEY];
      delete toolsService.get;
    }
  });
}
