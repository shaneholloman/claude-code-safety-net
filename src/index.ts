import type { Plugin } from '@opencode-ai/plugin';
import { analyzeCommand, loadConfig } from './core/analyze.ts';
import { envTruthy } from './core/env.ts';
import { formatBlockedMessage } from './core/format.ts';
import { loadBuiltinCommands } from './features/builtin-commands/index.ts';

export const SafetyNetPlugin: Plugin = async ({ directory }) => {
  const safetyNetConfig = loadConfig(directory);
  const strict = envTruthy('SAFETY_NET_STRICT');
  const paranoidAll = envTruthy('SAFETY_NET_PARANOID');
  const paranoidRm = paranoidAll || envTruthy('SAFETY_NET_PARANOID_RM');
  const paranoidInterpreters = paranoidAll || envTruthy('SAFETY_NET_PARANOID_INTERPRETERS');

  return {
    config: async (opencodeConfig: Record<string, unknown>) => {
      const builtinCommands = loadBuiltinCommands();
      const existingCommands = (opencodeConfig.command as Record<string, unknown>) ?? {};

      opencodeConfig.command = {
        ...builtinCommands,
        ...existingCommands,
      };
    },

    'tool.execute.before': async (input, output) => {
      if (input.tool === 'bash') {
        const command = output.args.command;
        const result = analyzeCommand(command, {
          cwd: directory,
          config: safetyNetConfig,
          strict,
          paranoidRm,
          paranoidInterpreters,
        });
        if (result) {
          const message = formatBlockedMessage({
            reason: result.reason,
            command,
            segment: result.segment,
          });

          throw new Error(message);
        }
      }
    },
  };
};
