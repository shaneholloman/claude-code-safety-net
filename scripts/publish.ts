#!/usr/bin/env bun

import { $ } from 'bun';
import { formatReleaseNotes, generateChangelog, getContributors } from './generate-changelog';

const PACKAGE_NAME = 'cc-safety-net';

const bump = process.env.BUMP as 'major' | 'minor' | 'patch' | undefined;
const versionOverride = process.env.VERSION;
const dryRun = process.argv.includes('--dry-run');

console.log(`=== ${dryRun ? '[DRY-RUN] ' : ''}Publishing cc-safety-net ===\n`);

async function fetchPreviousVersion(): Promise<string> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`);
    if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);
    const data = (await res.json()) as { version: string };
    console.log(`Previous version: ${data.version}`);
    return data.version;
  } catch {
    console.log('No previous version found, starting from 0.0.0');
    return '0.0.0';
  }
}

function bumpVersion(version: string, type: 'major' | 'minor' | 'patch'): string {
  const parts = version.split('.').map((part) => Number(part));
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
  }
}

async function updatePackageVersion(newVersion: string): Promise<void> {
  const pkgPath = new URL('../package.json', import.meta.url).pathname;
  if (dryRun) {
    console.log(`Would update: ${pkgPath}`);
    return;
  }
  let pkg = await Bun.file(pkgPath).text();
  pkg = pkg.replace(/"version": "[^"]+"/, `"version": "${newVersion}"`);
  await Bun.write(pkgPath, pkg);
  console.log(`Updated: ${pkgPath}`);
}

async function updatePluginVersion(newVersion: string): Promise<void> {
  const pluginPath = new URL('../.claude-plugin/plugin.json', import.meta.url).pathname;
  if (dryRun) {
    console.log(`Would update: ${pluginPath}`);
    return;
  }
  let plugin = await Bun.file(pluginPath).text();
  plugin = plugin.replace(/"version": "[^"]+"/, `"version": "${newVersion}"`);
  await Bun.write(pluginPath, plugin);
  console.log(`Updated: ${pluginPath}`);
}

async function buildAndPublish(): Promise<void> {
  // Build AFTER version files are updated so correct version is injected into bundle
  console.log('\nBuilding...');
  const buildResult = Bun.spawnSync(['bun', 'run', 'build']);
  if (buildResult.exitCode !== 0) {
    console.error('Build failed');
    console.error(buildResult.stderr.toString());
    process.exit(1);
  }

  if (dryRun) {
    console.log('Would publish to npm');
    return;
  }
  console.log('Publishing to npm...');
  if (process.env.CI) {
    await $`npm publish --access public --provenance --ignore-scripts`;
  } else {
    await $`npm publish --access public --ignore-scripts`;
  }
}

async function gitTagAndRelease(newVersion: string, notes: string[]): Promise<void> {
  if (dryRun) {
    console.log('\nWould commit, tag, push, and create GitHub release (CI only)');
    return;
  }
  if (!process.env.CI) return;

  console.log('\nCommitting and tagging...');
  await $`git config user.email "github-actions[bot]@users.noreply.github.com"`;
  await $`git config user.name "github-actions[bot]"`;
  await $`git add package.json .claude-plugin/plugin.json assets/cc-safety-net.schema.json dist/`;

  const hasStagedChanges = await $`git diff --cached --quiet`.nothrow();
  if (hasStagedChanges.exitCode !== 0) {
    await $`git commit -m "release: v${newVersion}"`;
  } else {
    console.log('No changes to commit (version already updated)');
  }

  const tagExists = await $`git rev-parse v${newVersion}`.nothrow();
  if (tagExists.exitCode !== 0) {
    await $`git tag v${newVersion}`;
  } else {
    console.log(`Tag v${newVersion} already exists`);
  }

  await $`git push origin HEAD --tags`;

  console.log('\nCreating GitHub release...');
  const releaseNotes = notes.length > 0 ? notes.join('\n') : 'No notable changes';
  const releaseExists = await $`gh release view v${newVersion}`.nothrow();
  if (releaseExists.exitCode !== 0) {
    await $`gh release create v${newVersion} --title "v${newVersion}" --notes ${releaseNotes}`;
  } else {
    console.log(`Release v${newVersion} already exists`);
  }
}

async function checkVersionExists(version: string): Promise<boolean> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/${version}`);
    return res.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const previous = await fetchPreviousVersion();
  const newVersion =
    versionOverride || (bump ? bumpVersion(previous, bump) : bumpVersion(previous, 'patch'));
  console.log(`New version: ${newVersion}\n`);

  if (await checkVersionExists(newVersion)) {
    console.log(`Version ${newVersion} already exists on npm. Skipping publish.`);
    process.exit(0);
  }

  await updatePackageVersion(newVersion);
  await updatePluginVersion(newVersion);
  const changelog = await generateChangelog(`v${previous}`);
  const contributors = await getContributors(`v${previous}`);
  const notes = formatReleaseNotes(changelog, contributors);

  await buildAndPublish();
  await gitTagAndRelease(newVersion, notes);

  if (dryRun) {
    console.log('\n--- Release Notes ---');
    console.log(notes.length > 0 ? notes.join('\n') : 'No notable changes');
    console.log(`\n=== [DRY-RUN] Would publish ${PACKAGE_NAME}@${newVersion} ===`);
  } else {
    console.log(`\n=== Successfully published ${PACKAGE_NAME}@${newVersion} ===`);
  }
}

main();
