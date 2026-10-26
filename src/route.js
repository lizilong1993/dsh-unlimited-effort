/** Helpers for the loopback state route. */

/** Largest request body the state route accepts. */
export const MAX_BODY = 8 * 1024;

/**
 * Whether a request arrived over the loopback interface.
 * @param req - the Node request.
 * @returns true for 127.0.0.1 and ::1 in every spelling Node uses.
 */
export function isLoopback(req) {
  const address = req && req.socket ? req.socket.remoteAddress : undefined;
  if (typeof address !== 'string') return false;
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

/**
 * Read and parse a small JSON body.
 * @param req - the Node request.
 * @returns the parsed body, or undefined when it is too large or not JSON.
 */
export async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) return undefined;
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Send one JSON reply.
 * @param res - the Node response.
 * @param status - HTTP status code.
 * @param body - JSON-serialisable payload.
 */
export function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(text);
}
