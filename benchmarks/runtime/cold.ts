import { type Captured, replay } from "../shared/capture";

// Child process for runtime/startup.ts. Imports a single framework, so module load time is only
// that framework (plus zod, which every adapter shares), then builds the router and serves one request.
const [file, routes, request] = process.argv.slice(2);

const t0 = performance.now();
const { default: framework } = await import(`../shared/frameworks/${file}.ts`);
const t1 = performance.now();
const handler = framework.createHandler(Number(routes));
const t2 = performance.now();
await (await handler(replay(JSON.parse(request!) as Captured))).text();
const t3 = performance.now();

console.log(JSON.stringify({ import: t1 - t0, build: t2 - t1, firstRequest: t3 - t2 }));
