import * as fs from "fs";
import * as path from "path";

/**
 * Searches for an executable file in the directories specified by the PATH environment variable.
 * 
 * @param command - The name of the command to search for.
 * @returns The full path to the executable if found, or null if not found.
 */
export function findExecutable(command: string): string | null {
    const envPath = process.env.PATH || "";
    const paths = envPath.split(path.delimiter);

    for (const dir of paths) {
        const fullPath = path.join(dir, command);
        if (fs.existsSync(fullPath)) {
            try {
                fs.accessSync(fullPath, fs.constants.X_OK);
                if (fs.statSync(fullPath).isFile()) {
                    return fullPath;
                }
            } catch (e) { }
        }
    }
    return null;
}

/**
 * Parses an input string into an array of tokens.
 * 
 * Handles quoting and escaping rules:
 * 
 * Single Quotes ('):
 * - Disable all special meaning for characters enclosed within them.
 * - Example: 'hello    world' -> hello    world
 * - Example: 'hello''world' -> helloworld
 * 
 * Double Quotes ("):
 * - Most characters are treated literally.
 * - Backslash (\) escapes " and \.
 * - Example: "hello    world" -> hello    world
 * - Example: "hello""world" -> helloworld
 * - Example: "shell's test" -> shell's test
 * - Example: "A \" inside double quotes" -> A " inside double quotes
 * 
 * Backslash (\) outside quotes:
 * - Escapes the next character.
 * - Example: world\ \ \ \ \ \ script -> world      script
 * 
 * @param input - The input string to parse.
 * @returns An array of tokens.
 */
export function parseInput(input: string): string[] {
    const tokens: string[] = [];

    let currentToken = "";
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let i = 0; i < input.length; i++) {
        const char = input[i];

        if (inSingleQuote) {
            // Handle single quotes: preserve everything literally until closing quote
            if (char === "'") {
                inSingleQuote = false;
            } else {
                currentToken += char;
            }
        } else if (inDoubleQuote) {
            // Handle double quotes: preserve whitespace, handle specific escapes
            if (char === '"') {
                inDoubleQuote = false;
            } else if (char === '\\') {
                const nextChar = input[i + 1];
                // Only escape " and \ inside double quotes
                if (nextChar === '"' || nextChar === '\\') {
                    currentToken += nextChar;
                    i++;
                } else {
                    currentToken += char;
                }
            } else {
                currentToken += char;
            }
        } else {
            // Handle unquoted characters
            if (char === '\\') {
                // Backslash escapes the next character
                const nextChar = input[i + 1];
                if (nextChar !== undefined) {
                    currentToken += nextChar;
                    i++;
                }
            } else if (char === "'") {
                inSingleQuote = true;
            } else if (char === '"') {
                inDoubleQuote = true;
            } else if (char === ' ' || char === '\t') {
                // Whitespace acts as a delimiter
                if (currentToken.length > 0) {
                    tokens.push(currentToken);
                    currentToken = "";
                }
            } else {
                currentToken += char;
            }
        }
    }

    // Add the last token if exists
    if (currentToken.length > 0) {
        tokens.push(currentToken);
    }

    return tokens;
}
