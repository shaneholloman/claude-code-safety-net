import { describe, expect, test } from 'bun:test';

type HookResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

async function runCopilotHook(input: object, env?: Record<string, string>): Promise<HookResult> {
  const baseEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      baseEnv[key] = value;
    }
  }

  const mergedEnv: Record<string, string> = {
    ...baseEnv,
    ...(env ?? {}),
  };

  const proc = Bun.spawn(['bun', 'src/bin/cc-safety-net.ts', '-cp'], {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    env: mergedEnv,
  });
  proc.stdin.write(JSON.stringify(input));
  proc.stdin.end();
  const stdoutPromise = new Response(proc.stdout).text();
  const stderrPromise = new Response(proc.stderr).text();
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

describe('Copilot CLI hook', () => {
  describe('input parsing', () => {
    test('blocks rm -rf via bash tool', async () => {
      const input = {
        timestamp: Date.now(),
        cwd: process.cwd(),
        toolName: 'bash',
        toolArgs: JSON.stringify({ command: 'rm -rf /' }),
      };
      const { stdout, exitCode } = await runCopilotHook(input);
      expect(exitCode).toBe(0);
      const output = JSON.parse(stdout);
      expect(output.permissionDecision).toBe('deny');
      expect(output.permissionDecisionReason).toContain('rm -rf');
    });

    test('allows safe commands (no output)', async () => {
      const input = {
        timestamp: Date.now(),
        cwd: process.cwd(),
        toolName: 'bash',
        toolArgs: JSON.stringify({ command: 'ls -la' }),
      };
      const { stdout, exitCode } = await runCopilotHook(input);
      expect(exitCode).toBe(0);
      expect(stdout).toBe('');
    });

    test('ignores non-bash tools', async () => {
      const input = {
        timestamp: Date.now(),
        cwd: process.cwd(),
        toolName: 'write_file',
        toolArgs: JSON.stringify({ path: '/etc/passwd' }),
      };
      const { stdout, exitCode } = await runCopilotHook(input);
      expect(exitCode).toBe(0);
      expect(stdout).toBe('');
    });

    test('strict mode blocks invalid toolArgs JSON', async () => {
      const input = {
        timestamp: Date.now(),
        cwd: process.cwd(),
        toolName: 'bash',
        toolArgs: '{invalid',
      };
      const { stdout, exitCode } = await runCopilotHook(input, {
        SAFETY_NET_STRICT: '1',
      });
      expect(exitCode).toBe(0);
      const output = JSON.parse(stdout);
      expect(output.permissionDecision).toBe('deny');
      expect(output.permissionDecisionReason).toContain(
        'Failed to parse toolArgs JSON (strict mode)',
      );
    });
  });
});
