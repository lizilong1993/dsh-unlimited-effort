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
 * The track, the knob and the glyph are one inline SVG: CSS corner radii and
 * percentage radii were not surviving this environment intact, and SVG circles
 * and rounded rects are exact by construction.
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
// Drawn as SVG so the geometry cannot be reinterpreted by the box model: the
// track is a rect whose corner radius is exactly half its height (a true
// semicircular end) and the knob is a circle, not a rounded box.
var TRACK_WIDTH = 50;
var TRACK_HEIGHT = 20;
var INSET = 2;
var TRACK_RADIUS = TRACK_HEIGHT / 2;                    // 10 -> perfect pill
var KNOB_RADIUS = (TRACK_HEIGHT - INSET * 2) / 2;       // 8  -> 16px circle
var KNOB_CX_ON = TRACK_WIDTH - INSET - KNOB_RADIUS;     // 40
var KNOB_CX_OFF = INSET + KNOB_RADIUS;                  // 10
var GLYPH_CX_ON = 16;
var GLYPH_CX_OFF = TRACK_WIDTH - 16;
var GLYPH_RADIUS = 3.1;
var GLYPH_SPREAD = 3.4;
var GLYPH_STROKE = 1.7;

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

  var trackFill = on ? String(host.activeColor || FALLBACK_ACTIVE_COLOR) : '#cfd6df';
  var glyphColor = on ? '#ffffff' : '#475569';
  var knobCx = on ? KNOB_CX_ON : KNOB_CX_OFF;
  var glyphCx = on ? GLYPH_CX_ON : GLYPH_CX_OFF;

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
      justifyContent: 'center',
      width: String(TRACK_WIDTH) + 'px',
      height: String(TRACK_HEIGHT) + 'px',
      padding: '0',
      margin: '0',
      border: '0',
      background: 'transparent',
      cursor: 'pointer',
      userSelect: 'none',
      WebkitTapHighlightColor: 'transparent',
      appearance: 'none',
      WebkitAppearance: 'none',
      lineHeight: '0',
    },
  }, React.createElement('svg', {
    width: String(TRACK_WIDTH),
    height: String(TRACK_HEIGHT),
    viewBox: '0 0 ' + String(TRACK_WIDTH) + ' ' + String(TRACK_HEIGHT),
    'aria-hidden': 'true',
    focusable: 'false',
    style: { display: 'block', overflow: 'visible' },
  }, [
    React.createElement('rect', {
      key: 'track',
      x: '0',
      y: '0',
      width: String(TRACK_WIDTH),
      height: String(TRACK_HEIGHT),
      rx: String(TRACK_RADIUS),
      ry: String(TRACK_RADIUS),
      fill: trackFill,
      stroke: on ? 'rgba(255, 255, 255, 0.22)' : 'rgba(148, 163, 184, 0.55)',
      strokeWidth: '1',
    }),
    React.createElement('g', {
      key: 'glyph',
      fill: 'none',
      stroke: glyphColor,
      strokeWidth: String(GLYPH_STROKE),
      strokeLinecap: 'round',
      style: { transition: 'stroke .18s ease' },
    }, [
      React.createElement('circle', { key: 'l', cx: String(glyphCx - GLYPH_SPREAD), cy: String(TRACK_HEIGHT / 2), r: String(GLYPH_RADIUS) }),
      React.createElement('circle', { key: 'r', cx: String(glyphCx + GLYPH_SPREAD), cy: String(TRACK_HEIGHT / 2), r: String(GLYPH_RADIUS) }),
    ]),
    React.createElement('circle', {
      key: 'knob',
      cx: String(knobCx),
      cy: String(TRACK_HEIGHT / 2),
      r: String(KNOB_RADIUS),
      fill: '#ffffff',
      style: { transition: 'cx .18s ease' },
    }),
  ]));
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
