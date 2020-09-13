import { log, parse, path } from "./deps.ts";
import server from "./server.ts";

const parsedArgs = parse(Deno.args);
const logs: string = parsedArgs.logs ?? "./logs";

// ensure the specified folders exist
async function ensureExists(directory: string) {
  try {
    await Deno.stat(directory);
  } catch {
    console.warn(directory, `doesn't exist, creating`);
    await Deno.mkdir(directory, { recursive: true });
  }
}

await ensureExists(logs);

// setup logging
await log.setup({
  handlers: {
    console: new log.handlers.ConsoleHandler("DEBUG", {
      formatter: (record) => `[${record.levelName}] ${record.msg} ${record.args.join(" ")}`
    }),
    file: new log.handlers.FileHandler("DEBUG", {
      formatter: (record) => `[${record.levelName}] @${new Date().toISOString()} ${record.msg} ${record.args.join(" ")}`,
      filename: path.resolve(path.join(logs, new Date().toISOString().replaceAll(":", "-")))
    })
  },
  loggers: {
    default: {
      level: "DEBUG",
      handlers: ["console", "file"]
    }
  }
});

await server();
Deno.exit(1)
