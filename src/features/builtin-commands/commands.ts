import { SET_CUSTOM_RULES_TEMPLATE } from './templates/set-custom-rules.ts';
import { VERIFY_CUSTOM_RULES_TEMPLATE } from './templates/verify-custom-rules.ts';
import type { BuiltinCommandName, BuiltinCommands, CommandDefinition } from './types.ts';

const BUILTIN_COMMAND_DEFINITIONS: Record<BuiltinCommandName, CommandDefinition> = {
  'set-custom-rules': {
    description: 'Set custom rules for Safety Net',
    template: SET_CUSTOM_RULES_TEMPLATE,
  },
  'verify-custom-rules': {
    description: 'Verify custom rules for Safety Net',
    template: VERIFY_CUSTOM_RULES_TEMPLATE,
  },
};

export function loadBuiltinCommands(disabledCommands?: BuiltinCommandName[]): BuiltinCommands {
  const disabled = new Set(disabledCommands ?? []);
  const commands: BuiltinCommands = {};

  for (const [name, definition] of Object.entries(BUILTIN_COMMAND_DEFINITIONS)) {
    if (!disabled.has(name as BuiltinCommandName)) {
      commands[name] = definition;
    }
  }

  return commands;
}
