import { createInterface } from "readline";
import { spawnSync } from "child_process";
import * as fs from "fs";

import { commandsRegistry, EchoCommand, PwdCommand, CdCommand, HistoryCommand, ExitCommand, TypeCommand } from "./commands";
import { parseInput, parseRedirections, findExecutable, getMatchingExecutables, longestCommonPrefix } from "./utils";

// Shell prompt prefix
const PROMPT_PREFIX = "$ ";

// Create a readline interface to read from stdin and write to stdout
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: handleCompletion,
});

// Store command history
const history: string[] = [];

// Load existing history from HISTFILE if it exists
const historyFilePath = process.env.HISTFILE;
if (historyFilePath && fs.existsSync(historyFilePath)) {
  const content = fs.readFileSync(historyFilePath, "utf-8");
  content.split("\n").forEach((line) => {
    if (line.trim()) {
      history.push(line.trim());
    }
  });
}

// Register built-in commands
const commandsToRegister = [
  new EchoCommand(),
  new PwdCommand(),
  new CdCommand(),
  new HistoryCommand(history),
  new ExitCommand(rl),
  new TypeCommand(),
];
commandsToRegister.forEach((command) => commandsRegistry.set(command.command, command));

// Set the shell prompt
rl.setPrompt(PROMPT_PREFIX);
rl.prompt();

// Handle user input line by line
rl.on("line", (line) => {

  // Add command to history if not empty
  if (line.trim()) {
    history.push(line.trim());
  }

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

  // Save history to HISTFILE if it exists
  if (historyFilePath) {
    if (history.length > 0) {
      let content = history.join("\n") + "\n";
      fs.appendFileSync(historyFilePath, content);
    }
  }

  process.exit(0);
});


// Counter to track consecutive tab presses for autocompletion
let tabCounter = 0;

/**
 * Handles tab completion for the shell.
 * 
 * This function checks for matching built-in commands and external executables.
 * It handles different scenarios:
 * - No matches: Rings the bell.
 * - Single match: Returns the match with a trailing space.
 * - Multiple matches:
 *   - If there is a common prefix longer than the current line, returns it.
 *   - If it's the first tab press, rings the bell.
 *   - If it's the second tab press (consecutive), displays all possible completions.
 * 
 * @param line The current input line to complete.
 * @returns A tuple containing an array of completions and the original line.
 */
function handleCompletion(line: string): [string[], string] {
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

  // If multiple completions found, find the longest common prefix
  const prefix = longestCommonPrefix(hits);
  if (prefix.length > line.length) {
    return [[prefix], line];
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
}
