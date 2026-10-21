/**
 * Type-level description of a route added with `LixnetServer.route(...)`: the input the
 * client sends and the output it receives.
 */
export type LixnetRoute<TInput, TOutput> = { input: TInput; output: TOutput };

export type LixnetRoutes = Record<string, LixnetRoute<any, any>>;

/**
 * Converts `typeof server` (built with `.route(...)`) into the `Events` shape clients use
 * (`name: (input) => output`). Anything else is passed through, so clients accept either.
 */
export type InferLixnetEvents<T> = T extends { readonly "~routes": infer TRoutes extends LixnetRoutes }
    ? { [K in keyof TRoutes]: (input: TRoutes[K]["input"]) => TRoutes[K]["output"] }
    : T;
