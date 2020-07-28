FROM hayd/alpine-deno:1.2.1

EXPOSE 80

# to keep the container light, we install essential commands.
# "docker-cli": <42.96 MB> commandline utility to communicate with /var/run/docker.sock
# "git": <18.88 MB> essential because virtually all source code has a git repo which needs to be cloned.
# "dash": <120 kB> essential because you need a shell to execute shell commands. dash is light and fast, and on debian /bin/sh is a symlink to it.
RUN apk add --no-cache docker-cli git dash \
  && ln -s dash /bin/bash

WORKDIR /app

# cache external dependencies to make successive builds faster
COPY src/deps.ts .
RUN deno cache --unstable deps.ts
# `--unstable` needed for deno fs copy, /shrug

# cache the program itself so that it won't need to be compiled on every startup of the container
COPY src/ .
RUN deno cache --unstable main.ts

CMD ["run", "--allow-all", "--unstable", "main.ts"]
