

main();

async function main() {
  const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE");

  if (home === null) {
    console.error("Unable to find home directory ($HOME and %USERPROFILE% not set)");
    return;
  }
}