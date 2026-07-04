# Evo Monorepo

## Usage

```sh
$ git clone git@github.com:demossml/testapp2.git
$ cd testapp2
$ pnpm install
$ pnpm run build
$ pnpm run dev
$ pnpm run deploy
```

### Dev Stack

- telegram bot (button + mini app) ->
- cloudflared (dev.evotop.cc) ->
- vite (http://localhost:5137) ->
- wrangler (http://localhost:8787)

### Development

```sh
$ pnpm run dev
```

https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=<YOUR_WEBHOOK_URL>
