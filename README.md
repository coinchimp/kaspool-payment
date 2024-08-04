# kaspool-payment

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

## docker

```bash
docker build -t kaspool-payment:0.1main .
docker run -d --name kaspool-payment --network kaspool-app_backend --env-file ./src/.env --restart always kaspool-payment:0.1main
```

This project was created using `bun init` in bun v1.1.21. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
