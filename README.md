This is a local React app that allows for displaying Reducto API responses.

## Installation

Using Bun:

```sh
bun install
bun run dev
```

Using npm:

```sh
npm install
npm run dev
```

The app runs at http://localhost:5173 with `/parse` and `/extract` routes.

An API token is required to process documents. Paste it into the API Token field, or set
`VITE_API_TOKEN` in a `.env` file. See `.env.example` for the available environment
variables:

- `VITE_API_URL` (default: `https://platform.reducto.ai`)
- `VITE_API_TOKEN`
- `VITE_ENABLE_LOCAL_PERSIST` (default: `false`)

The app is also accessible at docsplayground.vercel.app.
