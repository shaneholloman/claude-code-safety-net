declare const __PKG_VERSION__: string | undefined;

const version = typeof __PKG_VERSION__ !== 'undefined' ? __PKG_VERSION__ : 'dev';

export function printHelp(): void {
  console.log(`cc-safety-net v${version}

Blocks destructive git and filesystem commands before execution.

USAGE:
  cc-safety-net doctor                   Run diagnostic checks
  cc-safety-net doctor --json            Output diagnostics as JSON
  cc-safety-net doctor --skip-update-check  Skip npm registry check
  cc-safety-net -cc, --claude-code       Run as Claude Code PreToolUse hook (reads JSON from stdin)
  cc-safety-net -cp, --copilot-cli       Run as Copilot CLI preToolUse hook (reads JSON from stdin)
  cc-safety-net -gc, --gemini-cli        Run as Gemini CLI BeforeTool hook (reads JSON from stdin)
  cc-safety-net -vc, --verify-config     Validate config files
  cc-safety-net --custom-rules-doc       Print custom rules documentation
  cc-safety-net --statusline             Print status line with mode indicators
  cc-safety-net -h,  --help              Show this help
  cc-safety-net -V,  --version           Show version

ENVIRONMENT VARIABLES:
  SAFETY_NET_STRICT=1             Fail-closed on unparseable commands
  SAFETY_NET_PARANOID=1           Enable all paranoid checks
  SAFETY_NET_PARANOID_RM=1        Block non-temp rm -rf within cwd
  SAFETY_NET_PARANOID_INTERPRETERS=1  Block interpreter one-liners

CONFIG FILES:
  ~/.cc-safety-net/config.json    User-scope config
  .safety-net.json                Project-scope config`);
}

export function printVersion(): void {
  console.log(version);
}
