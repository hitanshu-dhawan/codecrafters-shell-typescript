import { createInterface } from "readline";

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
    case "type":
      if (["echo", "exit", "type"].includes(args[0])) {
        console.log(`${args[0]} is a shell builtin`);
      } else {
        console.log(`${args[0]}: not found`);
      }
      break;
    default:
      console.log(`${command}: command not found`);
      break;
  }

  rl.prompt();
});

rl.on("close", () => {
  process.exit(0);
});
