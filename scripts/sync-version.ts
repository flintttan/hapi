#!/usr/bin/env bun
/**
 * Sync version from version.json to all package.json files
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const versionFile = join(rootDir, 'version.json');

// Read central version
const { version } = JSON.parse(readFileSync(versionFile, 'utf-8'));
console.log(`Syncing version ${version} to all package.json files...`);

// Package.json files to update
const packages = [
  'cli/package.json',
  'hub/package.json',
  'web/package.json',
];

let updateCount = 0;

for (const pkgPath of packages) {
  const fullPath = join(rootDir, pkgPath);
  try {
    const pkgContent = readFileSync(fullPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);

    const oldVersion = pkg.version;
    pkg.version = version;

    // Update optionalDependencies for cli package
    if (pkg.optionalDependencies) {
      for (const dep in pkg.optionalDependencies) {
        if (dep.startsWith('@flintttan/hapi-')) {
          pkg.optionalDependencies[dep] = version;
        }
      }
    }

    // Write with proper formatting
    writeFileSync(fullPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`✓ Updated ${pkgPath}: ${oldVersion} → ${version}`);
    updateCount++;
  } catch (error) {
    console.error(`✗ Failed to update ${pkgPath}:`, error);
    process.exit(1);
  }
}

console.log(`\n✓ Successfully updated ${updateCount} package.json files to version ${version}`);
