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
      width: '52px',
      height: '26px',
      padding: '0 4px',
      margin: '0',
      border: '0',
      borderRadius: '999px',
      cursor: 'pointer',
      background: on ? String(host.activeColor || FALLBACK_ACTIVE_COLOR) : 'rgba(148, 163, 184, 0.45)',
      boxShadow: on ? '0 1px 3px rgba(0, 0, 0, 0.18)' : 'inset 0 0 0 1px rgba(148, 163, 184, 0.35)',
      transition: 'background .18s ease, box-shadow .18s ease',
    },
  }, [
    React.createElement('span', {
      key: 'knob',
      style: {
        order: on ? 2 : 0,
        flex: 'none',
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        background: '#ffffff',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.28)',
        transition: 'order .18s ease',
      },
    }),
    React.createElement('span', {
      key: 'glyph',
      style: {
        order: on ? 0 : 2,
        flex: 'none',
        lineHeight: '1',
        fontSize: '14px',
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
