export type BuiltinCommandName = 'set-custom-rules' | 'verify-custom-rules';

// export interface BuiltinCommandConfig {
//   disabled_commands?: BuiltinCommandName[];
// }

export interface CommandDefinition {
  description?: string;
  template: string;
}

export type BuiltinCommands = Record<string, CommandDefinition>;
