import { createRequire } from 'module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  injectVaultArg,
  resolveObsidianCliBinary,
} = require('../../scripts/obsidian-cli.js');

describe('obsidian cli command helper', () => {
  it('prefers the explicit OBSIDIAN_CLI_BIN when it exists', () => {
    const binary = resolveObsidianCliBinary({
      env: {
        OBSIDIAN_CLI_BIN: '/custom/bin/obsidian',
        HOME: '/Users/tester',
      },
      isExecutable: (candidate: string) => candidate === '/custom/bin/obsidian',
      commandExists: () => false,
    });

    expect(binary).toBe('/custom/bin/obsidian');
  });

  it('falls back to the user Applications bundle before the system Applications bundle', () => {
    const binary = resolveObsidianCliBinary({
      env: {
        HOME: '/Users/tester',
      },
      isExecutable: (candidate: string) =>
        candidate === '/Users/tester/Applications/Obsidian.app/Contents/MacOS/Obsidian',
      commandExists: () => false,
    });

    expect(binary).toBe('/Users/tester/Applications/Obsidian.app/Contents/MacOS/Obsidian');
  });

  it('falls back to the local obsidian shim before app bundle discovery', () => {
    const binary = resolveObsidianCliBinary({
      env: {
        HOME: '/Users/tester',
      },
      isExecutable: (candidate: string) => candidate === '/Users/tester/.local/bin/obsidian',
      commandExists: () => false,
    });

    expect(binary).toBe('/Users/tester/.local/bin/obsidian');
  });

  it('prefers the concrete local shim path before a PATH lookup', () => {
    const binary = resolveObsidianCliBinary({
      env: {
        HOME: '/Users/tester',
      },
      isExecutable: (candidate: string) => candidate === '/Users/tester/.local/bin/obsidian',
      commandExists: () => true,
    });

    expect(binary).toBe('/Users/tester/.local/bin/obsidian');
  });

  it('returns the plain obsidian command when it is already installed on PATH', () => {
    const binary = resolveObsidianCliBinary({
      env: {
        HOME: '/Users/tester',
      },
      isExecutable: () => false,
      commandExists: (command: string) => command === 'obsidian',
    });

    expect(binary).toBe('obsidian');
  });

  it('injects a vault argument once and preserves existing explicit vault targeting', () => {
    expect(injectVaultArg(['id=atlas-vtt'], 'test-vault')).toEqual([
      'vault=test-vault',
      'id=atlas-vtt',
    ]);

    expect(injectVaultArg(['vault=networking-test-vault', 'id=atlas-vtt'], 'test-vault')).toEqual([
      'vault=networking-test-vault',
      'id=atlas-vtt',
    ]);
  });
});
