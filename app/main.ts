import { createInterface } from "readline";
import { spawnSync } from "child_process";
import { commandsRegistry, EchoCommand, PwdCommand, ExitCommand, TypeCommand } from "./commands";
import { findExecutable } from "./utils";

// Create a readline interface to read from stdin and write to stdout
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Register built-in commands
const commandsToRegister = [
  new EchoCommand(),
  new PwdCommand(),
  new ExitCommand(rl),
  new TypeCommand(),
];
commandsToRegister.forEach((command) => commandsRegistry.set(command.command, command));

// Set the shell prompt
rl.setPrompt("$ ");
rl.prompt();

// Handle user input line by line
rl.on("line", (line) => {
  const [commandName, ...args] = line.trim().split(/\s+/);

  if (commandsRegistry.has(commandName)) {
    // Execute built-in command
    commandsRegistry.get(commandName)!.execute(args);
  } else {
    // Search for executable in PATH
    const executablePath = findExecutable(commandName);
    if (executablePath) {
      spawnSync(executablePath, args, { argv0: commandName, stdio: "inherit" });
    } else {
      console.log(`${commandName}: command not found`);
    }
  }

  rl.prompt();
});

// Handle shell exit
rl.on("close", () => {
  process.exit(0);
});
