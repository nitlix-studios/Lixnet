export default function ({
    error = false,
    message,
    cause,
}: {
    error?: boolean;
    message: string;
    cause?: unknown;
}) {
    const args = cause === undefined ? [message] : [message, cause];
    if (error) {
        return console.error(`[LIXNET]`, ...args);
    }
    return console.log(`[LIXNET]`, ...args);
}
