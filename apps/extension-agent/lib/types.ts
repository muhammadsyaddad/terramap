export * from '@terramap/types';

/** Side panel -> background, sent over a long-lived Port named "agent". */
export type PanelToBg = { type: 'USER_MSG'; text: string } | { type: 'RESET' };

/**
 * Background -> side panel. Mirrors AgentEvent from @terramap/agent plus a
 * `done` terminator so the panel knows the turn is fully settled.
 */
export type BgToPanel =
  | { kind: 'text_delta'; text: string }
  | { kind: 'tool_use'; name: string; input: Record<string, unknown> }
  | { kind: 'tool_result'; name: string; ok: boolean; summary: string }
  | { kind: 'error'; error: string }
  | { kind: 'done' };
