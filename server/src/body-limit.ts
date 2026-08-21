import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';

const STANDARD_BODY_BYTES = 10 * 1024 * 1024;
const LIBRARY_UPLOAD_BYTES = 36 * 1024 * 1024;

export function createRequestBodyLimit(
  standardMax = STANDARD_BODY_BYTES,
  libraryUploadMax = LIBRARY_UPLOAD_BYTES,
): MiddlewareHandler {
  const standard = bodyLimit({
    maxSize: standardMax,
    onError: (c) => c.text('Request body too large', 413),
  });
  const libraryUpload = bodyLimit({
    maxSize: libraryUploadMax,
    onError: (c) => c.text('Request body too large', 413),
  });

  return async (c, next) => {
    const isLibraryUpload = c.req.method === 'PUT' && /^\/file\/[^/]+$/.test(c.req.path);
    return (isLibraryUpload ? libraryUpload : standard)(c, next);
  };
}

export const requestBodyLimit = createRequestBodyLimit();
