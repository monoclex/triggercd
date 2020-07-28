import { parse, path } from "./deps.ts";
import { runWebServer } from "./server.ts";

const parsedArgs = parse(Deno.args);
const habitats = path.resolve(parsedArgs.habitats ?? parsedArgs.h ?? "/habitats/");
const webhooks = path.resolve(parsedArgs.webhooks ?? parsedArgs.w ?? "/webhooks/");
const shell = parsedArgs.shell ?? parsedArgs.s ?? "dash";
const port = replaceNaN(parseInt(parsedArgs.port ?? parsedArgs.p), 80);

console.log('TriggerCD');
console.log('===');
console.log('Arguments:', parsedArgs);
console.log('Configuration:');
console.table({ habitats, webhooks, shell, port });

function replaceNaN(value: number, replaceValue: number): number {
  if (isNaN(value)) {
    return replaceValue;
  }
  
  return value;
}

await runWebServer({ habitats, webhooks, shell, port });
