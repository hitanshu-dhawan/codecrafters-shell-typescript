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
