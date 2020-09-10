import { log } from "./deps.ts";

export class Config {
  docker?: string;
  git?: string;
}

export async function runConfig(habitatPath: string, configFileContents: string): Promise<void> {
  const logger = log.getLogger();
  logger.debug("Running configuration script", configFileContents);
  
  const config: Config = JSON.parse(configFileContents);

  logger.debug("Checking for 'git' section");
  if (config.git) {
    logger.info("Cloning 'git' repository", config.git);

    await runAndLogProcess("git", logger, {
      cmd: ["git", "clone", "--depth=1", "--progress", config.git],
      cwd: habitatPath,
      stdout: "piped",
      stderr: "piped",
    });

    log.info("Cloned!");
  }
}

type PipedRunOptions = Deno.RunOptions & { stdout: "piped", stderr: "piped" };
async function runAndLogProcess<TRunOptions extends PipedRunOptions>(
  processName: string,
  logger: log.Logger,
  runProcess: TRunOptions,
) {
  const process = Deno.run<TRunOptions>(runProcess);
  
  const stdout = process.stdout!;
  const stderr = process.stderr!;
  const decoder = new TextDecoder();

  await Promise.all([
    (async () => {
      let buffer = new Uint8Array(4096);

      try {
        while (true) {
          const read = await stdout.read(buffer);
          if (read === null) break;
          if (read === 0) continue;

          logger.debug(processName, "STDOUT", decoder.decode(buffer.subarray(0, read)));
        }
      } catch (e) {
        logger.error("Error while reading from STDOUT of spawned process:", e);
      }
    })(),
    (async () => {
      let buffer = new Uint8Array(4096);

      try {
        while (true) {
          const read = await stderr.read(buffer);
          if (read === null) break;
          if (read === 0) continue;

          logger.debug(processName, "STDERR", decoder.decode(buffer.subarray(0, read)));
        }
      } catch (e) {
        logger.error("Error while reading from STDERR of spawned process:", e);
      }
    })()
  ]);
}