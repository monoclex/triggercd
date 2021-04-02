# <div align="center">TriggerCD</div>
<div align="center">

  [![img](https://img.shields.io/github/license/SirJosh3917/TriggerCD?style=flat-square)](https://github.com/SirJosh3917/TriggerCD/blob/master/LICENSE)

  *Setup Continuous Deployment, the way Unix intended.*

</div>

## Why TriggerCD?

TriggerCD was born out of the simple idea that on commit, code on your server should run. This _can_ be achieved using SSH, but is a hassle to maintain. Rather than require various amounts of SSH authentication, TriggerCD only requires a connectable WebSocket endpoint, with an optional password for authentication.

## What is TriggerCD?

TriggerCD is a binary that listens for WebSocket connections. Upon receiving one, it will check the password (if applicable), and then run the binary - piping its stdout and stderr to the WebSocket connection.

Its extreme simplicity allows you to benefit in various ways:

- **Use Caching Mechanisms** — since TriggerCD doesn't need to be virtualized, it can utilize any layers of cache the host provides.
- **Virtualize** — due to its extreme simplicity, it's entirely viable to virtualize an instance of TriggerCD.
- **Easy Management** — since all it requires is a port and a command, you can utilize your existing unix tools to manage these in the ways you want to. No mucking about with configuration!

# How

**TriggerCD** has a simple, linear workflow that's easy to follow.

1. A running instance of TriggerCD gets a WebSocket connection
2. If this instance requires a password, it will wait for that password to be sent. It will only continue if the password was correct.
3. **Your process runs.** Stdout and Stderr get piped to the WebSocket.

# Get Started

TODO: get binaries building on commit

To get an instance of TriggerCD running, please compile from source. An `x86_64-unknown-linux-musl` binary, `strip`ped and ran with `upx` on it is provided, although not guaranteed. Running the binary is as follows:

```
triggercd --help
triggercd -c /bin/sh test.sh
triggercd -k asdf123 -c /bin/sh test.sh
```

Once you have an instance of TriggerCD running, use [triggercd-action](https://github.com/SirJosh3917/triggercd-action) to use TriggerCD in your Github Actions workflow.
