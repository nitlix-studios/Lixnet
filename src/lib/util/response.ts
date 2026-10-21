export type CookieBaseOptions = {
    domain?: string;
    path?: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'lax' | 'strict' | 'none';
};

export type CookieFullOptions = CookieBaseOptions & {
    maxAge?: number;
};

// RFC 6265 cookie-name token characters.
const COOKIE_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const COOKIE_ATTRIBUTE_PATTERN = /[;\r\n]/;

function assertCookie(cookieName: string, options?: CookieBaseOptions): void {
    if (!COOKIE_NAME_PATTERN.test(cookieName)) {
        throw new Error(`Invalid cookie name: ${JSON.stringify(cookieName)}`);
    }
    if (options?.domain && COOKIE_ATTRIBUTE_PATTERN.test(options.domain)) {
        throw new Error("Cookie domain contains invalid characters");
    }
    if (options?.path && COOKIE_ATTRIBUTE_PATTERN.test(options.path)) {
        throw new Error("Cookie path contains invalid characters");
    }
}

export class LixnetResponse {
    public responseData: any;
    public responseError: string | null = null;
    /** Extra error information, only sent when the server has `exposeErrors` enabled. */
    public responseErrorDetail: string | null = null;
    public responseCode: number = 0;
    public responseHeaders: Record<string, string> = {};
    public responseHeaderDeletes: Set<string> = new Set();
    public responseCookies: Record<string, {
        type: "value" | "delete";
        value?: string;
        options?: CookieFullOptions;
    }> = {};

    public constructor({ formatter }: { formatter: (this: LixnetResponse) => Response }) {
        this.responseData = null;
        this.format = formatter;
    }

    public data(data: any): void {
        this.responseData = data;
    }

    public header(headerName: string, headerValue: string): void {
        this.responseHeaders[headerName] = headerValue;
        this.responseHeaderDeletes.delete(headerName.toLowerCase());
    }

    public deleteHeader(headerName: string): void {
        delete this.responseHeaders[headerName];
        delete this.responseHeaders[headerName.toLowerCase()];
        this.responseHeaderDeletes.add(headerName.toLowerCase());
    }

    public error(error: string, detail?: string): void {
        this.responseError = error;
        this.responseErrorDetail = detail ?? null;
    }

    public code(code: number): void {
        this.responseCode = code;
    }

    public headers(headers: Record<string, string>): void {
        for (const [headerName, headerValue] of Object.entries(headers)) {
            this.header(headerName, headerValue);
        }
    }

    public cookie(cookieName: string, cookieValue: string, cookieOptions?: CookieFullOptions): void {
        assertCookie(cookieName, cookieOptions);
        this.responseCookies[cookieName] = {
            type: "value",
            value: cookieValue,
            options: cookieOptions,
        };
    }

    public deleteCookie(cookieName: string, options?: CookieBaseOptions): void {
        assertCookie(cookieName, options);
        this.responseCookies[cookieName] = {
            type: "delete",
            options,
        };
    }

    public format: (this: LixnetResponse) => Response;

    public setFormatter(formatter: (this: LixnetResponse) => Response): void {
        this.format = formatter;
    }
}