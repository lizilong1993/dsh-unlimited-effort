window.__ModuleLoader__.load({ id: "dsh-unlimited-effort", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
var React = require("react");
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
const EFFORT_RANK = {
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
function effortIds(reasoning) {
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
function strongestEffort(reasoning) {
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
function isTopEffort(current, topIds) {
  if (typeof current !== 'string' || current.length === 0) return false;
  if (!Array.isArray(topIds) || topIds.length === 0) return false;
  return topIds.includes(current);
}

/**
 * Whether a switch that is on must be switched off because the Session left
 * the top tier.
 *
 * An unknown effort is "not known yet", not "below the top tier": a Session
 * that has not resolved its selection must never be switched off by this rule,
 * or the first render would silently clear a legitimate choice.
 * @param enabled - the switch state this Session currently has.
 * @param current - the effort id in force, when known.
 * @param topIds - configured ids that count as the top tier.
 * @returns true only when the switch is on and a known effort is below the top.
 */
function shouldAutoOff(enabled, current, topIds) {
  if (enabled !== true) return false;
  if (typeof current !== 'string' || current.length === 0) return false;
  return !isTopEffort(current, topIds);
}

/**
 * dsh-unlimited-effort — browser half (factory body).
 *
 * Registered into `conversation.input.right`, a list slot whose entries the
 * renderer emits as a Fragment — so this button becomes a direct flex child of
 * the composer's `standardControls` row, next to the model seat. The shipped
 * model seat keeps flex `order: 0`; this button sets `order: 1`, which places
 * it to the RIGHT of the model selector while staying in normal flow (no
 * absolute positioning, so it reflows with the row at any width).
 *
 * The control is the capsule from the project banner: a rounded track with the
 * infinity glyph and a white knob that swaps sides, filled with the configured
 * accent colour when on and a neutral grey when off.
 *
 * The switch is per Session: the button asks the Host for the current Session's
 * own state and writes back only that Session. Dropping below the top effort
 * switches the mode off — here immediately, without waiting for a request, and
 * on the Host through the next request for Sessions with no composer attached.
 * Nothing ever switches it back on except a click.
 */

/** Loopback route owned by the host half. */
var ROUTE_STATE = '/unlimited-mode/state';

/** Fallback tint when the host did not send one. */
var FALLBACK_ACTIVE_COLOR = '#924FF7';

// Capsule metrics, derived from the reference art: a 2.5:1 track whose knob is
// 0.85 of the track height and sits 0.07 of it away from every edge.
var TRACK_WIDTH = 50;
var TRACK_HEIGHT = 20;
var INSET = 2;                       // clearance on every edge, 0.10 of the height
var KNOB_SIZE = TRACK_HEIGHT - INSET * 2;  // 16, so 0.80 of the height like the art
var TRACK_RADIUS = TRACK_HEIGHT / 2;       // a true semicircular end, not a guessed pill
var GLYPH_SIZE = 13;
var GLYPH_PADDING = 3;
var INNER_HEIGHT = TRACK_HEIGHT - INSET * 2;

/**
 * Localised switch label. Kept local instead of wired to the locale service so
 * the button still renders when that service is absent.
 * @param on - current switch state.
 * @returns the tooltip and accessible name.
 */
function labelFor(on) {
  var language = 'en';
  try {
    language = String(navigator.language || 'en').toLowerCase();
  } catch {
    /* no navigator: keep English */
  }
  var zh = language.indexOf('zh') === 0;
  if (zh) return on ? '无限模式：已开启' : '无限模式：已关闭';
  return on ? 'Unlimited mode: on' : 'Unlimited mode: off';
}

/**
 * Read one Session's switch state.
 * @param sessionId - the Session identity.
 * @returns the state payload, or undefined when the host is unreachable.
 */
function readHostState(sessionId) {
  var url = ROUTE_STATE + '?sessionId=' + encodeURIComponent(sessionId);
  return fetch(url, { headers: { accept: 'application/json' }, credentials: 'same-origin' })
    .then(function (response) { return response.json(); })
    .then(function (payload) { return payload && payload.ok ? payload : undefined; });
}

/**
 * Write one Session's switch state.
 * @param sessionId - the Session identity.
 * @param enabled - desired state.
 * @returns the state payload the host confirmed.
 */
function writeHostState(sessionId, enabled) {
  return fetch(ROUTE_STATE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ sessionId: sessionId, enabled: enabled }),
  })
    .then(function (response) { return response.json(); })
    .then(function (payload) {
      if (!payload || payload.ok !== true) throw new Error('host rejected the switch');
      return payload;
    });
}

/**
 * The composer infinity switch.
 * @param props - slot standard kit (`sessionId`) plus the bound directory service.
 * @returns the button, or null while it must stay hidden.
 */
function ModeButton(props) {
  var models = props.models;
  var sessionId = props.sessionId || (props.session ? props.session.sessionId : undefined);
  var hostPair = React.useState(null);
  var host = hostPair[0];
  var setHost = hostPair[1];
  var effortPair = React.useState(undefined);
  var effort = effortPair[0];
  var setEffort = effortPair[1];
  var busyPair = React.useState(false);
  var busy = busyPair[0];
  var setBusy = busyPair[1];

  React.useEffect(function () {
    if (!sessionId) return undefined;
    var alive = true;
    readHostState(sessionId)
      .then(function (payload) { if (alive && payload) setHost(payload); })
      .catch(function () { /* unreachable host: stay hidden */ });
    return function () { alive = false; };
  }, [sessionId]);

  React.useEffect(function () {
    if (!models || typeof models.directoryFor !== 'function' || !sessionId) return undefined;
    var directory;
    try {
      directory = models.directoryFor(sessionId);
    } catch {
      return undefined;
    }
    if (!directory || !directory.store) return undefined;
    var read = function () {
      try {
        var snapshot = directory.store.getSnapshot();
        setEffort(snapshot && snapshot.current ? snapshot.current.reasoningEffort : undefined);
      } catch {
        /* a transient store failure leaves the button hidden */
      }
    };
    read();
    var unsubscribe = directory.store.subscribe(read);
    return function () { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, [models, sessionId]);

  // Leaving the top tier switches the mode off, immediately and for this
  // Session only. An unknown effort is not "below the top tier" — it is "not
  // known yet" — so the guard requires a concrete id before acting.
  React.useEffect(function () {
    if (!host || !sessionId) return;
    if (!shouldAutoOff(host.enabled, effort, host.topEffortIds)) return;
    setHost(function (previous) { return previous ? Object.assign({}, previous, { enabled: false }) : previous; });
    writeHostState(sessionId, false).catch(function () { /* the host clears it on the next request anyway */ });
  }, [effort, host, sessionId]);

  if (!host || host.pluginEnabled !== true) return null;
  if (!isTopEffort(effort, host.topEffortIds)) return null;

  var on = host.enabled === true;
  var toggle = function () {
    if (busy || !sessionId) return;
    var next = !on;
    setBusy(true);
    setHost(function (previous) { return previous ? Object.assign({}, previous, { enabled: next }) : previous; });
    writeHostState(sessionId, next)
      .then(function (payload) { setHost(payload); })
      .catch(function () {
        setHost(function (previous) { return previous ? Object.assign({}, previous, { enabled: !next }) : previous; });
      })
      .then(function () { setBusy(false); });
  };

  return React.createElement('button', {
    type: 'button',
    role: 'switch',
    'aria-checked': on,
    'aria-label': labelFor(on),
    title: labelFor(on),
    onClick: toggle,
    style: {
      order: 1,
      flex: 'none',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxSizing: 'border-box',
      width: String(TRACK_WIDTH) + 'px',
      height: String(TRACK_HEIGHT) + 'px',
      padding: String(INSET) + 'px',
      margin: '0',
      border: '0',
      borderRadius: String(TRACK_RADIUS) + 'px',
      cursor: 'pointer',
      userSelect: 'none',
      WebkitTapHighlightColor: 'transparent',
      appearance: 'none',
      WebkitAppearance: 'none',
      outlineOffset: '2px',
      background: on ? String(host.activeColor || FALLBACK_ACTIVE_COLOR) : 'rgba(148, 163, 184, 0.45)',
      backgroundImage: on
        ? 'linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(0, 0, 0, 0.05))'
        : 'none',
      boxShadow: on
        ? '0 1px 2px rgba(0, 0, 0, 0.16), inset 0 0 0 1px rgba(255, 255, 255, 0.16)'
        : 'inset 0 0 0 1px rgba(148, 163, 184, 0.45)',
      transition: 'background .18s ease, box-shadow .18s ease',
    },
  }, [
    React.createElement('span', {
      key: 'knob',
      style: {
        order: on ? 2 : 0,
        flex: 'none',
        display: 'block',
        boxSizing: 'border-box',
        width: String(KNOB_SIZE) + 'px',
        height: String(KNOB_SIZE) + 'px',
        borderRadius: '50%',
        background: '#ffffff',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.26)',
        transition: 'order .18s ease',
      },
    }),
    React.createElement('span', {
      key: 'glyph',
      style: {
        order: on ? 0 : 2,
        flex: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        height: String(INNER_HEIGHT) + 'px',
        padding: '0 ' + String(GLYPH_PADDING) + 'px',
        lineHeight: '1',
        fontSize: String(GLYPH_SIZE) + 'px',
        fontWeight: '600',
        color: on ? '#ffffff' : 'rgba(71, 85, 105, 0.9)',
        transition: 'color .18s ease',
      },
    }, '\u221E'),
  ]);
}

exports.name = 'unlimited-mode';
exports.inject = ['slots'];
exports.apply = function apply(ctx) {
  ctx.inject(['slots', 'modelDirectories'], function (scope) {
    var models = scope.modelDirectories;
    scope.slots.inject('conversation.input.right', function () {
      return scope.slots.register({
        name: 'conversation.input.right',
        id: 'unlimited-mode',
        order: 60,
      }, function (props) {
        return React.createElement(ModeButton, Object.assign({}, props, { models: models }));
      });
    });
  });
};

return module.exports; } });
