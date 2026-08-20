// Standalone DSH plugin (profile layer, survives `npm update --global @deepseek-ai/dsh`).
// Purpose: prompt-only fix for models that redundantly pass
//   sandbox_permissions: "danger-full-access"
// while the session already runs under danger-full-access, which previously
// hard-failed with "sandbox escalation ... is not strictly wider than this
// call's current ... mode".
//
// This plugin does NOT touch any escalation/approval mechanism. It only adds
// a system-prompt section (model-visible guidance), so the bash call schema
// and enforcement stay exactly as shipped.

export const name = 'bash-escalation-guidance';

// This plugin reads the `systemPrompt` service, so declare it to make sure
// the service is composed before apply() runs.
export const inject = ['systemPrompt'];

export function apply(ctx) {
  ctx.systemPrompt.section({
    name: 'bash-escalation-guidance',
    order: 106, // right after dsh-tool-bash's own "tool:bash" section (order 105)
    text:
      'Bash sandbox escalation rule: set `sandbox_permissions` ONLY when ' +
      'the mode you need is STRICTLY WIDER than the session\'s current ' +
      'mode, and always pair it with a one-sentence `justification`. If the ' +
      'requested mode is EQUAL to or NARROWER than the current mode, do NOT ' +
      'write `sandbox_permissions` (nor `justification`) — it is a ' +
      'redundant / non-widening escalation and the request fails. When in ' +
      'doubt, first run the command without these fields and read the ' +
      '`[sandbox: ...]` marker before escalating.',
  });
}
