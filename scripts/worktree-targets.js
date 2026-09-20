const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

function parseWorktreeListPorcelain(output) {
  const entries = [];
  const lines = output.split(/\r?\n/);
  let current = null;

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      if (current) {
        entries.push(current);
      }
      current = { path: line.slice('worktree '.length), branch: null };
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length);
      continue;
    }

    if (line.trim() === '') {
      entries.push(current);
      current = null;
    }
  }

  if (current) {
    entries.push(current);
  }

  return entries;
}

function getMainWorktreeRoot(projectRoot, exec = (command, options) => execSync(command, options)) {
  try {
    const output = exec('git worktree list --porcelain', {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const entries = parseWorktreeListPorcelain(output);
    const mainEntry = entries.find((entry) => entry.branch === 'refs/heads/main');
    return mainEntry?.path || projectRoot;
  } catch {
    return projectRoot;
  }
}

function findNearestVaultRoot(projectRoot, exists = fs.existsSync) {
  let currentDir = path.resolve(projectRoot);

  while (true) {
    if (exists(path.join(currentDir, '.obsidian'))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

function getPluginTargetDirs(
  projectRoot,
  exec = (command, options) => execSync(command, options),
  exists = fs.existsSync
) {
  const mainRoot = getMainWorktreeRoot(projectRoot, exec);
  const targets = [];
  const seen = new Set();

  const addTarget = (label, dirPath) => {
    const normalizedDirPath = path.resolve(dirPath);
    if (seen.has(normalizedDirPath)) {
      return;
    }
    seen.add(normalizedDirPath);
    targets.push({ label, dirPath: normalizedDirPath });
  };

  const workspaceVaultRoot = findNearestVaultRoot(projectRoot, exists);
  if (workspaceVaultRoot) {
    addTarget('workspace-vault', path.join(workspaceVaultRoot, '.obsidian/plugins/atlas-vtt'));
  }

  addTarget('test-vault', path.join(mainRoot, 'test-vault/.obsidian/plugins/atlas-vtt'));

  // Extra vaults to copy builds into, e.g. ATLAS_DEV_VAULTS="/path/to/VaultA:/path/to/VaultB"
  (process.env.ATLAS_DEV_VAULTS || '')
    .split(path.delimiter)
    .filter(Boolean)
    .forEach((vaultRoot) => addTarget(path.basename(vaultRoot), path.join(vaultRoot, '.obsidian/plugins/atlas-vtt')));

  // Never create a vault: only copy into vaults that already exist on this machine.
  return targets.filter((target) => exists(path.resolve(target.dirPath, '../..')));
}

module.exports = {
  findNearestVaultRoot,
  parseWorktreeListPorcelain,
  getMainWorktreeRoot,
  getPluginTargetDirs,
};
