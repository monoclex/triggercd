import { log, parse, path } from "./deps.ts";
import { runWebServer } from "./server.ts";

const parsedArgs = parse(Deno.args);
const root = path.resolve(parsedArgs.root ?? parsedArgs.r ?? "/");
const webhooks = path.resolve(parsedArgs.webhooks ?? parsedArgs.w ?? path.join(root, "webhooks/"));
const habitats = path.resolve(parsedArgs.habitats ?? parsedArgs.h ?? path.join(root, "habitats/"));
const logs = path.resolve(parsedArgs.logs ?? parsedArgs.l ?? path.join(root, "logs/"));
const shell = parsedArgs.shell ?? parsedArgs.s ?? "dash";
const port = replaceNaN(parseInt(parsedArgs.port ?? parsedArgs.p), 80);
const debug = !!(parsedArgs.debug ?? parsedArgs.d); // if "debug/d" exist, this will be true

const config = { root, webhooks, habitats, logs, shell, port, debug };

console.log('TriggerCD');
console.log('===');
console.log('Arguments:', parsedArgs);
console.log('Configuration:');
console.table(config);

// ensure the specified folders exist
async function ensureExists(directory: string) {
  try {
    await Deno.stat(directory);
  } catch {
    console.warn(directory, `doesn't exist, creating`);
    await Deno.mkdir(directory, { recursive: true });
  }
}

await ensureExists(webhooks);
await ensureExists(habitats);
await ensureExists(logs);

console.log('setting up logging');

// setup logging to output logs into /logs/
await log.setup({
  handlers: {
    console: new log.handlers.ConsoleHandler("DEBUG"),
    file: new log.handlers.FileHandler("DEBUG", {
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

console.log('starting web server');

await runWebServer(config);

function replaceNaN(value: number, replaceValue: number): number {
  return isNaN(value) ? replaceValue : value;
}
