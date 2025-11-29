import { createInterface } from "readline";
import { spawnSync } from "child_process";
import * as fs from "fs";

import { commandsRegistry, EchoCommand, PwdCommand, CdCommand, ExitCommand, TypeCommand } from "./commands";
import { parseInput, parseRedirections, findExecutable, getMatchingExecutables } from "./utils";

// Shell prompt prefix
const PROMPT_PREFIX = "$ ";

// Counter to track consecutive tab presses for autocompletion
let tabCounter = 0;

// Create a readline interface to read from stdin and write to stdout
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: (line: string) => {
    const completions = new Set<string>();

    // Add matching builtins
    for (const cmd of commandsRegistry.keys()) {
      if (cmd.startsWith(line)) {
        completions.add(cmd);
      }
    }

    // Add matching external commands
    const externalMatches = getMatchingExecutables(line);
    externalMatches.forEach((cmd) => completions.add(cmd));

    const hits = Array.from(completions).sort();

    // If no completions found, ring the bell
    if (hits.length === 0) {
      process.stdout.write('\x07');
      return [[], line];
    }

    // If exactly one completion found, append a space
    if (hits.length === 1) {
      return [[hits[0] + " "], line];
    }

    // Handle multiple completions with tab counting
    if (tabCounter === 0) {
      tabCounter++;

      // Ring the bell to indicate multiple options
      process.stdout.write('\x07');
      return [[], line];

    } else if (tabCounter >= 1) {
      tabCounter = 0;

      // Display all possible completions
      process.stdout.write(`\n${hits.join("  ")}\n${PROMPT_PREFIX}${line}`);
    }

    return [[], line];
  },
});

// Register built-in commands
const commandsToRegister = [
  new EchoCommand(),
  new PwdCommand(),
  new CdCommand(),
  new ExitCommand(rl),
  new TypeCommand(),
];
commandsToRegister.forEach((command) => commandsRegistry.set(command.command, command));

// Set the shell prompt
rl.setPrompt(PROMPT_PREFIX);
rl.prompt();

// Handle user input line by line
rl.on("line", (line) => {
  const inputArgs = parseInput(line);
  const { args, stdout, stderr, stdoutFile, stderrFile, redirectionError } = parseRedirections(inputArgs);

  if (!redirectionError) {
    const commandName = args[0];
    const commandArgs = args.slice(1);

    if (commandsRegistry.has(commandName)) {
      // Execute built-in command
      commandsRegistry.get(commandName)!.execute(commandArgs, stdout, stderr);
    } else {
      // Search for executable in PATH
      const executablePath = findExecutable(commandName);
      if (executablePath) {
        spawnSync(executablePath, commandArgs, { argv0: commandName, stdio: ["inherit", stdout, stderr] });
      } else {
        console.log(`${commandName}: command not found`);
      }
    }
  }

  if (stdoutFile) fs.closeSync(stdoutFile);
  if (stderrFile) fs.closeSync(stderrFile);

  rl.prompt();
});

// Handle shell exit
rl.on("close", () => {
  process.exit(0);
});
