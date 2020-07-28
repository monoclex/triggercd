import { Application, MultiReader } from "./deps.ts";
import { resolveScript } from "./resolution.ts";

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

  const scriptProcess = Deno.run({
    cmd: [resolvedScript.type, "run", resolvedScript.path, await context.body()],
    stdout: "piped",
    stderr: "piped"
  });

  // TODO: report stderr too?
  context.blob(new MultiReader(scriptProcess.stdout, scriptProcess.stderr), "text/plain", 200);
  return;
})
.start({ port: 80 });

