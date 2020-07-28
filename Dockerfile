FROM hayd/alpine-deno:1.2.1

EXPOSE 80

WORKDIR /app

# cache external dependencies to make successive builds faster
COPY src/deps.ts .
RUN deno cache deps.ts

# cache the program itself so that it won't need to be compiled on every startup of the container
COPY src/ .
RUN deno cache main.ts

CMD ["run", "--allow-net", "--allow-env", "--allow-read", "--allow-run", "main.ts"]
