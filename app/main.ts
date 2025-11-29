import { createInterface } from "readline";
import { spawnSync } from "child_process";
import * as fs from "fs";
import { commandsRegistry, EchoCommand, PwdCommand, CdCommand, ExitCommand, TypeCommand } from "./commands";
import { parseInput, findExecutable, parseRedirections } from "./utils";

// Create a readline interface to read from stdin and write to stdout
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: (line: string) => {
    const completions = Array.from(commandsRegistry.keys());
    const hits = completions.filter((c) => c.startsWith(line));

    if (hits.length === 1) {
      return [[hits[0] + " "], line];
    }

    return [hits, line];
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
rl.setPrompt("$ ");
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
