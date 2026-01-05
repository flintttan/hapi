#!/usr/bin/env bun
/**
 * Update version in version.json and sync to all package.json files
 * Usage: bun scripts/bump-version.ts <new-version>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const versionFile = join(rootDir, 'version.json');

// Get new version from command line
const newVersion = process.argv[2];

if (!newVersion) {
  console.error('Usage: bun scripts/bump-version.ts <new-version>');
  console.error('Example: bun scripts/bump-version.ts 0.5.11');
  process.exit(1);
}

// Validate version format (basic semver check)
if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/.test(newVersion)) {
  console.error(`Invalid version format: ${newVersion}`);
  console.error('Expected format: X.Y.Z or X.Y.Z-suffix');
  process.exit(1);
}

// Read current version
const versionData = JSON.parse(readFileSync(versionFile, 'utf-8'));
const oldVersion = versionData.version;

console.log(`Updating version: ${oldVersion} → ${newVersion}`);

// Update version.json
versionData.version = newVersion;
writeFileSync(versionFile, JSON.stringify(versionData, null, 2) + '\n');
console.log(`✓ Updated version.json`);

// Run sync script
console.log('\nSyncing version to package.json files...');
const result = spawnSync('bun', ['scripts/sync-version.ts'], {
  cwd: rootDir,
  stdio: 'inherit',
});

if (result.status !== 0) {
  console.error('Failed to sync version');
  process.exit(1);
}

console.log(`\n✓ Version bumped successfully: ${oldVersion} → ${newVersion}`);
console.log(`\nNext steps:`);
console.log(`  1. Review changes: git diff`);
console.log(`  2. Commit: git add -A && git commit -m "Bump version to ${newVersion}"`);
console.log(`  3. Tag: git tag v${newVersion}`);
console.log(`  4. Push: git push && git push --tags`);
