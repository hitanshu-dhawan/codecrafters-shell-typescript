import * as fs from "fs";
import { Interface } from "readline";

import { findExecutable } from "./utils";

/**
 * Interface representing a shell command.
 */
export interface Command {

    /** The name of the command */
    command: string;

    /** Executes the command with the given arguments and I/O streams.
     * 
     * @param args - The arguments passed to the command.
     * @param stdout - The file descriptor for standard output.
     * @param stderr - The file descriptor for standard error.
     */
    execute(args: string[], stdout: number, stderr: number): void;

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

    execute(args: string[], stdout: number, stderr: number): void {
        fs.writeSync(stdout, args.join(" ") + "\n");
    }
}

/**
 * Command to print the current working directory.
 */
export class PwdCommand implements Command {
    command = "pwd";

    execute(args: string[], stdout: number, stderr: number): void {
        fs.writeSync(stdout, process.cwd() + "\n");
    }
}

/**
 * Command to change the current working directory.
 */
export class CdCommand implements Command {
    command = "cd";

    execute(args: string[], stdout: number, stderr: number): void {
        let path = args[0];

        if (path === "~") {
            path = process.env.HOME || "";
        }

        try {
            process.chdir(path);
        } catch (error) {
            fs.writeSync(stdout, `cd: ${path}: No such file or directory\n`);
        }
    }
}

/**
 * Command to display the command history.
 */
export class HistoryCommand implements Command {
    command = "history";

    // Index to track the last appended command for -a option
    private lastAppendedIndex = 0;

    constructor(private history: string[]) { }

    execute(args: string[], stdout: number, stderr: number): void {

        // Handle options for reading, writing, or appending history
        if (args.length >= 2) {
            switch (args[0]) {
                case "-r":
                    this.handleRead(args[1]);
                    return;
                case "-w":
                    this.handleWrite(args[1]);
                    return;
                case "-a":
                    this.handleAppend(args[1]);
                    return;
            }
        }

        // Parse the limit argument if provided
        const limit = parseInt(args[0], 10);
        // Calculate the starting index based on the limit
        const start = isNaN(limit) ? 0 : Math.max(0, this.history.length - limit);

        // Iterate through the history and print each command
        for (let i = start; i < this.history.length; i++) {
            fs.writeSync(stdout, `    ${i + 1}  ${this.history[i]}\n`);
        }
    }

    private handleRead(filePath: string): void {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, "utf-8");
            const lines = content.split("\n");
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed) {
                    this.history.push(trimmed);
                }
            }
        }
    }

    private handleWrite(filePath: string): void {
        const content = this.history.join("\n") + "\n";
        fs.writeFileSync(filePath, content);
    }

    private handleAppend(filePath: string): void {
        const historyToAppend = this.history.slice(this.lastAppendedIndex);
        if (historyToAppend.length > 0) {
            const content = historyToAppend.join("\n") + "\n";
            fs.appendFileSync(filePath, content);
            this.lastAppendedIndex = this.history.length;
        }
    }

}

/**
 * Command to exit the shell.
 */
export class ExitCommand implements Command {
    command = "exit";

    constructor(private rl: Interface) { }

    execute(args: string[], stdout: number, stderr: number): void {
        this.rl.close();
    }
}

/**
 * Command to display information about command type (builtin or executable).
 */
export class TypeCommand implements Command {
    command = "type";

    execute(args: string[], stdout: number, stderr: number): void {
        const cmd = args[0];
        if (commandsRegistry.has(cmd)) {
            fs.writeSync(stdout, `${cmd} is a shell builtin\n`);
        } else {
            const path = findExecutable(cmd);
            if (path) {
                fs.writeSync(stdout, `${cmd} is ${path}\n`);
            } else {
                fs.writeSync(stdout, `${cmd}: not found\n`);
            }
        }
    }
}
