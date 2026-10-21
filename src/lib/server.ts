import LixnetServerBase from "./serverbase";
import type {
    DebugLogger,
    FunctionInput,
    FunctionOutput,
    LXNEventEntries,
    LXNEventSchema,
    LXNServerHandler,
    LXN_ServerClient_EventType,
} from "./types";
import { LixnetResponse } from "./util/response";
import { LixnetRequest, createLixnetRequest } from "./util/request";
import getDefaultFormatter from "./util/getDefaultFormatter";

type LXNServerEventInput<
    Events extends LXN_ServerClient_EventType,
    TName extends keyof Events
> = {
    event: TName;
    handler: LXNServerHandler<
        FunctionInput<Events[TName]> & { request: LixnetRequest, response: LixnetResponse },
        FunctionOutput<Events[TName]>
    >;
    schema?: LXNEventSchema<Events, TName>;
};

export default class LixnetServer<Events extends LXN_ServerClient_EventType> extends LixnetServerBase<
    LXNServerEventInput<Events, keyof Events>
> {
    private formatter: (this: LixnetResponse) => Response;

    public constructor({
        debugLog = false,
        logger,
        formatter,
        defaultHeaders = {},
    }: {
        debugLog?: boolean;
        logger?: DebugLogger;
        formatter?: (this: LixnetResponse) => Response;
        defaultHeaders?: Record<string, string>
    }) {
        super({ debugLog, logger, defaultHeaders });
        this.formatter = formatter ?? getDefaultFormatter(defaultHeaders);
    }

    public on<K extends keyof Events & string>(
        input:
            | LXNServerEventInput<Events, K>
            | LXNEventEntries<
                  Events,
                  { [P in keyof Events & string]: LXNServerEventInput<Events, P> }
              >
    ) {
        this.register(input as LXNServerEventInput<Events, keyof Events>);
    }

    public async handle(request: Request) {
        const requestClone = request.clone();

        const response = new LixnetResponse({ formatter: this.formatter });

        const parsed = await this.parse(request);
        if (!parsed.ok) {
            if (parsed.error === "Invalid JSON" && this.debugLog) {
                this.logger({ error: true, message: "Invalid JSON" });
            }
            return this.fail(response, parsed.error, parsed.status);
        }

        try {
            const data = await parsed.entry.handler({
                ...parsed.input,
                request: createLixnetRequest(requestClone, response),
                response: response,
            });

            //check data isnt void/null/undefined
            if (!(data === undefined || data === null)) {
                response.data(data);
            }

            return response.format();
        } catch (error) {
            return this.fail(response, "Handler error", 500);
        }
    }
}
