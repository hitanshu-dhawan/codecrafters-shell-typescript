import { createInterface } from "readline";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const prompt = () => {
  rl.question("$ ", (command) => {
    if (command === "exit") {
      rl.close();
      return;
    }
    console.log(`${command}: command not found`);
    prompt();
  });
};

prompt();
