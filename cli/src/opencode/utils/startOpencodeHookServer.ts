import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { logger } from '@/ui/logger';
import type { OpencodeHookEvent } from '../types';

export interface OpencodeHookServerOptions {
    onEvent: (event: OpencodeHookEvent) => void;
    token?: string;
}

export interface OpencodeHookServer {
    port: number;
    token: string;
    stop: () => void;
}

function readHookToken(req: IncomingMessage): string | null {
    const header = req.headers['x-hapi-hook-token'];
    if (Array.isArray(header)) {
        return header[0] ?? null;
    }
    return header ?? null;
}

export async function startOpencodeHookServer(options: OpencodeHookServerOptions): Promise<OpencodeHookServer> {
    const hookToken = options.token || randomBytes(16).toString('hex');

    return new Promise((resolve, reject) => {
        const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
            const requestPath = req.url?.split('?')[0];
            if (req.method === 'POST' && requestPath === '/hook/opencode') {
                const providedToken = readHookToken(req);
                if (providedToken !== hookToken) {
                    logger.debug('[opencode-hook] Unauthorized hook request');
                    res.writeHead(401, { 'Content-Type': 'text/plain' }).end('unauthorized');
                    req.resume();
                    return;
                }

                let timedOut = false;
                const timeout = setTimeout(() => {
                    timedOut = true;
                    if (!res.headersSent) {
                        logger.debug('[opencode-hook] Request timeout');
                        res.writeHead(408).end('timeout');
                    }
                    req.destroy(new Error('Request timeout'));
                }, 5000);

                try {
                    const chunks: Buffer[] = [];
                    for await (const chunk of req) {
                        chunks.push(chunk as Buffer);
                    }
                    clearTimeout(timeout);

                    if (timedOut || res.headersSent || res.writableEnded) {
                        return;
                    }

                    const body = Buffer.concat(chunks).toString('utf-8');
                    logger.debug('[opencode-hook] Received hook:', body);

                    let data: Record<string, unknown> = {};
                    try {
                        const parsed = JSON.parse(body);
                        if (!parsed || typeof parsed !== 'object') {
                            logger.debug('[opencode-hook] Parsed hook data is not an object');
                            res.writeHead(400, { 'Content-Type': 'text/plain' }).end('invalid json');
                            return;
                        }
                        data = parsed as Record<string, unknown>;
                    } catch (parseError) {
                        logger.debug('[opencode-hook] Failed to parse hook data as JSON:', parseError);
                        res.writeHead(400, { 'Content-Type': 'text/plain' }).end('invalid json');
                        return;
                    }

                    const eventValue = data.event;
                    if (typeof eventValue !== 'string' || eventValue.length === 0) {
                        res.writeHead(422, { 'Content-Type': 'text/plain' }).end('missing event');
                        return;
                    }

                    const payload = data.payload;
                    const sessionId = typeof data.sessionId === 'string' ? data.sessionId : undefined;
                    options.onEvent({ event: eventValue, payload, sessionId });

                    if (!res.headersSent && !res.writableEnded) {
                        res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
                    }
                } catch (error) {
                    clearTimeout(timeout);
                    if (timedOut) {
                        return;
                    }
                    logger.debug('[opencode-hook] Error handling hook:', error);
                    if (!res.headersSent && !res.writableEnded) {
                        res.writeHead(500).end('error');
                    }
                }
                return;
            }

            res.writeHead(404).end('not found');
        });

        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                reject(new Error('Failed to get server address'));
                return;
            }

            const port = address.port;
            logger.debug(`[opencode-hook] Started on port ${port}`);

            resolve({
                port,
                token: hookToken,
                stop: () => {
                    server.close();
                    logger.debug('[opencode-hook] Stopped');
                }
            });
        });

        server.on('error', (err) => {
            logger.debug('[opencode-hook] Server error:', err);
            reject(err);
        });
    });
}
