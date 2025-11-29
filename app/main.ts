import { createInterface } from "readline";
import { spawnSync } from "child_process";
import * as fs from "fs";
import { commandsRegistry, EchoCommand, PwdCommand, CdCommand, ExitCommand, TypeCommand } from "./commands";
import { parseInput, findExecutable, parseRedirections } from "./utils";

// Create a readline interface to read from stdin and write to stdout
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
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
  const args = parseInput(line);
  const { cleanArgs, stdout, stderr, stdoutFile, stderrFile, redirectionError } = parseRedirections(args);

  if (!redirectionError) {
    const commandName = cleanArgs[0];
    const commandArgs = cleanArgs.slice(1);

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
