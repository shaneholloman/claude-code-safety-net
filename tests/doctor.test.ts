/**
 * Tests for the doctor command.
 */

import { describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getActivitySummary } from '../src/bin/doctor/activity.ts';
import { getConfigInfo } from '../src/bin/doctor/config.ts';
import { getEnvironmentInfo } from '../src/bin/doctor/environment.ts';
import {
  formatActivitySection,
  formatConfigSection,
  formatEnvironmentSection,
  formatHooksSection,
  formatRulesTable,
  formatSummary,
  formatSystemInfoSection,
  formatUpdateSection,
} from '../src/bin/doctor/format.ts';
import { detectAllHooks, stripJsonComments } from '../src/bin/doctor/hooks.ts';
import { getPackageVersion, getSystemInfo } from '../src/bin/doctor/system-info.ts';
import type { DoctorReport, EffectiveRule, HookStatus } from '../src/bin/doctor/types.ts';
import { mockVersionFetcher } from './helpers.ts';

describe('doctor command', () => {
  describe('formatRulesTable', () => {
    test('formats rules as ASCII table', () => {
      const rules: EffectiveRule[] = [
        {
          source: 'user',
          name: 'no-npm-publish',
          command: 'npm',
          blockArgs: ['publish'],
          reason: 'Block publishing',
        },
        {
          source: 'project',
          name: 'block-deploy',
          command: 'deploy',
          blockArgs: ['--prod'],
          reason: 'Block prod deploys',
        },
      ];

      const table = formatRulesTable(rules);
      expect(table).toContain('Source');
      expect(table).toContain('Name');
      expect(table).toContain('Command');
      expect(table).toContain('Block Args');
      expect(table).toContain('no-npm-publish');
      expect(table).toContain('block-deploy');
      expect(table).toContain('user');
      expect(table).toContain('project');
    });

    test('handles empty rules list', () => {
      const table = formatRulesTable([]);
      expect(table).toContain('no custom rules');
    });

    test('handles rules with subcommand', () => {
      const rules: EffectiveRule[] = [
        {
          source: 'user',
          name: 'no-git-push-force',
          command: 'git',
          subcommand: 'push',
          blockArgs: ['--force'],
          reason: 'Block force push',
        },
      ];

      const table = formatRulesTable(rules);
      expect(table).toContain('git push');
    });
  });

  describe('formatHooksSection', () => {
    test('formats configured hooks with self-test', () => {
      const hooks: HookStatus[] = [
        {
          platform: 'claude-code',
          status: 'configured',
          method: 'marketplace plugin',
          selfTest: {
            passed: 5,
            failed: 0,
            total: 5,
            results: [
              {
                command: 'git reset --hard',
                description: 'git reset --hard',
                expected: 'blocked',
                actual: 'blocked',
                passed: true,
              },
            ],
          },
        },
      ];

      const output = formatHooksSection(hooks);
      expect(output).toContain('Hook Integration');
      expect(output).toContain('Claude Code');
      expect(output).toContain('Configured');
      expect(output).toContain('5/5 OK');
    });

    test('formats unconfigured hooks', () => {
      const hooks: HookStatus[] = [{ platform: 'gemini-cli', status: 'n/a' }];

      const output = formatHooksSection(hooks);
      expect(output).toContain('Gemini CLI');
      expect(output).toContain('N/A');
    });

    test('shows error for failed detection', () => {
      const hooks: HookStatus[] = [
        { platform: 'opencode', status: 'n/a', errors: ['Parse error'] },
      ];

      const output = formatHooksSection(hooks);
      expect(output).toContain('Error (OpenCode): Parse error');
    });

    test('formats disabled hooks', () => {
      const hooks: HookStatus[] = [{ platform: 'claude-code', status: 'disabled' }];

      const output = formatHooksSection(hooks);
      expect(output).toContain('Claude Code');
      expect(output).toContain('Disabled');
    });

    test('shows failures below table in red', () => {
      const hooks: HookStatus[] = [
        {
          platform: 'claude-code',
          status: 'configured',
          selfTest: {
            passed: 2,
            failed: 1,
            total: 3,
            results: [
              {
                command: 'git reset --hard',
                description: 'git reset --hard',
                expected: 'blocked',
                actual: 'blocked',
                passed: true,
              },
              {
                command: 'rm -rf /',
                description: 'rm -rf /',
                expected: 'blocked',
                actual: 'allowed',
                passed: false,
              },
            ],
          },
        },
      ];

      const output = formatHooksSection(hooks);
      expect(output).toContain('2/3 FAIL');
      expect(output).toContain('Failures:');
      expect(output).toContain('Claude Code: rm -rf /');
      expect(output).toContain('expected blocked, got allowed');
    });
  });

  describe('formatEnvironmentSection', () => {
    test('formats environment variables as table', () => {
      const envVars = getEnvironmentInfo();
      const output = formatEnvironmentSection(envVars);
      expect(output).toContain('Environment');
      // Should be a table with Variable and Status columns
      expect(output).toContain('Variable');
      expect(output).toContain('Status');
      expect(output).toContain('SAFETY_NET_STRICT');
      // Should have table borders
      expect(output).toContain('┌');
      expect(output).toContain('┘');
    });

    test('shows ✓ for enabled variables', () => {
      const envVars = [
        {
          name: 'SAFETY_NET_STRICT',
          description: 'Fail-closed',
          defaultBehavior: 'permissive',
          value: '1',
          isSet: true,
        },
      ];
      const output = formatEnvironmentSection(envVars);
      expect(output).toContain('✓');
    });

    test('shows ✗ for disabled variables', () => {
      const envVars = [
        {
          name: 'SAFETY_NET_STRICT',
          description: 'Fail-closed',
          defaultBehavior: 'permissive',
          value: undefined,
          isSet: false,
        },
      ];
      const output = formatEnvironmentSection(envVars);
      expect(output).toContain('✗');
    });
  });

  describe('formatActivitySection', () => {
    test('formats empty activity', () => {
      const activity = { totalBlocked: 0, sessionCount: 0, recentEntries: [] };
      const output = formatActivitySection(activity);
      expect(output).toContain('Recent Activity');
      expect(output).toContain('No blocked commands');
    });

    test('formats activity with entries', () => {
      const activity = {
        totalBlocked: 3,
        sessionCount: 2,
        recentEntries: [
          {
            timestamp: '2025-01-01T00:00:00Z',
            command: 'git reset --hard',
            reason: 'Blocked',
            relativeTime: '1h ago',
          },
        ],
      };
      const output = formatActivitySection(activity);
      // Header now shows summary in compact format
      expect(output).toContain('3 blocked');
      expect(output).toContain('2 sessions');
      // Table format
      expect(output).toContain('Time');
      expect(output).toContain('Command');
      expect(output).toContain('1h ago');
      expect(output).toContain('git reset --hard');
      // Should have table borders
      expect(output).toContain('┌');
      expect(output).toContain('┘');
    });
  });

  describe('formatUpdateSection', () => {
    test('formats update available as table', () => {
      const update = {
        currentVersion: '0.6.0',
        latestVersion: '0.7.0',
        updateAvailable: true,
      };
      const output = formatUpdateSection(update);
      expect(output).toContain('Update Check');
      expect(output).toContain('Update Available');
      expect(output).toContain('0.6.0');
      expect(output).toContain('0.7.0');
      expect(output).toContain('bunx');
      expect(output).toContain('npx');
      // Should have table borders
      expect(output).toContain('┌');
      expect(output).toContain('┘');
    });

    test('formats up to date as table', () => {
      const update = {
        currentVersion: '0.7.0',
        latestVersion: '0.7.0',
        updateAvailable: false,
      };
      const output = formatUpdateSection(update);
      expect(output).toContain('Update Check');
      expect(output).toContain('Up to date');
      expect(output).toContain('0.7.0');
      // Should have table borders
      expect(output).toContain('┌');
      expect(output).toContain('┘');
    });

    test('formats skipped update check as table', () => {
      const update = {
        currentVersion: '0.6.0',
        latestVersion: null,
        updateAvailable: false,
      };
      const output = formatUpdateSection(update);
      expect(output).toContain('Update Check');
      expect(output).toContain('Skipped');
      expect(output).toContain('0.6.0');
      // Should have table borders
      expect(output).toContain('┌');
      expect(output).toContain('┘');
    });

    test('formats error as table', () => {
      const update = {
        currentVersion: '0.6.0',
        latestVersion: null,
        updateAvailable: false,
        error: 'Network error',
      };
      const output = formatUpdateSection(update);
      expect(output).toContain('Update Check');
      expect(output).toContain('Error');
      expect(output).toContain('0.6.0');
      expect(output).toContain('Network error');
      // Should have table borders
      expect(output).toContain('┌');
      expect(output).toContain('┘');
    });
  });

  describe('formatSystemInfoSection', () => {
    test('formats system info as table', async () => {
      const sysInfo = await getSystemInfo(mockVersionFetcher);
      const output = formatSystemInfoSection(sysInfo);
      expect(output).toContain('System Info');
      // Table headers
      expect(output).toContain('Component');
      expect(output).toContain('Version');
      // Component names (without colons since it's a table)
      expect(output).toContain('cc-safety-net');
      expect(output).toContain('Platform');
      expect(output).toContain('Bun');
      // Should have table borders
      expect(output).toContain('┌');
      expect(output).toContain('┘');
    });

    test('formats null versions as "not found"', () => {
      const sysInfo = {
        version: 'dev',
        claudeCodeVersion: null,
        openCodeVersion: null,
        geminiCliVersion: null,
        nodeVersion: '22.0.0',
        npmVersion: null,
        bunVersion: '1.0.0',
        platform: 'darwin arm64',
      };
      const output = formatSystemInfoSection(sysInfo);
      expect(output).toContain('not found');
    });
  });

  describe('formatConfigSection', () => {
    test('formats config with no rules', () => {
      const report: DoctorReport = {
        hooks: [],
        userConfig: {
          path: '/home/user/.cc-safety-net/config.json',
          exists: false,
          valid: false,
          ruleCount: 0,
        },
        projectConfig: {
          path: './.safety-net.json',
          exists: false,
          valid: false,
          ruleCount: 0,
        },
        effectiveRules: [],
        shadowedRules: [],
        environment: [],
        activity: { totalBlocked: 0, sessionCount: 0, recentEntries: [] },
        update: {
          currentVersion: '0.6.0',
          latestVersion: '0.6.0',
          updateAvailable: false,
        },
        system: {
          version: '0.6.0',
          claudeCodeVersion: '1.0.0',
          openCodeVersion: '0.1.0',
          geminiCliVersion: null,
          nodeVersion: '22.0.0',
          npmVersion: '10.0.0',
          bunVersion: '1.0.0',
          platform: 'darwin arm64',
        },
      };
      const output = formatConfigSection(report);
      expect(output).toContain('Configuration');
      expect(output).toContain('User');
      expect(output).toContain('Project');
      expect(output).toContain('N/A');
    });

    test('formats config with shadow warnings', () => {
      const report: DoctorReport = {
        hooks: [],
        userConfig: {
          path: '/home/user/.cc-safety-net/config.json',
          exists: true,
          valid: true,
          ruleCount: 1,
        },
        projectConfig: {
          path: './.safety-net.json',
          exists: true,
          valid: true,
          ruleCount: 1,
        },
        effectiveRules: [
          {
            source: 'project',
            name: 'test-rule',
            command: 'test',
            blockArgs: ['--flag'],
            reason: 'Test',
          },
        ],
        shadowedRules: [{ name: 'test-rule', shadowedBy: 'project' }],
        environment: [],
        activity: { totalBlocked: 0, sessionCount: 0, recentEntries: [] },
        update: {
          currentVersion: '0.6.0',
          latestVersion: '0.6.0',
          updateAvailable: false,
        },
        system: {
          version: '0.6.0',
          claudeCodeVersion: '1.0.0',
          openCodeVersion: '0.1.0',
          geminiCliVersion: null,
          nodeVersion: '22.0.0',
          npmVersion: '10.0.0',
          bunVersion: '1.0.0',
          platform: 'darwin arm64',
        },
      };
      const output = formatConfigSection(report);
      expect(output).toContain('shadows user rule');
    });
  });

  describe('formatSummary', () => {
    test('formats all passed', () => {
      const report: DoctorReport = {
        hooks: [{ platform: 'claude-code', status: 'configured' }],
        userConfig: { path: '', exists: false, valid: false, ruleCount: 0 },
        projectConfig: { path: '', exists: false, valid: false, ruleCount: 0 },
        effectiveRules: [],
        shadowedRules: [],
        environment: [],
        activity: { totalBlocked: 1, sessionCount: 1, recentEntries: [] },
        update: { currentVersion: '0.6.0', latestVersion: '0.6.0', updateAvailable: false },
        system: {
          version: '0.6.0',
          claudeCodeVersion: null,
          openCodeVersion: null,
          geminiCliVersion: null,
          nodeVersion: '22.0.0',
          npmVersion: '10.0.0',
          bunVersion: '1.0.0',
          platform: 'darwin',
        },
      };
      const output = formatSummary(report);
      expect(output).toContain('All checks passed');
    });

    test('formats with warnings', () => {
      const report: DoctorReport = {
        hooks: [{ platform: 'claude-code', status: 'configured' }],
        userConfig: { path: '', exists: false, valid: false, ruleCount: 0 },
        projectConfig: { path: '', exists: false, valid: false, ruleCount: 0 },
        effectiveRules: [],
        shadowedRules: [],
        environment: [],
        activity: { totalBlocked: 0, sessionCount: 0, recentEntries: [] },
        update: { currentVersion: '0.6.0', latestVersion: '0.7.0', updateAvailable: true },
        system: {
          version: '0.6.0',
          claudeCodeVersion: null,
          openCodeVersion: null,
          geminiCliVersion: null,
          nodeVersion: '22.0.0',
          npmVersion: '10.0.0',
          bunVersion: '1.0.0',
          platform: 'darwin',
        },
      };
      const output = formatSummary(report);
      expect(output).toContain('warning');
    });

    test('formats with failures', () => {
      const report: DoctorReport = {
        hooks: [],
        userConfig: { path: '', exists: false, valid: false, ruleCount: 0 },
        projectConfig: { path: '', exists: false, valid: false, ruleCount: 0 },
        effectiveRules: [],
        shadowedRules: [],
        environment: [],
        activity: { totalBlocked: 0, sessionCount: 0, recentEntries: [] },
        update: { currentVersion: '0.6.0', latestVersion: '0.6.0', updateAvailable: false },
        system: {
          version: '0.6.0',
          claudeCodeVersion: null,
          openCodeVersion: null,
          geminiCliVersion: null,
          nodeVersion: '22.0.0',
          npmVersion: '10.0.0',
          bunVersion: '1.0.0',
          platform: 'darwin',
        },
      };
      const output = formatSummary(report);
      expect(output).toContain('failed');
    });
  });

  describe('getConfigInfo', () => {
    test('handles missing config files', () => {
      const tmpDir = join(tmpdir(), `doctor-test-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });

      try {
        const info = getConfigInfo(tmpDir);
        expect(info.projectConfig.exists).toBe(false);
        expect(info.effectiveRules).toEqual([]);
        expect(info.shadowedRules).toEqual([]);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('detects valid project config', () => {
      const tmpDir = join(tmpdir(), `doctor-test-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });

      const configPath = join(tmpDir, '.safety-net.json');
      writeFileSync(
        configPath,
        JSON.stringify({
          version: 1,
          rules: [
            {
              name: 'test-rule',
              command: 'test',
              block_args: ['--dangerous'],
              reason: 'Test reason',
            },
          ],
        }),
      );

      try {
        const info = getConfigInfo(tmpDir);
        expect(info.projectConfig.exists).toBe(true);
        expect(info.projectConfig.valid).toBe(true);
        expect(info.projectConfig.ruleCount).toBe(1);
        expect(info.effectiveRules.length).toBe(1);
        expect(info.effectiveRules[0]?.source).toBe('project');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('detects invalid project config', () => {
      const tmpDir = join(tmpdir(), `doctor-test-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });

      const configPath = join(tmpDir, '.safety-net.json');
      writeFileSync(configPath, '{ "version": 2 }');

      try {
        const info = getConfigInfo(tmpDir);
        expect(info.projectConfig.exists).toBe(true);
        expect(info.projectConfig.valid).toBe(false);
        expect(info.projectConfig.errors?.length).toBeGreaterThan(0);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('excludes rules from invalid config (wrong version)', () => {
      const tmpDir = join(tmpdir(), `doctor-test-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });

      const configPath = join(tmpDir, '.safety-net.json');
      // Invalid config: version 2 is not supported, but contains valid-looking rules
      writeFileSync(
        configPath,
        JSON.stringify({
          version: 2,
          rules: [
            {
              name: 'should-not-appear',
              command: 'test',
              block_args: ['--dangerous'],
              reason: 'This rule should not be shown as effective',
            },
          ],
        }),
      );

      try {
        const info = getConfigInfo(tmpDir);
        expect(info.projectConfig.exists).toBe(true);
        expect(info.projectConfig.valid).toBe(false);
        // Rules from invalid configs should NOT appear as effective
        expect(info.effectiveRules).toEqual([]);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('handles malformed JSON in config', () => {
      const tmpDir = join(tmpdir(), `doctor-test-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });

      const configPath = join(tmpDir, '.safety-net.json');
      writeFileSync(configPath, '{ invalid json }');

      try {
        const info = getConfigInfo(tmpDir);
        // Malformed JSON means rules can't be loaded
        expect(info.effectiveRules).toEqual([]);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('handles empty config file', () => {
      const tmpDir = join(tmpdir(), `doctor-test-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });

      const configPath = join(tmpDir, '.safety-net.json');
      writeFileSync(configPath, '   ');

      try {
        const info = getConfigInfo(tmpDir);
        expect(info.effectiveRules).toEqual([]);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('handles config without rules array', () => {
      const tmpDir = join(tmpdir(), `doctor-test-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });

      const configPath = join(tmpDir, '.safety-net.json');
      writeFileSync(configPath, '{ "version": 1 }');

      try {
        const info = getConfigInfo(tmpDir);
        expect(info.effectiveRules).toEqual([]);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test('merges user and project rules with shadowing', () => {
      const tmpDir = join(tmpdir(), `doctor-test-${Date.now()}`);
      const homeDir = join(tmpDir, 'home');
      const projectDir = join(tmpDir, 'project');
      mkdirSync(homeDir, { recursive: true });
      mkdirSync(projectDir, { recursive: true });

      const userConfigDir = join(homeDir, '.cc-safety-net');
      mkdirSync(userConfigDir, { recursive: true });
      writeFileSync(
        join(userConfigDir, 'config.json'),
        JSON.stringify({
          version: 1,
          rules: [
            {
              name: 'user-only',
              command: 'user',
              block_args: ['--stop'],
              reason: 'User rule',
            },
            {
              name: 'shared-rule',
              command: 'shared',
              block_args: ['--user'],
              reason: 'User shared',
            },
          ],
        }),
      );

      writeFileSync(
        join(projectDir, '.safety-net.json'),
        JSON.stringify({
          version: 1,
          rules: [
            {
              name: 'shared-rule',
              command: 'shared',
              block_args: ['--project'],
              reason: 'Project shared',
            },
            {
              name: 'project-only',
              command: 'project',
              block_args: ['--ship'],
              reason: 'Project rule',
            },
          ],
        }),
      );

      try {
        const info = getConfigInfo(projectDir, {
          userConfigPath: join(userConfigDir, 'config.json'),
        });
        expect(info.shadowedRules).toEqual([{ name: 'shared-rule', shadowedBy: 'project' }]);

        const userRule = info.effectiveRules.find((rule) => rule.name === 'user-only');
        expect(userRule?.source).toBe('user');
        expect(userRule?.blockArgs).toEqual(['--stop']);
        expect(userRule?.reason).toBe('User rule');

        const projectRule = info.effectiveRules.find((rule) => rule.name === 'project-only');
        expect(projectRule?.source).toBe('project');
        expect(projectRule?.blockArgs).toEqual(['--ship']);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('getEnvironmentInfo', () => {
    test('returns all expected environment variables', () => {
      const envInfo = getEnvironmentInfo();

      const names = envInfo.map((v) => v.name);
      expect(names).toContain('SAFETY_NET_STRICT');
      expect(names).toContain('SAFETY_NET_PARANOID');
      expect(names).toContain('SAFETY_NET_PARANOID_RM');
      expect(names).toContain('SAFETY_NET_PARANOID_INTERPRETERS');
    });

    test('each env var has required fields', () => {
      const envInfo = getEnvironmentInfo();

      for (const v of envInfo) {
        expect(typeof v.name).toBe('string');
        expect(typeof v.description).toBe('string');
        expect(typeof v.defaultBehavior).toBe('string');
        expect(typeof v.isSet).toBe('boolean');
      }
    });
  });

  describe('getActivitySummary', () => {
    test('returns activity summary structure', () => {
      const activity = getActivitySummary(7);

      expect(typeof activity.totalBlocked).toBe('number');
      expect(typeof activity.sessionCount).toBe('number');
      expect(Array.isArray(activity.recentEntries)).toBe(true);
    });
  });

  describe('getSystemInfo', () => {
    test('returns all required fields', async () => {
      const sysInfo = await getSystemInfo(mockVersionFetcher);

      expect(typeof sysInfo.version).toBe('string');
      expect(typeof sysInfo.platform).toBe('string');
      // Version fields may be null if tools are not installed
      expect(
        sysInfo.claudeCodeVersion === null || typeof sysInfo.claudeCodeVersion === 'string',
      ).toBe(true);
      expect(sysInfo.openCodeVersion === null || typeof sysInfo.openCodeVersion === 'string').toBe(
        true,
      );
      expect(
        sysInfo.geminiCliVersion === null || typeof sysInfo.geminiCliVersion === 'string',
      ).toBe(true);
      expect(sysInfo.nodeVersion === null || typeof sysInfo.nodeVersion === 'string').toBe(true);
      expect(sysInfo.npmVersion === null || typeof sysInfo.npmVersion === 'string').toBe(true);
      expect(sysInfo.bunVersion === null || typeof sysInfo.bunVersion === 'string').toBe(true);
    });

    test('detects Bun version with mock fetcher', async () => {
      const sysInfo = await getSystemInfo(mockVersionFetcher);
      // Mock fetcher returns "1.0.0" for bun
      expect(sysInfo.bunVersion).toBe('1.0.0');
    });

    test('uses real fetcher by default and detects bun', async () => {
      // Test the real fetcher - runs all version checks in parallel
      // This covers the defaultVersionFetcher code path
      const sysInfo = await getSystemInfo();
      // Bun should always be available since we're running tests with it
      expect(sysInfo.bunVersion).toMatch(/^\d+\.\d+/);
      expect(sysInfo.platform).toContain(process.platform);
    });
  });

  describe('version comparison', () => {
    // Testing isNewerVersion logic indirectly via update checking
    // The actual isNewerVersion function is internal to updates.ts
    test('system version is a string', async () => {
      const sysInfo = await getSystemInfo(mockVersionFetcher);
      expect(typeof sysInfo.version).toBe('string');
    });

    test('getPackageVersion returns version string', () => {
      const version = getPackageVersion();
      expect(typeof version).toBe('string');
      // Should be either 'dev' or a semver version
      expect(version === 'dev' || /^\d+\.\d+\.\d+/.test(version)).toBe(true);
    });
  });

  describe('detectAllHooks', () => {
    test('detects configured hooks and runs self-test', () => {
      const tmpBase = join(tmpdir(), `doctor-hooks-${Date.now()}`);
      const homeDir = join(tmpBase, 'home');
      const projectDir = join(tmpBase, 'project');
      mkdirSync(homeDir, { recursive: true });
      mkdirSync(projectDir, { recursive: true });

      const claudeDir = join(homeDir, '.claude');
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(
        join(claudeDir, 'settings.json'),
        JSON.stringify({
          enabledPlugins: { 'safety-net@cc-marketplace': true },
        }),
      );

      const opencodeDir = join(homeDir, '.config', 'opencode');
      mkdirSync(opencodeDir, { recursive: true });
      writeFileSync(
        join(opencodeDir, 'opencode.jsonc'),
        `{
          // comment
          "plugin": ["cc-safety-net",],
        }`,
      );

      const geminiDir = join(homeDir, '.gemini');
      const geminiExtDir = join(geminiDir, 'extensions');
      mkdirSync(geminiExtDir, { recursive: true });
      writeFileSync(
        join(geminiExtDir, 'extension-enablement.json'),
        JSON.stringify({
          'gemini-safety-net': { overrides: ['/Users/kenryu/*'] },
        }),
      );
      writeFileSync(
        join(geminiDir, 'settings.json'),
        JSON.stringify({
          tools: { enableHooks: true },
        }),
      );

      try {
        const hooks = detectAllHooks(projectDir, { homeDir });

        const claude = hooks.find((hook) => hook.platform === 'claude-code');
        expect(claude?.status).toBe('configured');
        expect(claude?.method).toBe('marketplace plugin');
        expect(claude?.selfTest?.failed).toBe(0);

        const opencode = hooks.find((hook) => hook.platform === 'opencode');
        expect(opencode?.status).toBe('configured');
        expect(opencode?.method).toBe('plugin array');
        expect(opencode?.selfTest?.total).toBe(3);

        const gemini = hooks.find((hook) => hook.platform === 'gemini-cli');
        expect(gemini?.status).toBe('configured');
        expect(gemini?.method).toBe('extension plugin');
        expect(gemini?.selfTest?.passed).toBe(gemini?.selfTest?.total);
      } finally {
        rmSync(tmpBase, { recursive: true, force: true });
      }
    });

    test('Claude Code: disabled when enabledPlugins value is false', () => {
      const tmpBase = join(tmpdir(), `doctor-hooks-${Date.now()}`);
      const homeDir = join(tmpBase, 'home');
      const projectDir = join(tmpBase, 'project');
      mkdirSync(homeDir, { recursive: true });
      mkdirSync(projectDir, { recursive: true });

      const claudeDir = join(homeDir, '.claude');
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(
        join(claudeDir, 'settings.json'),
        JSON.stringify({
          enabledPlugins: { 'safety-net@cc-marketplace': false },
        }),
      );

      try {
        const hooks = detectAllHooks(projectDir, { homeDir });
        const claude = hooks.find((hook) => hook.platform === 'claude-code');
        expect(claude?.status).toBe('disabled');
        expect(claude?.method).toBe('marketplace plugin');
      } finally {
        rmSync(tmpBase, { recursive: true, force: true });
      }
    });

    test('reports parse errors for invalid hook configs', () => {
      const tmpBase = join(tmpdir(), `doctor-hooks-${Date.now()}`);
      const homeDir = join(tmpBase, 'home');
      const projectDir = join(tmpBase, 'project');
      mkdirSync(homeDir, { recursive: true });
      mkdirSync(projectDir, { recursive: true });

      const claudeDir = join(homeDir, '.claude');
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(join(claudeDir, 'settings.json'), '{ invalid json }');

      const opencodeDir = join(homeDir, '.config', 'opencode');
      mkdirSync(opencodeDir, { recursive: true });
      writeFileSync(join(opencodeDir, 'opencode.json'), '{ invalid json }');

      const geminiDir = join(homeDir, '.gemini');
      const geminiExtDir = join(geminiDir, 'extensions');
      mkdirSync(geminiExtDir, { recursive: true });
      writeFileSync(join(geminiExtDir, 'extension-enablement.json'), '{ invalid json }');

      try {
        const hooks = detectAllHooks(projectDir, { homeDir });

        const claude = hooks.find((hook) => hook.platform === 'claude-code');
        expect(claude?.status).toBe('n/a');
        expect(claude?.errors?.some((e) => e.includes('Failed to parse'))).toBe(true);

        const opencode = hooks.find((hook) => hook.platform === 'opencode');
        expect(opencode?.status).toBe('n/a');
        expect(opencode?.errors?.some((e) => e.includes('Failed to parse'))).toBe(true);

        const gemini = hooks.find((hook) => hook.platform === 'gemini-cli');
        expect(gemini?.status).toBe('n/a');
        expect(gemini?.errors?.some((e) => e.includes('Failed to parse'))).toBe(true);
      } finally {
        rmSync(tmpBase, { recursive: true, force: true });
      }
    });

    test('Claude Code: returns n/a with error when settings.json is invalid', () => {
      const tmpBase = join(tmpdir(), `doctor-hooks-${Date.now()}`);
      const homeDir = join(tmpBase, 'home');
      const projectDir = join(tmpBase, 'project');
      mkdirSync(homeDir, { recursive: true });
      mkdirSync(projectDir, { recursive: true });

      // settings.json is broken
      const claudeDir = join(homeDir, '.claude');
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(join(claudeDir, 'settings.json'), '{ invalid json }');

      try {
        const hooks = detectAllHooks(projectDir, { homeDir });
        const claude = hooks.find((hook) => hook.platform === 'claude-code');

        // Should return n/a status with parse error
        expect(claude?.status).toBe('n/a');
        expect(claude?.errors?.some((e) => e.includes('Failed to parse'))).toBe(true);
      } finally {
        rmSync(tmpBase, { recursive: true, force: true });
      }
    });

    test('continues checking fallback configs after parse errors (OpenCode)', () => {
      const tmpBase = join(tmpdir(), `doctor-hooks-${Date.now()}`);
      const homeDir = join(tmpBase, 'home');
      const projectDir = join(tmpBase, 'project');
      mkdirSync(homeDir, { recursive: true });
      mkdirSync(projectDir, { recursive: true });

      const opencodeDir = join(homeDir, '.config', 'opencode');
      mkdirSync(opencodeDir, { recursive: true });

      // Primary config (opencode.json) is broken
      writeFileSync(join(opencodeDir, 'opencode.json'), '{ invalid json }');

      // Secondary config (opencode.jsonc) is valid and has plugin configured
      writeFileSync(
        join(opencodeDir, 'opencode.jsonc'),
        `{
          // This is valid JSONC
          "plugin": ["cc-safety-net"]
        }`,
      );

      try {
        const hooks = detectAllHooks(projectDir, { homeDir });
        const opencode = hooks.find((hook) => hook.platform === 'opencode');

        // Should find the plugin in secondary config despite primary being broken
        expect(opencode?.status).toBe('configured');
        expect(opencode?.method).toBe('plugin array');
        // Should still report the error from the broken primary config
        expect(opencode?.errors?.some((e) => e.includes('Failed to parse'))).toBe(true);
      } finally {
        rmSync(tmpBase, { recursive: true, force: true });
      }
    });

    test('Gemini CLI: disabled when overrides is empty', () => {
      const tmpBase = join(tmpdir(), `doctor-gemini-${Date.now()}`);
      const homeDir = join(tmpBase, 'home');
      const projectDir = join(tmpBase, 'project');
      mkdirSync(homeDir, { recursive: true });
      mkdirSync(projectDir, { recursive: true });

      const geminiExtDir = join(homeDir, '.gemini', 'extensions');
      mkdirSync(geminiExtDir, { recursive: true });
      writeFileSync(
        join(geminiExtDir, 'extension-enablement.json'),
        JSON.stringify({
          'gemini-safety-net': { overrides: [] },
        }),
      );

      try {
        const hooks = detectAllHooks(projectDir, { homeDir });
        const gemini = hooks.find((hook) => hook.platform === 'gemini-cli');
        expect(gemini?.status).toBe('disabled');
        expect(gemini?.errors?.some((e) => e.includes('no enabled workspace overrides'))).toBe(
          true,
        );
      } finally {
        rmSync(tmpBase, { recursive: true, force: true });
      }
    });

    test('Gemini CLI: disabled when all overrides are negated', () => {
      const tmpBase = join(tmpdir(), `doctor-gemini-${Date.now()}`);
      const homeDir = join(tmpBase, 'home');
      const projectDir = join(tmpBase, 'project');
      mkdirSync(homeDir, { recursive: true });
      mkdirSync(projectDir, { recursive: true });

      const geminiExtDir = join(homeDir, '.gemini', 'extensions');
      mkdirSync(geminiExtDir, { recursive: true });
      writeFileSync(
        join(geminiExtDir, 'extension-enablement.json'),
        JSON.stringify({
          'gemini-safety-net': { overrides: ['!/Users/disabled/*', '!/other/*'] },
        }),
      );

      try {
        const hooks = detectAllHooks(projectDir, { homeDir });
        const gemini = hooks.find((hook) => hook.platform === 'gemini-cli');
        expect(gemini?.status).toBe('disabled');
        expect(gemini?.errors?.some((e) => e.includes('no enabled workspace overrides'))).toBe(
          true,
        );
      } finally {
        rmSync(tmpBase, { recursive: true, force: true });
      }
    });

    test('Gemini CLI: not configured when hooks not enabled in settings', () => {
      const tmpBase = join(tmpdir(), `doctor-gemini-${Date.now()}`);
      const homeDir = join(tmpBase, 'home');
      const projectDir = join(tmpBase, 'project');
      mkdirSync(homeDir, { recursive: true });
      mkdirSync(projectDir, { recursive: true });

      const geminiDir = join(homeDir, '.gemini');
      const geminiExtDir = join(geminiDir, 'extensions');
      mkdirSync(geminiExtDir, { recursive: true });
      writeFileSync(
        join(geminiExtDir, 'extension-enablement.json'),
        JSON.stringify({
          'gemini-safety-net': { overrides: ['/Users/kenryu/*'] },
        }),
      );
      // No settings.json or tools.enableHooks not set

      try {
        const hooks = detectAllHooks(projectDir, { homeDir });
        const gemini = hooks.find((hook) => hook.platform === 'gemini-cli');
        expect(gemini?.status).toBe('n/a');
        expect(gemini?.errors?.some((e) => e.includes('tools.enableHooks'))).toBe(true);
      } finally {
        rmSync(tmpBase, { recursive: true, force: true });
      }
    });

    test('Gemini CLI: uses local project settings.json for hooks check', () => {
      const tmpBase = join(tmpdir(), `doctor-gemini-${Date.now()}`);
      const homeDir = join(tmpBase, 'home');
      const projectDir = join(tmpBase, 'project');
      mkdirSync(homeDir, { recursive: true });
      mkdirSync(projectDir, { recursive: true });

      const geminiExtDir = join(homeDir, '.gemini', 'extensions');
      mkdirSync(geminiExtDir, { recursive: true });
      writeFileSync(
        join(geminiExtDir, 'extension-enablement.json'),
        JSON.stringify({
          'gemini-safety-net': { overrides: ['/Users/kenryu/*'] },
        }),
      );

      // enableHooks in local project settings instead of global
      const localGeminiDir = join(projectDir, '.gemini');
      mkdirSync(localGeminiDir, { recursive: true });
      writeFileSync(
        join(localGeminiDir, 'settings.json'),
        JSON.stringify({
          tools: { enableHooks: true },
        }),
      );

      try {
        const hooks = detectAllHooks(projectDir, { homeDir });
        const gemini = hooks.find((hook) => hook.platform === 'gemini-cli');
        expect(gemini?.status).toBe('configured');
        expect(gemini?.method).toBe('extension plugin');
      } finally {
        rmSync(tmpBase, { recursive: true, force: true });
      }
    });

    test('Gemini CLI: not configured when plugin key does not exist', () => {
      const tmpBase = join(tmpdir(), `doctor-gemini-${Date.now()}`);
      const homeDir = join(tmpBase, 'home');
      const projectDir = join(tmpBase, 'project');
      mkdirSync(homeDir, { recursive: true });
      mkdirSync(projectDir, { recursive: true });

      const geminiExtDir = join(homeDir, '.gemini', 'extensions');
      mkdirSync(geminiExtDir, { recursive: true });
      writeFileSync(
        join(geminiExtDir, 'extension-enablement.json'),
        JSON.stringify({
          'other-plugin': { overrides: ['/Users/kenryu/*'] },
        }),
      );

      try {
        const hooks = detectAllHooks(projectDir, { homeDir });
        const gemini = hooks.find((hook) => hook.platform === 'gemini-cli');
        expect(gemini?.status).toBe('n/a');
        expect(gemini?.errors).toBeUndefined();
      } finally {
        rmSync(tmpBase, { recursive: true, force: true });
      }
    });
  });

  describe('stripJsonComments', () => {
    test('removes single-line comments', () => {
      const input = `{
        "key": "value" // this is a comment
      }`;
      const result = stripJsonComments(input);
      expect(JSON.parse(result)).toEqual({ key: 'value' });
    });

    test('removes multi-line comments', () => {
      const input = `{
        /* comment */
        "key": "value"
      }`;
      const result = stripJsonComments(input);
      expect(JSON.parse(result)).toEqual({ key: 'value' });
    });

    test('removes trailing commas before }', () => {
      const input = `{
        "key": "value",
      }`;
      const result = stripJsonComments(input);
      expect(JSON.parse(result)).toEqual({ key: 'value' });
    });

    test('removes trailing commas before ]', () => {
      const input = `{
        "arr": ["a", "b",]
      }`;
      const result = stripJsonComments(input);
      expect(JSON.parse(result)).toEqual({ arr: ['a', 'b'] });
    });

    test('handles comments inside arrays', () => {
      const input = `{
        "arr": [
          // "commented-out",
          "active"
        ]
      }`;
      const result = stripJsonComments(input);
      expect(JSON.parse(result)).toEqual({ arr: ['active'] });
    });

    test('preserves // inside strings', () => {
      const input = `{
        "url": "https://example.com"
      }`;
      const result = stripJsonComments(input);
      expect(JSON.parse(result)).toEqual({ url: 'https://example.com' });
    });

    test('preserves /* inside strings', () => {
      const input = `{
        "pattern": "/* glob */"
      }`;
      const result = stripJsonComments(input);
      expect(JSON.parse(result)).toEqual({ pattern: '/* glob */' });
    });

    test('handles escaped quotes in strings', () => {
      const input = `{
        "escaped": "say \\"hello\\""
      }`;
      const result = stripJsonComments(input);
      expect(JSON.parse(result)).toEqual({ escaped: 'say "hello"' });
    });

    test('preserves comma-bracket sequences inside strings', () => {
      // Regression test: trailing comma regex must not corrupt string values
      const input = `{"pattern": ",]", "other": ",}"}`;
      const result = stripJsonComments(input);
      expect(JSON.parse(result)).toEqual({ pattern: ',]', other: ',}' });
    });

    test('preserves complex patterns inside strings with trailing commas outside', () => {
      // Combine both: string containing ,] AND actual trailing comma
      const input = `{
        "pattern": ",]",
        "arr": ["a", "b",],
      }`;
      const result = stripJsonComments(input);
      expect(JSON.parse(result)).toEqual({ pattern: ',]', arr: ['a', 'b'] });
    });

    test('handles complex JSONC like opencode config', () => {
      const input = `{
        "$schema": "https://opencode.ai/config.json",
        "plugin": [
          // "disabled-plugin",
          "active-plugin",
        ],
        "options": {
          "key": "value", /* trailing */
        }
      }`;
      const result = stripJsonComments(input);
      const parsed = JSON.parse(result);
      expect(parsed.$schema).toBe('https://opencode.ai/config.json');
      expect(parsed.plugin).toEqual(['active-plugin']);
      expect(parsed.options).toEqual({ key: 'value' });
    });
  });
});
