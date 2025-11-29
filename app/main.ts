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
    default:
      console.log(`${command}: command not found`);
      break;
  }

  rl.prompt();
});

rl.on("close", () => {
  process.exit(0);
});
