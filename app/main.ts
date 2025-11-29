import { createInterface } from "readline";
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.setPrompt("$ ");
rl.prompt();

rl.on("line", (line) => {
  const [command, ...args] = line.trim().split(/\s+/);

  switch (command) {
    case "exit":
      rl.close();
      break;
    case "echo":
      console.log(args.join(" "));
      break;
    case "pwd":
      console.log(process.cwd());
      break;
    case "type":
      const cmd = args[0];
      if (["echo", "exit", "type", "pwd"].includes(cmd)) {
        console.log(`${cmd} is a shell builtin`);
      } else {
        const envPath = process.env.PATH || "";
        const paths = envPath.split(path.delimiter);
        let foundPath = null;

        for (const dir of paths) {
          const fullPath = path.join(dir, cmd);
          if (fs.existsSync(fullPath)) {
            try {
              fs.accessSync(fullPath, fs.constants.X_OK);
              if (fs.statSync(fullPath).isFile()) {
                foundPath = fullPath;
                break;
              }
            } catch (e) { }
          }
        }

        if (foundPath) {
          console.log(`${cmd} is ${foundPath}`);
        } else {
          console.log(`${cmd}: not found`);
        }
      }
      break;
    default:
      const envPath = process.env.PATH || "";
      const paths = envPath.split(path.delimiter);
      let foundPath = null;

      for (const dir of paths) {
        const fullPath = path.join(dir, command);
        if (fs.existsSync(fullPath)) {
          try {
            fs.accessSync(fullPath, fs.constants.X_OK);
            if (fs.statSync(fullPath).isFile()) {
              foundPath = fullPath;
              break;
            }
          } catch (e) { }
        }
      }

      if (foundPath) {
        spawnSync(foundPath, args, { argv0: command, stdio: "inherit" });
      } else {
        console.log(`${command}: command not found`);
      }
      break;
  }

  rl.prompt();
});

rl.on("close", () => {
  process.exit(0);
});
