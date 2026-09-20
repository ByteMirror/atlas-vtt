const { execFileSync } = require('child_process');
const os = require('os');

function getCandidateBinaryPaths(homeDir = os.homedir()) {
  return [
    `${homeDir}/.local/bin/obsidian`,
    `${homeDir}/Applications/Obsidian.app/Contents/MacOS/Obsidian`,
    '/Applications/Obsidian.app/Contents/MacOS/Obsidian',
  ];
}

function commandExists(command) {
  try {
    execFileSync('/bin/zsh', ['-lc', `command -v ${command}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return true;
  } catch (_error) {
    return false;
  }
}

function isExecutable(candidate) {
  try {
    execFileSync('/bin/test', ['-x', candidate], { stdio: 'ignore' });
    return true;
  } catch (_error) {
    return false;
  }
}

function resolveObsidianCliBinary(deps = {}) {
  const env = deps.env || process.env;
  const executableCheck = deps.isExecutable || isExecutable;
  const commandCheck = deps.commandExists || commandExists;
  const homeDir = env.HOME || os.homedir();

  if (env.OBSIDIAN_CLI_BIN && executableCheck(env.OBSIDIAN_CLI_BIN)) {
    return env.OBSIDIAN_CLI_BIN;
  }

  for (const candidate of getCandidateBinaryPaths(homeDir)) {
    if (executableCheck(candidate)) {
      return candidate;
    }
  }

  if (commandCheck('obsidian')) {
    return 'obsidian';
  }

  if (commandCheck('Obsidian')) {
    return 'Obsidian';
  }

  throw new Error(
    "Unable to locate the Obsidian CLI binary. Set OBSIDIAN_CLI_BIN, install the obsidian shim in ~/.local/bin, or install Obsidian in ~/Applications or /Applications."
  );
}

function injectVaultArg(args = [], vault) {
  if (!vault) {
    return [...args];
  }

  if (args.some((arg) => typeof arg === 'string' && arg.startsWith('vault='))) {
    return [...args];
  }

  return [`vault=${vault}`, ...args];
}

function parseWrapperArgs(argv, env = process.env) {
  const options = {
    obsidianBin: env.OBSIDIAN_CLI_BIN || null,
    vault: env.OBSIDIAN_CLI_VAULT || null,
    command: null,
    args: [],
    help: false,
    printBin: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    const next = argv[index + 1];

    if (token === '--help' || token === '-h') {
      options.help = true;
      continue;
    }

    if (token === '--print-bin') {
      options.printBin = true;
      continue;
    }

    if (token === '--obsidian-bin' && next) {
      options.obsidianBin = next;
      index += 1;
      continue;
    }
    if (token.startsWith('--obsidian-bin=')) {
      options.obsidianBin = token.slice('--obsidian-bin='.length);
      continue;
    }

    if (token === '--vault' && next) {
      options.vault = next;
      index += 1;
      continue;
    }
    if (token.startsWith('--vault=')) {
      options.vault = token.slice('--vault='.length);
      continue;
    }

    if (!options.command) {
      options.command = token;
      continue;
    }

    options.args.push(token);
  }

  return options;
}

function runObsidianCliCommand(command, args = [], deps = {}) {
  const env = deps.env || process.env;
  const binary =
    deps.obsidianBin ||
    resolveObsidianCliBinary({
      env: {
        ...env,
        ...(deps.obsidianBin ? { OBSIDIAN_CLI_BIN: deps.obsidianBin } : {}),
      },
      isExecutable: deps.isExecutable,
      commandExists: deps.commandExists,
    });

  const finalArgs = injectVaultArg(args, deps.vault || env.OBSIDIAN_CLI_VAULT || null);

  return execFileSync(binary, [command, ...finalArgs], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function printHelp() {
  process.stdout.write(
    [
      'Usage: node scripts/obsidian-cli.js [options] <command> [command-args]',
      '',
      'Wrapper options:',
      '  --vault <name>          Target a specific vault for every command',
      '  --obsidian-bin <path>   Explicit path to the Obsidian CLI binary',
      '  --print-bin             Print the resolved CLI binary path and exit',
      '  --help                  Show this message',
      '',
      'Examples:',
      '  node scripts/obsidian-cli.js help',
      '  node scripts/obsidian-cli.js --vault test-vault plugin:reload id=atlas-vtt',
      '  node scripts/obsidian-cli.js --vault test-vault dev:errors',
      '',
    ].join('\n')
  );
}

function main() {
  const options = parseWrapperArgs(process.argv.slice(2));
  if (options.help || (!options.printBin && !options.command)) {
    printHelp();
    return;
  }

  const obsidianBin =
    options.obsidianBin ||
    resolveObsidianCliBinary({
      env: {
        ...process.env,
        ...(options.obsidianBin ? { OBSIDIAN_CLI_BIN: options.obsidianBin } : {}),
      },
    });

  if (options.printBin) {
    process.stdout.write(`${obsidianBin}\n`);
    return;
  }

  const stdout = runObsidianCliCommand(options.command, options.args, {
    obsidianBin,
    vault: options.vault,
  });

  if (stdout) {
    process.stdout.write(stdout);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  commandExists,
  getCandidateBinaryPaths,
  injectVaultArg,
  isExecutable,
  parseWrapperArgs,
  resolveObsidianCliBinary,
  runObsidianCliCommand,
};
