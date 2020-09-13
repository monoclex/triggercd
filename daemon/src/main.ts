import { log, path } from "./deps.ts";

// const parsedArgs = parse(Deno.args);

// setup logging to output logs into ./logs/
await log.setup({
  handlers: {
    console: new log.handlers.ConsoleHandler("DEBUG", {
      formatter: (record) => `[${record.levelName}] ${record.msg} ${record.args.join(" ")}`
    }),
    file: new log.handlers.FileHandler("DEBUG", {
      formatter: (record) => `[${record.levelName}] @${new Date().toISOString()} ${record.msg} ${record.args.join(" ")}`,
      filename: path.resolve(path.join("./logs", new Date().toISOString().replaceAll(":", "-")))
    })
  },
  loggers: {
    default: {
      level: "DEBUG",
      handlers: ["console", "file"]
    }
  }
});
