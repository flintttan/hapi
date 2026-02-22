export function buildOpencodeEnv(): NodeJS.ProcessEnv {
    return {
        ...process.env
    };
}
