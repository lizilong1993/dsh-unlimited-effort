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
 * dsh-unlimited-effort — browser half (factory body).
 *
 * Registered into `conversation.input.right`, a list slot whose entries the
 * renderer emits as a Fragment — so this button becomes a direct flex child of
 * the composer's `standardControls` row, next to the model seat. The shipped
 * model seat keeps flex `order: 0`; this button sets `order: 1`, which places
 * it to the RIGHT of the model selector while staying in normal flow (no
 * absolute positioning, so it reflows with the row at any width).
 *
 * Visibility is derived from the session's live effort selection, and the
 * switch itself is read from and written to the Host over a loopback route.
 */

/** Loopback route owned by the host half. */
var ROUTE_STATE = '/unlimited-mode/state';

/** Fallback tint when the host did not send one. */
var FALLBACK_ACTIVE_COLOR = '#924FF7';

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
 * Read the host switch state.
 * @returns the state payload, or undefined when the host is unreachable.
 */
function readHostState() {
  return fetch(ROUTE_STATE, { headers: { accept: 'application/json' }, credentials: 'same-origin' })
    .then(function (response) { return response.json(); })
    .then(function (payload) { return payload && payload.ok ? payload : undefined; });
}

/**
 * Write the host switch state.
 * @param enabled - desired state.
 * @returns the state payload the host confirmed.
 */
function writeHostState(enabled) {
  return fetch(ROUTE_STATE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ enabled: enabled }),
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
    var alive = true;
    readHostState()
      .then(function (payload) { if (alive && payload) setHost(payload); })
      .catch(function () { /* unreachable host: stay hidden */ });
    return function () { alive = false; };
  }, []);

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

  if (!host || host.pluginEnabled !== true) return null;
  if (!isTopEffort(effort, host.topEffortIds)) return null;

  var on = host.enabled === true;
  var toggle = function () {
    if (busy) return;
    var next = !on;
    setBusy(true);
    setHost(function (previous) { return previous ? Object.assign({}, previous, { enabled: next }) : previous; });
    writeHostState(next)
      .then(function (payload) { setHost(payload); })
      .catch(function () {
        setHost(function (previous) { return previous ? Object.assign({}, previous, { enabled: !next }) : previous; });
      })
      .then(function () { setBusy(false); });
  };

  return React.createElement('button', {
    type: 'button',
    'aria-pressed': on,
    'aria-label': labelFor(on),
    title: labelFor(on),
    onClick: toggle,
    style: {
      order: 1,
      flex: 'none',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'transparent',
      border: '0',
      padding: '0 4px',
      margin: '0',
      lineHeight: '1',
      fontSize: '15px',
      fontWeight: '600',
      cursor: 'pointer',
      color: on ? String(host.activeColor || FALLBACK_ACTIVE_COLOR) : 'currentColor',
      opacity: on ? '1' : '0.45',
      transition: 'color .15s ease, opacity .15s ease',
    },
  }, '∞');
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
