import { Application, path } from "./deps.ts";
import { execute } from "./scripts/execution.ts";
import { resolveScript } from "./scripts/resolution.ts";

let habitatId = 0;

try {
  await Deno.stat("/habitats");
}
catch {
  await Deno.mkdir("/habitats");
}

const app = new Application();

app.post("/webhook/:id", async (context) => {
  const { id } = context.params;

  // here, we enforce the id to only contain specific characters to not trip up
  // any other part of the code. that way, there can be no fancy file name
  // mangling with ".." or any other funny business.
  if (!/[a-zA-Z0-9_\-]*/.test(id)) {
    context.string("webhook id failed regex test /[a-zA-Z0-9_\-]*/", 400);
    return;
  }

  // resolve the script to run
  const resolvedScript = await resolveScript(id);

  if (resolvedScript === null) {
    context.string(`failed to resolve script '${id}'.
please see the Script Resolving Algorithm <doc link>
or ensure that you've mounted a /webhooks/ volume <doc link>
`, 500);
    return;
  }

  const habitatPath = `/habitats/${habitatId++}`;

  const activeScript = await execute(resolvedScript, { habitatPath, webhookBody: new TextDecoder().decode(await context.body<Uint8Array>()) })

  context.blob(activeScript.output, "text/plain", 200);
  await activeScript.execution;
  return;
})
.get("/debugfs", async (context) => {
  const buffer = new Deno.Buffer();

  // stream reading the filesystem out
  context.blob(buffer, "text/plain", 200);

  await walk("/", buffer);
})
.start({ port: 80 });

async function walk(dir: string, buffer: Deno.Buffer): Promise<void> {
  let traverseMore = [];

  const encoder = new TextEncoder();
  for await (const entry of Deno.readDir(dir)) {
    const name = path.resolve(path.join(dir, entry.name));
    buffer.writeSync(encoder.encode(`${name} - f: ${entry.isFile}, d: ${entry.isDirectory}, s: ${entry.isSymlink} \n`));

    if (entry.isDirectory) {
      traverseMore.push(name);
    }
  }

  for (const dir of traverseMore) {
    await walk(dir, buffer);
  }
}
