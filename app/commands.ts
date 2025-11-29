import { Interface } from "readline";
import { findExecutable } from "./utils";

/**
 * Interface representing a shell command.
 */
export interface Command {
    command: string;
    execute(args: string[]): void;
}

/**
 * Registry to store and retrieve available commands.
 */
export const commandsRegistry = new Map<string, Command>();

/**
 * Command to print arguments to the standard output.
 */
export class EchoCommand implements Command {
    command = "echo";

    execute(args: string[]): void {
        console.log(args.join(" "));
    }
}

/**
 * Command to print the current working directory.
 */
export class PwdCommand implements Command {
    command = "pwd";

    execute(args: string[]): void {
        console.log(process.cwd());
    }
}

/**
 * Command to exit the shell.
 */
export class ExitCommand implements Command {
    command = "exit";

    constructor(private rl: Interface) { }

    execute(args: string[]): void {
        this.rl.close();
    }
}

/**
 * Command to display information about command type (builtin or executable).
 */
export class TypeCommand implements Command {
    command = "type";

    execute(args: string[]): void {
        const cmd = args[0];
        if (commandsRegistry.has(cmd)) {
            console.log(`${cmd} is a shell builtin`);
        } else {
            const path = findExecutable(cmd);
            if (path) {
                console.log(`${cmd} is ${path}`);
            } else {
                console.log(`${cmd}: not found`);
            }
        }
    }
}
