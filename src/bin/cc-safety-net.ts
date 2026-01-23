#!/usr/bin/env node
import { findCommand } from '@/bin/commands';
import { CUSTOM_RULES_DOC } from '@/bin/custom-rules-doc';
import { parseDoctorFlags, runDoctor } from '@/bin/doctor/index';
import {
  explainCommand,
  formatTraceHuman,
  formatTraceJson,
  parseExplainFlags,
} from '@/bin/explain/index';
import { printHelp, printVersion, showCommandHelp } from '@/bin/help';
import { runClaudeCodeHook } from '@/bin/hooks/claude-code';
import { runCopilotCliHook } from '@/bin/hooks/copilot-cli';
import { runGeminiCLIHook } from '@/bin/hooks/gemini-cli';
import { printStatusline } from '@/bin/statusline';
import { verifyConfig } from '@/bin/verify-config';

function printCustomRulesDoc(): void {
  console.log(CUSTOM_RULES_DOC);
}

type CommandMode =
  | 'claude-code'
  | 'copilot-cli'
  | 'gemini-cli'
  | 'statusline'
  | 'doctor'
  | 'explain';

/**
 * Check if --help or -h is present in args (but not as a quoted command argument).
 */
function hasHelpFlag(args: readonly string[]): boolean {
  return args.includes('--help') || args.includes('-h');
}

/**
 * Handle "help <command>" pattern.
 * Returns true if handled (printed help or error), false if not the help command.
 */
function handleHelpCommand(args: readonly string[]): boolean {
  if (args[0] !== 'help') {
    return false;
  }

  const commandName = args[1];
  if (!commandName) {
    // Just "help" with no argument - show main help
    printHelp();
    process.exit(0);
  }

  if (showCommandHelp(commandName)) {
    process.exit(0);
  }

  console.error(`Unknown command: ${commandName}`);
  console.error("Run 'cc-safety-net --help' for available commands.");
  process.exit(1);
}

/**
 * Handle "<command> --help" pattern for subcommands.
 * Returns true if handled, false otherwise.
 */
function handleCommandHelp(args: readonly string[]): boolean {
  if (!hasHelpFlag(args)) {
    return false;
  }

  const commandName = args[0];
  if (!commandName || commandName.startsWith('-')) {
    // Not a subcommand, will be handled by global help
    return false;
  }

  // Check if this is a known command
  const command = findCommand(commandName);
  if (command) {
    showCommandHelp(commandName);
    process.exit(0);
  }

  return false;
}

function handleCliFlags(): CommandMode | null {
  const args = process.argv.slice(2);

  // Handle "help <command>" pattern first
  if (handleHelpCommand(args)) {
    return null;
  }

  // Handle "<command> --help" pattern
  if (handleCommandHelp(args)) {
    return null;
  }

  if (args[0] === 'explain') {
    return 'explain';
  }

  if (args.length === 0 || hasHelpFlag(args)) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-V')) {
    printVersion();
    process.exit(0);
  }

  if (args.includes('--verify-config') || args.includes('-vc')) {
    process.exit(verifyConfig());
  }

  if (args.includes('--custom-rules-doc')) {
    printCustomRulesDoc();
    process.exit(0);
  }

  if (args.includes('doctor') || args.includes('--doctor')) {
    return 'doctor';
  }

  if (args.includes('--statusline')) {
    return 'statusline';
  }

  if (args.includes('--claude-code') || args.includes('-cc')) {
    return 'claude-code';
  }

  if (args.includes('--copilot-cli') || args.includes('-cp')) {
    return 'copilot-cli';
  }

  if (args.includes('--gemini-cli') || args.includes('-gc')) {
    return 'gemini-cli';
  }

  console.error(`Unknown option: ${args[0]}`);
  console.error("Run 'cc-safety-net --help' for usage.");
  process.exit(1);
}

async function main(): Promise<void> {
  const mode = handleCliFlags();
  if (mode === 'claude-code') {
    await runClaudeCodeHook();
  } else if (mode === 'copilot-cli') {
    await runCopilotCliHook();
  } else if (mode === 'gemini-cli') {
    await runGeminiCLIHook();
  } else if (mode === 'statusline') {
    await printStatusline();
  } else if (mode === 'doctor') {
    const flags = parseDoctorFlags(process.argv.slice(2));
    const exitCode = await runDoctor({
      json: flags.json,
      skipUpdateCheck: flags.skipUpdateCheck,
    });
    process.exit(exitCode);
  } else if (mode === 'explain') {
    const args = process.argv.slice(3);

    // Check for --help in explain args
    if (hasHelpFlag(args) || args.length === 0) {
      showCommandHelp('explain');
      process.exit(0);
    }

    const flags = parseExplainFlags(args);
    if (!flags) {
      process.exit(1);
    }

    const result = explainCommand(flags.command, { cwd: flags.cwd });
    const asciiOnly = !!process.env.NO_COLOR || !process.stdout.isTTY;

    if (flags.json) {
      console.log(formatTraceJson(result));
    } else {
      console.log(formatTraceHuman(result, { asciiOnly }));
    }
    process.exit(0);
  }
}

main().catch((error: unknown) => {
  console.error('Safety Net error:', error);
  process.exit(1);
});
