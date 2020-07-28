import { copy, MultiReader, path } from "./deps.ts";
import { ResolvedScript } from "./resolution.ts";

export interface ScriptConfiguration {
  /**
   * The path for the habitat for the script to reside in. This is the folder that all everything within the parent folder of the script
   * will get copied to before execution of the script begins. Once the script completes, the habitat will be torn down.
   * 
   * Habitats are necessary for scripts to let the user write "dirty scripts" that don't clean up after themselves. By extracting the
   * script to its own habitat, it prevents pollution of the webhooks folder. This guarantees that the webhooks folder is a source of
   * truth for the code to execute for a given script. Typically, the webhooks folder will be readonly (if the user sets up their docker
   * container correctly), and habitats are needed to let the script modify the surrounding filesystem at all.
   * 
   * An example habitatPath that would typically be passed here would be `/habitats/82`, assuming that the user follows the recommended
   * guide with docker. The filesystem on said docker system would look like this:
   * 
   * ```
   * /app/ - source code of TriggerCD. You can expect /app/scripts/execution.ts to be exactly the file you're reading now.
   * /webhooks/ - volume mount containing scripts to execute for given webhook endpoints.
   * /habitats/ - folder containing script habitats.
   * ```
   * 
   * When a script is copied to its own habitat, the entire parent directory is copied to a habitat. So for example, if /webhooks/ looks
   * like this:
   * ```
   * /webhooks/hook-one.ts
   * /webhooks/hook-two.sh
   * /webhooks/asset.txt
   * /webhooks/hook-three/run.ts
   * /webhooks/hook-three/asset.txt
   * ```
   * 
   * If hook-one is executed, the habitat may look something like this:
   * ```
   * /habitats/12/hook-one.ts
   * /habitats/12/hook-two.sh
   * /habitats/12/asset.txt
   * /habitats/12/hook-three/run.ts
   * /habitats/12/hook-three/asset.txt
   * ```
   * 
   * If hook-three is executed, the habitat would look like this instead:
   * ```
   * /habitats/13/run.ts
   * /habitats/13/asset.txt
   * ```
   * 
   * The reason for copying the *entire* parent directory is that there may be some important asset that is required to exist when the
   * script is running, and it would be jarring for the user to realize that the script couldn't access the asset. Thus, it is recommended
   * to have webhooks in directories instead, where only the required resources can be copied.
   */
  habitatPath: string;

  /** The body of the webhook. This will be passed along to the script as the first argument. */
  webhookBody: string;
}

/**
 * Executes a script. This will automatically prepare a [habitat]{@link ScriptConfiguration#habitatPath} for the script to run, as well as
 * pass along any important configuration to the scripts. <TODO: where does it get the config from?>
 * 
 * @param script The script to execute.
 * @returns A reader, to read the stdout and stderr of the running process.
 */
export async function execute(script: ResolvedScript, config: ScriptConfiguration): Promise<ActiveScript> {
  // copy parent directory of script to habitat
  const scriptDirectory = path.dirname(script.path);
  await copy(scriptDirectory, config.habitatPath);

  const newScriptPath = path.resolve(config.habitatPath, path.basename(script.path));
  const scriptProcess = startScript(script.type, newScriptPath, config.webhookBody);

  const output = new MultiReader(scriptProcess.stdout, scriptProcess.stderr);
  const execution = scriptProcess.status().then(() => Deno.remove(config.habitatPath, { recursive: true }));
  return { output, execution };
}

/** Interface that represents a script that is actively running. */
export interface ActiveScript {
  /** A Reader that outputs from both stdout and stderr. */
  output: Deno.Reader;
  /** A promise that will complete once the script completes. */
  execution: Promise<void>;
}

const pipeOutput = { stdout: "piped", stderr: "piped" } as const;

function startScript(type: "deno" | "bash", scriptPath: string, webhookBody: string): Deno.Process<typeof pipeOutput & { cmd: string[] }> {
  if (type === "deno") {

    // TODO: configurable permissions?
    // we should be in a trusted environment already (and if not, in a docker container at least) so any possible damage is minimal.
    // currently, the benefits of this being configurable are outweighed by the additional complexity (requiring additoinal configuration to
    // be passed in).
    return Deno.run({
      cmd: ["deno", "run", "--allow-all", "--unstable", scriptPath, webhookBody],
      cwd: path.dirname(scriptPath),
      ...pipeOutput
    })
  }
  else {
    return Deno.run({
      cmd: ["dash", scriptPath, webhookBody],
      cwd: path.dirname(scriptPath),
      ...pipeOutput
    })
  }
}
