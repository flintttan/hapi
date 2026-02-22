import { join } from 'path'
import { tmpdir } from 'os'

export const HAPI_BLOBS_DIR_NAME = 'hapi-blobs'

export function getHapiBlobsDir(): string {
    return join(tmpdir(), HAPI_BLOBS_DIR_NAME)
}
