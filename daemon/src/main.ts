import { log, parse, path } from "./deps.ts";
import { runConfig } from "./scripts/config-runner.ts";
import { runWebServer } from "./server.ts";

const parsedArgs = parse(Deno.args);

if (parsedArgs.help) {
  // TODO: this is just copied from online readme lol
  console.table([
    {
      argument: "port",
      alias: "p",
      default: 80,
      description: "The port to run the web server on."
    },
    {
      argument: "root",
      alias: "r",
      default: "./",
      description: "The root directory to instantiate the webhooks, habitats, and logs folder in."
    },
    {
      argument: "webhooks",
      alias: "w",
      default: "webhooks/",
      description: "The location of the Webhook Script Store."
    },
    {
      argument: "habitats",
      alias: "h",
      default: "habitats/",
      description: "The location where the habitats will be created."
    },
    {
      argument: "logs",
      alias: "l",
      default: "logs/",
      description: "The location where logs will reside."
    },
    {
      argument: "shell",
      alias: "s",
      default: "dash",
      description: "The type of shell to use (for executing bash scripts)"
    },
    {
      argument: "debug",
      alias: "d",
      default: false,
      description: "If enabled, allows you to see some debug information about a webhook endpoint."
    }
  ]);

  Deno.exit(0);
}

const root = path.resolve(parsedArgs.root ?? parsedArgs.r ?? "./");
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

console.log('Setting up logging...');

// setup logging to output logs into ./logs/
await log.setup({
  handlers: {
    console: new log.handlers.ConsoleHandler("DEBUG", {
      formatter: (record) => `[${record.levelName}] ${record.msg} ${record.args.join(" ")}`
    }),
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

console.log('Starting web server...');

await runWebServer(config);

console.log('Web server running!');

function replaceNaN(value: number, replaceValue: number): number {
  return isNaN(value) ? replaceValue : value;
}
