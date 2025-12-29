#!/usr/bin/env bun
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as tar from 'tar';

const DIFFTASTIC_VERSION = '0.67.0';
const RIPGREP_VERSION = '15.1.0';

const PLATFORMS = [
    { name: 'arm64-darwin', difft: 'aarch64-apple-darwin', rg: 'aarch64-apple-darwin' },
    { name: 'arm64-linux', difft: 'aarch64-unknown-linux-gnu', rg: 'aarch64-unknown-linux-gnu' },
    { name: 'x64-darwin', difft: 'x86_64-apple-darwin', rg: 'x86_64-apple-darwin' },
    { name: 'x64-linux', difft: 'x86_64-unknown-linux-gnu', rg: 'x86_64-unknown-linux-musl' },
    { name: 'x64-win32', difft: 'x86_64-pc-windows-msvc', rg: 'x86_64-pc-windows-msvc' }
];

async function downloadFile(url: string, dest: string): Promise<void> {
    console.log(`Downloading ${url}...`);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download ${url}: ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    writeFileSync(dest, new Uint8Array(buffer));
}

async function downloadDifftastic(platform: typeof PLATFORMS[0], tempDir: string): Promise<string> {
    const isWin = platform.name === 'x64-win32';
    const ext = isWin ? 'zip' : 'tar.gz';
    const filename = `difft-${platform.difft}.${ext}`;
    const url = `https://github.com/Wilfred/difftastic/releases/download/${DIFFTASTIC_VERSION}/${filename}`;
    const dest = join(tempDir, filename);
    await downloadFile(url, dest);
    return dest;
}

async function downloadRipgrep(platform: typeof PLATFORMS[0], tempDir: string): Promise<string> {
    const isWin = platform.name === 'x64-win32';
    const ext = isWin ? 'zip' : 'tar.gz';
    const filename = `ripgrep-${RIPGREP_VERSION}-${platform.rg}.${ext}`;
    const url = `https://github.com/BurntSushi/ripgrep/releases/download/${RIPGREP_VERSION}/${filename}`;
    const dest = join(tempDir, filename);
    await downloadFile(url, dest);
    return dest;
}

async function extractAndRepackage(archivePath: string, outputPath: string, binaryName: string): Promise<void> {
    const tempExtract = join(dirname(archivePath), 'extract-temp');
    mkdirSync(tempExtract, { recursive: true });

    const isZip = archivePath.endsWith('.zip');
    if (isZip) {
        const proc = Bun.spawn(['unzip', '-q', archivePath, '-d', tempExtract]);
        await proc.exited;
    } else {
        await tar.extract({ file: archivePath, cwd: tempExtract });
    }

    // Find the binary
    const findProc = Bun.spawn(['find', tempExtract, '-name', binaryName, '-type', 'f'], {
        stdout: 'pipe'
    });
    const findOutput = await new Response(findProc.stdout).text();
    const binaryPath = findOutput.trim().split('\n')[0];

    if (!binaryPath) {
        throw new Error(`Binary ${binaryName} not found in ${archivePath}`);
    }

    // Create tar.gz with just the binary
    await tar.create(
        {
            gzip: true,
            file: outputPath,
            cwd: dirname(binaryPath)
        },
        [binaryName]
    );

    rmSync(tempExtract, { recursive: true, force: true });
}

async function downloadLicenses(archivesDir: string): Promise<void> {
    const difftLicense = await fetch('https://raw.githubusercontent.com/Wilfred/difftastic/master/LICENSE');
    writeFileSync(join(archivesDir, 'difftastic-LICENSE'), await difftLicense.text());

    const rgLicense = await fetch('https://raw.githubusercontent.com/BurntSushi/ripgrep/master/LICENSE-MIT');
    writeFileSync(join(archivesDir, 'ripgrep-LICENSE'), await rgLicense.text());
}

async function main(): Promise<void> {
    const scriptDir = dirname(fileURLToPath(import.meta.url));
    const projectRoot = join(scriptDir, '..');
    const archivesDir = join(projectRoot, 'tools', 'archives');
    const tempDir = join(projectRoot, 'tools', 'temp-downloads');

    mkdirSync(tempDir, { recursive: true });

    console.log('Downloading licenses...');
    await downloadLicenses(archivesDir);

    for (const platform of PLATFORMS) {
        console.log(`\nProcessing ${platform.name}...`);

        const isWin = platform.name === 'x64-win32';
        const difftBinary = isWin ? 'difft.exe' : 'difft';
        const rgBinary = isWin ? 'rg.exe' : 'rg';

        // Download and repackage difftastic
        const difftArchive = await downloadDifftastic(platform, tempDir);
        const difftOutput = join(archivesDir, `difftastic-${platform.name}.tar.gz`);
        await extractAndRepackage(difftArchive, difftOutput, difftBinary);
        console.log(`✓ Created ${difftOutput}`);

        // Download and repackage ripgrep
        const rgArchive = await downloadRipgrep(platform, tempDir);
        const rgOutput = join(archivesDir, `ripgrep-${platform.name}.tar.gz`);
        await extractAndRepackage(rgArchive, rgOutput, rgBinary);
        console.log(`✓ Created ${rgOutput}`);
    }

    rmSync(tempDir, { recursive: true, force: true });
    console.log('\n✓ All archives updated successfully!');
}

main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
});
