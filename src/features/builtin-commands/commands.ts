import { SET_CUSTOM_RULES_TEMPLATE } from '@/features/builtin-commands/templates/set-custom-rules';
import { VERIFY_CUSTOM_RULES_TEMPLATE } from '@/features/builtin-commands/templates/verify-custom-rules';
import type {
  BuiltinCommandName,
  BuiltinCommands,
  CommandDefinition,
} from '@/features/builtin-commands/types';

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
