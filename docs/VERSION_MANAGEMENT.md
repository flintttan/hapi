# Version Management

This project uses a centralized version management system where all version information is stored in a single `version.json` file at the project root.

## Quick Start

### Bump Version

To update the version:

```bash
# Method 1: Use the bump-version script (recommended)
bun bump-version 0.5.13

# Method 2: Manual update
# 1. Edit version.json
# 2. Run sync script
bun run sync-version
```

The `bump-version` script will:
1. Update `version.json`
2. Sync the version to all `package.json` files (cli, server, web)
3. Update optionalDependencies in cli/package.json

### Release Process

After bumping the version:

```bash
# 1. Review changes
git diff

# 2. Commit changes
git add -A
git commit -m "Bump version to X.Y.Z"

# 3. Create and push tag
git tag vX.Y.Z
git push origin main --tags
```

### Automated Releases

When you push a tag (e.g., `v0.5.11`), GitHub Actions will automatically:

1. **Release Workflow** (`release.yml`)
   - Build executables for all platforms
   - Create GitHub Release with artifacts
   - Update Homebrew formula

2. **NPM Publish Workflow** (`npm-publish.yml`)
   - Build and publish npm packages for all platforms
   - Create GitHub Release notes

3. **Docker Build Workflow** (`docker-server.yml`)
   - Build and push Docker image to GHCR
   - Tag with version number and `latest`

## File Structure

```
.
├── version.json                    # Single source of truth for version
├── scripts/
│   ├── bump-version.ts            # Script to bump version and sync
│   └── sync-version.ts            # Script to sync version to package.json files
├── cli/package.json               # Synced from version.json
├── server/package.json            # Synced from version.json
├── web/package.json               # Synced from version.json
└── .github/workflows/
    ├── release.yml                # Reads version from version.json
    ├── npm-publish.yml            # Reads version from version.json
    └── docker-server.yml          # Reads version from version.json
```

## Benefits

- **Single Source of Truth**: Only need to update version in one place
- **Automated Sync**: Scripts ensure all package.json files stay in sync
- **CI/CD Integration**: GitHub Actions read directly from version.json
- **Reduced Errors**: Eliminates version mismatches across packages
- **Easy Rollback**: Simple to revert version changes

## Scripts

Available in root `package.json`:

```bash
bun run bump-version 0.5.13  # Bump version and sync all files
bun run sync-version         # Sync version from version.json to package.json files
```
