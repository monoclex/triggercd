import { parse, path } from "./deps.ts";
import { runWebServer } from "./server.ts";

const parsedArgs = parse(Deno.args);
const habitats = path.resolve(parsedArgs.habitats ?? parsedArgs.h ?? "/habitats/");
const webhooks = path.resolve(parsedArgs.webhooks ?? parsedArgs.w ?? "/webhooks/");
const shell = parsedArgs.shell ?? parsedArgs.s ?? "dash";
const port = replaceNaN(parseInt(parsedArgs.port ?? parsedArgs.p), 80);
const debug = !!(parsedArgs.debug ?? parsedArgs.d); // if "debug/d" exist, this will be true

const config = { habitats, webhooks, shell, port, debug };

console.log('TriggerCD');
console.log('===');
console.log('Arguments:', parsedArgs);
console.log('Configuration:');
console.table(config);

function replaceNaN(value: number, replaceValue: number): number {
  return isNaN(value) ? replaceValue : value;
}

await runWebServer(config);
