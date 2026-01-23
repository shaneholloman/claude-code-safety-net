import { describe, expect, test } from 'bun:test';
import { runGeminiHook } from './hook-helpers';

describe('Gemini CLI hook', () => {
  describe('blocked commands', () => {
    test('blocks rm -rf via run_shell_command', async () => {
      const input = {
        hook_event_name: 'BeforeTool',
        tool_name: 'run_shell_command',
        tool_input: { command: 'rm -rf /' },
      };

      const { stdout, exitCode } = await runGeminiHook(input);

      expect(exitCode).toBe(0);
      const output = JSON.parse(stdout);
      expect(output.decision).toBe('deny');
      expect(output.reason).toContain('rm -rf');
    });

    test('outputs Gemini format with decision: deny', async () => {
      const input = {
        hook_event_name: 'BeforeTool',
        tool_name: 'run_shell_command',
        tool_input: { command: 'git reset --hard' },
      };

      const { stdout, exitCode } = await runGeminiHook(input);

      expect(exitCode).toBe(0);
      const output = JSON.parse(stdout);
      expect(output).toHaveProperty('decision', 'deny');
      expect(output).toHaveProperty('reason');
      expect(output.reason).toContain('git reset --hard');
    });
  });

  describe('allowed commands', () => {
    test('allows safe commands (no output)', async () => {
      const input = {
        hook_event_name: 'BeforeTool',
        tool_name: 'run_shell_command',
        tool_input: { command: 'ls -la' },
      };

      const { stdout, exitCode } = await runGeminiHook(input);

      expect(exitCode).toBe(0);
      expect(stdout).toBe('');
    });
  });

  describe('non-target tool', () => {
    test('ignores non-shell tools', async () => {
      const input = {
        hook_event_name: 'BeforeTool',
        tool_name: 'write_file',
        tool_input: { path: '/etc/passwd' },
      };

      const { stdout, exitCode } = await runGeminiHook(input);

      expect(exitCode).toBe(0);
      expect(stdout).toBe('');
    });
  });

  describe('non-target event', () => {
    test('ignores non-BeforeTool events', async () => {
      const input = {
        hook_event_name: 'AfterTool',
        tool_name: 'run_shell_command',
        tool_input: { command: 'rm -rf /' },
      };

      const { stdout, exitCode } = await runGeminiHook(input);

      expect(exitCode).toBe(0);
      expect(stdout).toBe('');
    });
  });

  describe('empty stdin', () => {
    test('empty input produces no output', async () => {
      const { stdout, exitCode } = await runGeminiHook('');

      expect(stdout).toBe('');
      expect(exitCode).toBe(0);
    });

    test('whitespace-only input produces no output', async () => {
      const { stdout, exitCode } = await runGeminiHook('   \n\t  ');

      expect(stdout).toBe('');
      expect(exitCode).toBe(0);
    });
  });

  describe('invalid JSON', () => {
    test('strict mode blocks invalid JSON', async () => {
      const { stdout, exitCode } = await runGeminiHook('{invalid json', {
        SAFETY_NET_STRICT: '1',
      });

      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.decision).toBe('deny');
      expect(parsed.reason).toContain('Failed to parse hook input JSON (strict mode)');
    });

    test('non-strict mode silently ignores invalid JSON', async () => {
      const { stdout, exitCode } = await runGeminiHook('{invalid json');

      expect(stdout).toBe('');
      expect(exitCode).toBe(0);
    });
  });

  describe('missing command', () => {
    test('missing command in tool_input produces no output', async () => {
      const input = {
        hook_event_name: 'BeforeTool',
        tool_name: 'run_shell_command',
        tool_input: {},
      };

      const { stdout, exitCode } = await runGeminiHook(input);

      expect(stdout).toBe('');
      expect(exitCode).toBe(0);
    });

    test('null tool_input produces no output', async () => {
      const input = {
        hook_event_name: 'BeforeTool',
        tool_name: 'run_shell_command',
        tool_input: null,
      };

      const { stdout, exitCode } = await runGeminiHook(input);

      expect(stdout).toBe('');
      expect(exitCode).toBe(0);
    });

    test('missing tool_input produces no output', async () => {
      const input = {
        hook_event_name: 'BeforeTool',
        tool_name: 'run_shell_command',
      };

      const { stdout, exitCode } = await runGeminiHook(input);

      expect(stdout).toBe('');
      expect(exitCode).toBe(0);
    });
  });
});
