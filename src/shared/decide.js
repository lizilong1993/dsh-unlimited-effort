/**
 * Pure reasoning-effort helpers shared by the host half, the browser half and
 * the self-check script. No imports, no side effects: the browser bundle
 * inlines this file verbatim.
 *
 * Adapters report efforts as { id, name, description? } and list them weakest
 * first; ids are the only stable identity, names are display text that any
 * adapter may localise.
 */

/** Known effort ids, weakest first. Unknown ids keep their adapter order. */
export const EFFORT_RANK = {
  off: 0,
  minimal: 1,
  low: 2,
  medium: 3,
  high: 4,
  xhigh: 5,
  max: 6,
};

/**
 * Effort ids advertised by one resolved model, in adapter order.
 * @param reasoning - resolved model reasoning metadata, when present.
 * @returns non-empty ids; empty when the model declares no reasoning.
 */
export function effortIds(reasoning) {
  const efforts = reasoning && Array.isArray(reasoning.efforts) ? reasoning.efforts : [];
  const ids = [];
  for (const entry of efforts) {
    const id = typeof entry === 'string' ? entry : entry && entry.id;
    if (typeof id === 'string' && id.length > 0 && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * The strongest advertised effort id.
 * @param reasoning - resolved model reasoning metadata.
 * @returns the strongest id, or undefined when nothing is advertised.
 */
export function strongestEffort(reasoning) {
  const ids = effortIds(reasoning);
  if (ids.length === 0) return undefined;
  let best = ids[ids.length - 1];
  let bestRank = -1;
  for (const id of ids) {
    const rank = EFFORT_RANK[String(id).toLowerCase()];
    if (rank === undefined) continue;
    if (rank >= bestRank) {
      best = id;
      bestRank = rank;
    }
  }
  return best;
}

/**
 * Whether one effort id is in the configured top set.
 * @param current - the effort id in force for the current request.
 * @param topIds - configured ids that count as "the top tier".
 * @returns true only for a non-empty current id contained in topIds.
 */
export function isTopEffort(current, topIds) {
  if (typeof current !== 'string' || current.length === 0) return false;
  if (!Array.isArray(topIds) || topIds.length === 0) return false;
  return topIds.includes(current);
}
