import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { serveStatic } from 'hono/bun'
import type { Server as BunServer } from 'bun'
import type { Server as SocketEngine, WebSocketData } from '@socket.io/bun-engine'
import { configuration } from '../configuration'
import type { SSEManager } from '../sse/sseManager'
import type { SyncEngine } from '../sync/syncEngine'
import type { Store } from '../store'
import { isBunCompiled } from '../utils/bunCompiled'
import { loadEmbeddedAssetMap, type EmbeddedWebAsset } from './embeddedAssets'
import { createAuthMiddleware, type WebAppEnv } from './middleware/auth'
import { createAuthRoutes } from './routes/auth'
import { createBindRoutes } from './routes/bind'
import { createCliRoutes } from './routes/cli'
import { createCliTokenRoutes } from './routes/cli-tokens'
import { createEventsRoutes } from './routes/events'
import { createGitRoutes } from './routes/git'
import { createMachinesRoutes } from './routes/machines'
import { createMessagesRoutes } from './routes/messages'
import { createPermissionsRoutes } from './routes/permissions'
import { createPushRoutes } from './routes/push'
import { createRegisterRoutes } from './routes/register'
import { createSessionsRoutes } from './routes/sessions'

function findWebappDistDir(): { distDir: string; indexHtmlPath: string } {
    const candidates = [
        join(process.cwd(), '..', 'web', 'dist'),
        join(import.meta.dir, '..', '..', '..', 'web', 'dist'),
        join(process.cwd(), 'web', 'dist')
    ]

    for (const distDir of candidates) {
        const indexHtmlPath = join(distDir, 'index.html')
        if (existsSync(indexHtmlPath)) {
            return { distDir, indexHtmlPath }
        }
    }

    const distDir = candidates[0]
    return { distDir, indexHtmlPath: join(distDir, 'index.html') }
}

function serveEmbeddedAsset(asset: EmbeddedWebAsset): Response {
    return new Response(Bun.file(asset.sourcePath), {
        headers: {
            'Content-Type': asset.mimeType
        }
    })
}

function createWebApp(options: {
    getSyncEngine: () => SyncEngine | null
    getSseManager: () => SSEManager | null
    jwtSecret: Uint8Array
    store: Store
    vapidPublicKey: string
    embeddedAssetMap: Map<string, EmbeddedWebAsset> | null
}): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.use('*', logger())

    app.get('/health', (c) => c.json({ status: 'ok' }))

    const corsOrigins = configuration.corsOrigins
    const corsOriginOption = corsOrigins.includes('*') ? '*' : corsOrigins
    const corsMiddleware = cors({
        origin: corsOriginOption,
        allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        allowHeaders: ['authorization', 'content-type']
    })
    app.use('/api/*', corsMiddleware)
    app.use('/cli/*', corsMiddleware)

    app.route('/cli', createCliRoutes(options.getSyncEngine, options.store))

    app.route('/api', createAuthRoutes(options.jwtSecret, options.store))
    app.route('/api', createRegisterRoutes(options.jwtSecret, options.store))
    app.route('/api', createBindRoutes(options.jwtSecret, options.store))

    app.use('/api/*', createAuthMiddleware(options.jwtSecret, options.store))

    app.route('/api', createEventsRoutes(options.getSseManager, options.getSyncEngine))
    app.route('/api', createSessionsRoutes(options.getSyncEngine))
    app.route('/api', createMessagesRoutes(options.getSyncEngine))
    app.route('/api', createPermissionsRoutes(options.getSyncEngine))
    app.route('/api', createMachinesRoutes(options.getSyncEngine))
    app.route('/api', createGitRoutes(options.getSyncEngine))
    app.route('/api', createCliTokenRoutes(options.store))
    app.route('/api', createPushRoutes(options.store, options.vapidPublicKey))

    if (options.embeddedAssetMap) {
        const embeddedAssetMap = options.embeddedAssetMap
        const indexHtmlAsset = embeddedAssetMap.get('/index.html')

        if (!indexHtmlAsset) {
            app.get('*', (c) => {
                return c.text(
                    'Embedded Mini App is missing index.html. Rebuild the executable after running bun run build:web.',
                    503
                )
            })
            return app
        }

        app.use('*', async (c, next) => {
            if (c.req.path.startsWith('/api') || c.req.path.startsWith('/cli')) {
                return await next()
            }

            if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
                return await next()
            }

            const asset = embeddedAssetMap.get(c.req.path)
            if (asset) {
                return serveEmbeddedAsset(asset)
            }

            return await next()
        })

        app.get('*', async (c, next) => {
            if (c.req.path.startsWith('/api') || c.req.path.startsWith('/cli')) {
                await next()
                return
            }

            return serveEmbeddedAsset(indexHtmlAsset)
        })

        return app
    }

    const { distDir, indexHtmlPath } = findWebappDistDir()

    if (!existsSync(indexHtmlPath)) {
        app.get('/', (c) => {
            return c.text(
                'Mini App is not built.\n\nRun:\n  cd web\n  bun install\n  bun run build\n',
                503
            )
        })
        return app
    }

    app.use('/assets/*', serveStatic({ root: distDir }))

    app.use('*', async (c, next) => {
        if (c.req.path.startsWith('/api') || c.req.path.startsWith('/cli')) {
            await next()
            return
        }

        return await serveStatic({ root: distDir })(c, next)
    })

    app.get('*', async (c, next) => {
        if (c.req.path.startsWith('/api') || c.req.path.startsWith('/cli')) {
            await next()
            return
        }

        return await serveStatic({ root: distDir, path: 'index.html' })(c, next)
    })

    return app
}

export async function startWebServer(options: {
    getSyncEngine: () => SyncEngine | null
    getSseManager: () => SSEManager | null
    jwtSecret: Uint8Array
    store: Store
    vapidPublicKey: string
    socketEngine: SocketEngine
}): Promise<BunServer<WebSocketData>> {
    const isCompiled = isBunCompiled()
    const embeddedAssetMap = isCompiled ? await loadEmbeddedAssetMap() : null
    const app = createWebApp({
        getSyncEngine: options.getSyncEngine,
        getSseManager: options.getSseManager,
        jwtSecret: options.jwtSecret,
        store: options.store,
        vapidPublicKey: options.vapidPublicKey,
        embeddedAssetMap
    })

    const socketHandler = options.socketEngine.handler()

    const server = Bun.serve({
        port: configuration.webappPort,
        idleTimeout: Math.max(30, socketHandler.idleTimeout),
        maxRequestBodySize: socketHandler.maxRequestBodySize,
        websocket: socketHandler.websocket,
        fetch: (req, server) => {
            const url = new URL(req.url)
            if (url.pathname.startsWith('/socket.io/')) {
                return socketHandler.fetch(req, server)
            }
            return app.fetch(req)
        }
    })

    console.log(`[Web] Mini App server listening on :${configuration.webappPort}`)
    console.log(`[Web] Mini App public URL: ${configuration.miniAppUrl}`)

    return server
}
