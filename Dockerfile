FROM hayd/alpine-deno:1.2.1

EXPOSE 80

# install required utilities
# the dockerfile must *guarantee* that all of the following are available, in no particular order:
# `git`, `docker`, `bash`, `jq`, `wget`, `curl`, `sed`, `awk`, `grep`, `cat`
RUN apk add --no-cache git bash jq wget curl grep

WORKDIR /app

# cache external dependencies to make successive builds faster
COPY src/deps.ts .
RUN deno cache --unstable deps.ts
# `--unstable` needed for deno fs copy, /shrug

# cache the program itself so that it won't need to be compiled on every startup of the container
COPY src/ .
RUN deno cache --unstable main.ts

CMD ["run", "--allow-all", "--unstable", "main.ts"]
