import { createInterface } from "readline";
import { spawnSync, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

import { commandsRegistry, completionsRegistry, EchoCommand, PwdCommand, CdCommand, HistoryCommand, ExitCommand, TypeCommand, CompleteCommand, JobsCommand } from "./commands";
import { parseInput, parseRedirections, findExecutable, getMatchingExecutables, longestCommonPrefix } from "./utils";
import { JobManager } from "./jobs";

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

// Manage background jobs
const jobManager = new JobManager();

// Track number of commands loaded from history file
let historyLoadedCount = 0;

// Load existing history from HISTFILE if it exists
const historyFilePath = process.env.HISTFILE;
if (historyFilePath && fs.existsSync(historyFilePath)) {
  const content = fs.readFileSync(historyFilePath, "utf-8");
  content.split("\n").forEach((line) => {
    if (line.trim()) {
      history.push(line.trim());
    }
  });
  historyLoadedCount = history.length;
}

// Register built-in commands
const commandsToRegister = [
  new EchoCommand(),
  new PwdCommand(),
  new CdCommand(),
  new HistoryCommand(history),
  new ExitCommand(rl),
  new TypeCommand(),
  new CompleteCommand(),
  new JobsCommand(jobManager),
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

  // Check for background execution (last token is `&`)
  if (inputArgs.length > 0 && inputArgs[inputArgs.length - 1] === "&") {
    const bgArgs = inputArgs.slice(0, -1);

    if (bgArgs.length > 0) {
      const commandName = bgArgs[0];
      const commandArgs = bgArgs.slice(1);
      const executablePath = findExecutable(commandName);

      if (executablePath) {
        // Spawn the process without waiting; inherit stdout/stderr so its output
        // still appears in the terminal.
        const child = spawn(executablePath, commandArgs, {
          argv0: commandName,
          stdio: ["ignore", "inherit", "inherit"],
        });

        // Command string for display: the input line without the trailing `&`.
        const commandString = line.trim().replace(/\s*&$/, "");
        const job = jobManager.add(child, commandString);
        console.log(`[${job.number}] ${job.pid}`);
      } else {
        console.log(`${commandName}: command not found`);
      }
    }

    showPrompt();
    return;
  }

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

  showPrompt();
});

/**
 * Reaps any completed background jobs (printing their `Done` lines) and then
 * displays the shell prompt.
 */
function showPrompt(): void {
  jobManager.reap(process.stdout.fd);
  rl.prompt();
}

// Handle shell exit
rl.on("close", () => {

  // Save history to HISTFILE if it exists
  if (historyFilePath) {
    const newCommands = history.slice(historyLoadedCount);
    if (newCommands.length > 0) {
      let content = newCommands.join("\n") + "\n";
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
 * Dispatches to command completion when the user is typing the first token,
 * or to file/directory completion when typing a subsequent argument.
 * 
 * @param line The current input line to complete.
 * @returns A tuple containing an array of completions and the substring to replace.
 */
function handleCompletion(line: string): [string[], string] {
  const lastSpaceIndex = line.lastIndexOf(' ');

  if (lastSpaceIndex === -1) {
    // Completing a command name
    return handleCommandCompletion(line);
  }

  // If a programmable completer is registered for the command, use it
  const commandName = line.split(/\s+/)[0];
  if (completionsRegistry.has(commandName)) {
    return handleCompleterCompletion(line, completionsRegistry.get(commandName)!);
  }

  // Completing an argument (file/directory)
  return handleFileCompletion(line, lastSpaceIndex);
}

/**
 * Handles tab completion using a registered completer script (`complete -C`).
 *
 * Invokes the completer as a separate process, passing the command name, the
 * word being completed, and the preceding word as `argv[1..3]`, along with the
 * `COMP_LINE` and `COMP_POINT` environment variables. Each line of stdout is
 * treated as a candidate.
 *
 * - No candidates: Rings the bell, leaves input unchanged.
 * - Single candidate: Completes with a trailing space.
 * - Multiple candidates:
 *   - Completes to the longest common prefix if it extends the current word.
 *   - Otherwise rings the bell on the first tab and lists candidates on the next.
 *
 * @param line The full input line.
 * @param completerPath Path to the registered completer script.
 * @returns A tuple containing an array of completions and the substring to replace.
 */
function handleCompleterCompletion(line: string, completerPath: string): [string[], string] {
  const words = line.split(/\s+/).filter((w) => w.length > 0);
  const command = words[0];

  const endsWithSpace = /\s$/.test(line);

  let currentWord: string;
  let previousWord: string;
  if (endsWithSpace) {
    currentWord = "";
    previousWord = words.length > 0 ? words[words.length - 1] : "";
  } else {
    currentWord = words.length > 0 ? words[words.length - 1] : "";
    previousWord = words.length > 1 ? words[words.length - 2] : "";
  }

  // Run the completer script, passing context via argv and environment variables
  const result = spawnSync(completerPath, [command, currentWord, previousWord], {
    encoding: "utf-8",
    env: { ...process.env, COMP_LINE: line, COMP_POINT: String(line.length) },
  });

  const output = result.stdout || "";
  const candidates = output
    .split("\n")
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.length > 0)
    .sort();

  // No candidates - ring the bell
  if (candidates.length === 0) {
    process.stdout.write('\x07');
    return [[], line];
  }

  // Single candidate - complete with a trailing space
  if (candidates.length === 1) {
    return [[candidates[0] + " "], currentWord];
  }

  // Multiple candidates - complete to the longest common prefix if it extends the word
  const lcp = longestCommonPrefix(candidates);
  if (lcp.length > currentWord.length) {
    return [[lcp], currentWord];
  }

  // Handle multiple completions with tab counting
  if (tabCounter === 0) {
    tabCounter++;
    process.stdout.write('\x07');
    return [[], line];
  } else {
    tabCounter = 0;
    process.stdout.write(`\n${candidates.join("  ")}\n${PROMPT_PREFIX}${line}`);
    return [[], line];
  }
}

/**
 * Handles tab completion for command names (builtins and PATH executables).
 * 
 * - No matches: Rings the bell.
 * - Single match: Returns the match with a trailing space.
 * - Multiple matches:
 *   - If there is a common prefix longer than the current input, completes to it.
 *   - First tab press: Rings the bell.
 *   - Second tab press: Displays all possible completions.
 * 
 * @param line The current input line (command prefix) to complete.
 * @returns A tuple containing an array of completions and the original line.
 */
function handleCommandCompletion(line: string): [string[], string] {
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

/**
 * Handles tab completion for file and directory arguments.
 * 
 * Extracts the token after the last space and matches it against entries
 * in the current (or nested) directory. Supports:
 * - Nested paths: splits on the last `/` to resolve the search directory.
 * - Single match: Completes with a trailing space (file) or `/` (directory).
 * - No matches: Rings the bell, leaves input unchanged.
 * - Multiple matches: Completes to the longest common prefix, or lists
 *   all matches on a subsequent tab press.
 * 
 * @param line The full input line.
 * @param lastSpaceIndex Index of the last space in the line, used to extract the token.
 * @returns A tuple containing an array of completions and the token being replaced.
 */
function handleFileCompletion(line: string, lastSpaceIndex: number): [string[], string] {
  const token = line.substring(lastSpaceIndex + 1);

  let dirPath = "";
  let prefix = token;

  const lastSlashIndex = token.lastIndexOf('/');
  if (lastSlashIndex !== -1) {
    dirPath = token.substring(0, lastSlashIndex + 1);
    prefix = token.substring(lastSlashIndex + 1);
  }

  // Resolve the search directory
  const searchDir = dirPath ? path.resolve(process.cwd(), dirPath) : process.cwd();

  // Find matching entries
  const matches: { name: string; isDir: boolean }[] = [];
  try {
    const entries = fs.readdirSync(searchDir);
    for (const entry of entries) {
      if (entry.startsWith(prefix)) {
        const fullPath = path.join(searchDir, entry);
        try {
          const isDir = fs.statSync(fullPath).isDirectory();
          matches.push({ name: entry, isDir });
        } catch (e) { }
      }
    }
  } catch (e) { }

  matches.sort((a, b) => a.name.localeCompare(b.name));

  // No matches
  if (matches.length === 0) {
    process.stdout.write('\x07');
    return [[], line];
  }

  // Single match
  if (matches.length === 1) {
    const match = matches[0];
    const completion = dirPath + match.name + (match.isDir ? '/' : ' ');
    return [[completion], token];
  }

  // Multiple matches - find LCP
  const names = matches.map(m => m.name);
  const lcp = longestCommonPrefix(names);

  if (lcp.length > prefix.length) {
    const completion = dirPath + lcp;
    return [[completion], token];
  }

  // Handle multiple completions with tab counting
  if (tabCounter === 0) {
    tabCounter++;
    process.stdout.write('\x07');
    return [[], line];
  } else {
    tabCounter = 0;
    const displayEntries = matches.map(m => m.name + (m.isDir ? '/' : ''));
    process.stdout.write(`\n${displayEntries.join("  ")}\n${PROMPT_PREFIX}${line}`);
    return [[], line];
  }
}
