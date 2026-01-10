# Domain & Project Knowledge

## Conventions
- Use `defineTool` / `defineUI` for inference.
- Middleware is Koa-style `async (ctx, next) => { await next(); }`.
- Avoid `any`; narrow `unknown`.
- Export public APIs from package `index.ts`.

## Testing
- Prefer deterministic tests; mock external calls.
- Mirror `src/` structure under `tests/` (unit/integration/contract) where relevant.

