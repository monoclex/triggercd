import { Application, MultiReader } from "./deps.ts";

console.log('running');

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

/**
 * Simplified model of FileInfo which contains only the fields needed for this
 * application.
 */
interface FileInfo {
  path: string;
  isDirectory: boolean;
  isFile: boolean;
}

/**
 * Safely returns a {@link FileInfo} for any path. Erases the possibility of
 * failure by returning "false" for all fields.
 * @param path The path to get the file info for.
 */
async function statFile(path: string | URL): Promise<FileInfo> {
  try {
    return {
      ...await Deno.stat(path),
      path: path.toString()
    };
  }
  catch (error) {
    return {
      path: path.toString(),
      isDirectory: false,
      isFile: false
    };
  }
}

/**
 * Resolves a script using the Script Resolving Algorithm.
 * 
 * Script Resolving Algorithm:
 * 1. if /webhooks/<webhookname>.ts is a file, run it as a deno script
 * 1. if /webhooks/<webhookname>.sh is a file, run it as a bash script
 * 2. if /webhooks/<webhookname> is a directory,
 *   a. if /webhooks/<webhookname>/on-trigger.ts exists, run it as a deno script
 *   b. if /webhooks/<webhookname>/<webhookname>.ts exists, run it as a deno script
 *   a. if /webhooks/<webhookname>/on-trigger.sh exists, run it as a bash script
 *   b. if /webhooks/<webhookname>/<webhookname>.sh exists, run it as a bash script
 * 3. if /webhooks/<webhookname> is a file, run it as a bash script
 * 4. report an error
 * * when running as a script, the first argument is the webhook JSON
 * * when running as a script, these tools are guaranteed to be in the PATH:
 *   `docker`, `bash`, `jq`, `wget`, `curl`, `sed`, `awk`, `grep`, `cat`
 * 
 * @param id The ID of the webhook to resolve the script for.
 * @returns `null` when a script couldn't be found. Otherwise, returns the name
 * of the script to run.
 */
async function resolveScript(id: string): Promise<ResolvedScript | null> {
  const scriptDeno = await statFile(`/webhooks/${id}.ts`);
  if (scriptDeno.isFile) {
    return { type: "deno", path: scriptDeno.path };
  }

  const scriptBash = await statFile(`/webhooks/${id}.sh`);
  if (scriptBash.isFile) {
    return { type: "bash", path: scriptBash.path };
  }

  const scriptDirectory = await statFile(`/webhooks/${id}`);
  if (scriptDirectory.isDirectory) {
    const onTriggerDeno = await statFile(`/webhooks/${id}/on-trigger.ts`);
    if (onTriggerDeno.isFile) {
      return { type: "deno", path: onTriggerDeno.path };
    }

    const webhookScriptDeno = await statFile(`/webhooks/${id}/${id}.ts`);
    if (webhookScriptDeno.isFile) {
      return { type: "deno", path: webhookScriptDeno.path };
    }

    const onTriggerBash = await statFile(`/webhooks/${id}/on-trigger.sh`);
    if (onTriggerBash.isFile) {
      return { type: "bash", path: onTriggerBash.path };
    }

    const webhookScriptBash = await statFile(`/webhooks/${id}/${id}.sh`);
    if (webhookScriptBash.isFile) {
      return { type: "bash", path: webhookScriptBash.path };
    }
  }
  
  if (scriptDirectory.isFile) {
    return { type: "bash", path: scriptDirectory.path };
  }

  return null;
}

interface ResolvedScript {
  path: string;
  type: "deno" | "bash";
}