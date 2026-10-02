const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

const PLUGIN_ID = 'atlas-vtt';

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

/**
 * Where Obsidian records the vaults it knows about. The same file every
 * Obsidian install writes, so no configuration is needed on a dev machine.
 */
function obsidianConfigPath(platform = process.platform, env = process.env, home = os.homedir()) {
  if (platform === 'win32') {
    return path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'obsidian', 'obsidian.json');
  }
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'obsidian', 'obsidian.json');
  }
  return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'obsidian', 'obsidian.json');
}

/**
 * Vaults on this machine that already hold an Atlas install, read from
 * Obsidian's own vault list. A vault only qualifies once the plugin folder is
 * there: a build is copied over an existing install, never dropped into a vault
 * that never asked for one. A repo checked out beside its vaults — rather than
 * inside one — is found this way without an `ATLAS_DEV_VAULTS` entry.
 */
function findInstalledVaultRoots(configPath = obsidianConfigPath(), exists = fs.existsSync, read = fs.readFileSync) {
  if (!exists(configPath)) return [];

  let vaults;
  try {
    ({ vaults } = JSON.parse(read(configPath, 'utf8')));
  } catch {
    // A half-written or hand-edited config is not worth failing a build over.
    return [];
  }

  return Object.values(vaults || {})
    .map((vault) => vault && vault.path)
    .filter((vaultRoot) => typeof vaultRoot === 'string' && vaultRoot.length > 0)
    .filter((vaultRoot) => exists(path.join(vaultRoot, '.obsidian', 'plugins', PLUGIN_ID)));
}

function getPluginTargetDirs(
  projectRoot,
  exec = (command, options) => execSync(command, options),
  exists = fs.existsSync,
  installedVaultRoots = findInstalledVaultRoots(obsidianConfigPath(), exists)
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

  // Every vault on this machine that already runs Atlas, so a repo beside its
  // vaults rather than inside one still gets the build.
  installedVaultRoots.forEach((vaultRoot) =>
    addTarget(path.basename(vaultRoot), path.join(vaultRoot, '.obsidian/plugins/atlas-vtt'))
  );

  // Extra vaults to copy builds into, e.g. ATLAS_DEV_VAULTS="/path/to/VaultA:/path/to/VaultB"
  (process.env.ATLAS_DEV_VAULTS || '')
    .split(path.delimiter)
    .filter(Boolean)
    .forEach((vaultRoot) => addTarget(path.basename(vaultRoot), path.join(vaultRoot, '.obsidian/plugins/atlas-vtt')));

  // Never create a vault: only copy into vaults that already exist on this machine.
  return targets.filter((target) => exists(path.resolve(target.dirPath, '../..')));
}

/**
 * Asks the Hot Reload plugin (pjeby/hot-reload) to watch this plugin folder. It only
 * reloads plugins whose folder holds a `.git` or `.hotreload` entry, and a copied
 * build carries neither, so a recreated folder would otherwise stop reloading.
 */
function markForHotReload(pluginDir) {
  const marker = path.join(pluginDir, '.hotreload');
  if (!fs.existsSync(marker)) fs.writeFileSync(marker, '');
}

module.exports = {
  findNearestVaultRoot,
  findInstalledVaultRoots,
  obsidianConfigPath,
  parseWorktreeListPorcelain,
  getMainWorktreeRoot,
  getPluginTargetDirs,
  markForHotReload,
};
