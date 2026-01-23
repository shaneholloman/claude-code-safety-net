/**
 * Shared test helpers for CLI hook integration tests.
 */

export type HookResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

/**
 * Runs a hook CLI with the given input and optional environment variables.
 * @param flag - CLI flag (e.g., '--claude-code', '-gc', '-cp')
 * @param input - Raw string input to send to stdin
 * @param env - Optional environment variables to set
 */
export async function runHook(
  flag: string,
  input: string,
  env?: Record<string, string>,
): Promise<HookResult> {
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

  const proc = Bun.spawn(['bun', 'src/bin/cc-safety-net.ts', flag], {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    env: mergedEnv,
  });
  proc.stdin.write(input);
  proc.stdin.end();
  const stdoutPromise = new Response(proc.stdout).text();
  const stderrPromise = new Response(proc.stderr).text();
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

/**
 * Runs the Claude Code hook.
 */
export async function runClaudeCodeHook(
  input: object | string,
  env?: Record<string, string>,
): Promise<HookResult> {
  const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
  return runHook('--claude-code', inputStr, env);
}

/**
 * Runs the Gemini CLI hook.
 */
export async function runGeminiHook(
  input: object | string,
  env?: Record<string, string>,
): Promise<HookResult> {
  const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
  return runHook('-gc', inputStr, env);
}

/**
 * Runs the Copilot CLI hook.
 */
export async function runCopilotHook(
  input: object | string,
  env?: Record<string, string>,
): Promise<HookResult> {
  const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
  return runHook('-cp', inputStr, env);
}
