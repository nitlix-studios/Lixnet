/**
 * A Proxy where every property is a function calling that event: `caller.greet(input, options)`
 * is `call("greet", input, options)`. `then` (and symbols) read as undefined, so the caller isn't
 * mistaken for a Promise when awaited or returned from an async function.
 */
export default function createCaller<T>(call: (event: string, ...args: any[]) => unknown): T {
    const functions = new Map<string, (...args: any[]) => unknown>();

    return new Proxy(Object.create(null), {
        get(_, event) {
            if (typeof event !== "string" || event === "then") return undefined;
            let fn = functions.get(event);
            if (!fn) {
                fn = (...args) => call(event, ...args);
                functions.set(event, fn);
            }
            return fn;
        },
    }) as T;
}
