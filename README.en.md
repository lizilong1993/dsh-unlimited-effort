# dsh-unlimited-effort

<p align="center">
  <img src="assets/banner.jpg" alt="dsh-unlimited-effort — the infinity reasoning-effort switch for DeepSeek Harness" width="100%">
</p>

> A DeepSeek Harness plugin: an **∞** switch in the composer. When the session's reasoning effort is at its highest tier, it appears to the right of the model selector; one click appends a configurable "budget is unlimited" sentence to the system prompt of every later request.

[中文](README.md) · [Install](#install) · [Usage](#usage) · [Configuration](#configuration) · [How it works](#how-it-works) · [Permissions and data](#permissions-and-data) · [Uninstall](#uninstall) · [Known limitations](#known-limitations)

## What it does

- It does exactly two things: registers one ∞ button in the composer, and — while you have switched it on — appends one configurable sentence to the system prompt.
- The button only exists at the **top** effort tier (default `max`, then `xhigh`; configurable). Drop below it and the button hides and the injection stops.
- The button has **no background and only the ∞ glyph**: grey means off, purple (default `#924FF7`) means on.
- It does not touch models, effort tiers, providers, or your configuration file. Remove the plugin and everything is native again.

## Install

Requires DeepSeek Harness `0.2.x` (`>=0.2.0-rc.1 <0.3.0-0`).

```sh
dsh plugin --profile desktop add dsh-unlimited-effort
```

Replace `desktop` with your profile. Restart DSH afterwards.

Manual install: copy this repository into `<profile>/node_modules/dsh-unlimited-effort`, add the dependency to the profile's `package.json`, append `dsh-unlimited-effort` to `dsh.profile.bundles`, and restart. The bundle list — not `cordis.patch.yml` — is what actually loads the plugin.

## Usage

1. Open a session and pick the highest reasoning effort (`Max`) in the model menu.
2. A grey **∞** appears to the right of the model selector.
3. Click it: it turns purple, and every later request carries the sentence at the end of its system prompt.
4. Click again: back to grey, injection stops.
5. Selecting anything below the top tier hides the button and stops the injection. Returning to the top tier brings the button back with the state you left it in.

The switch is **persisted globally** (`$DSH_HOME/unlimited-mode.json`), so one click covers every later session and survives a restart.

## Configuration

Override by id in the profile's `cordis.patch.yml` (write only what you change):

```yaml
- id: unlimited-mode
  config:
    notice: 'Your token budget is unlimited.'
```

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Plugin master switch; off means no button and no injection |
| `notice` | long Chinese sentence | Injected text |
| `activeColor` | `#924FF7` | On-state colour; the off state is always grey (`currentColor` at 45% opacity, theme-following) |
| `topEffortIds` | `['max', 'xhigh']` | Which effort ids count as the top tier; drives both visibility and injection |
| `variableName` | `unlimited_notice` | Extra prompt variable name; must match `[a-z][a-z0-9_]*` |
| `debug` | `false` | Writes `$DSH_HOME/unlimited-mode.log` |

### Presets with `complete: true`

A preset whose persona is `complete: true` drops every other system-prompt section, so the section above is discarded. Write `{{unlimited_notice}}` into that persona instead: the plugin registers the same name as a prompt variable and expands it under the same conditions.

### Self-check

```sh
node tools/check.mjs
```

Verifies package presence, bundle activation, the `dsh.bundle`/`dsh.client` declarations, the built bundle's slot and ordering, the state file, and any override block. Exit 0 means usable, 1 means it needs fixing.

## How it works

- **Browser half** registers into `conversation.input.right` — a `list` slot the renderer emits as a Fragment, so the button becomes a direct flex child of the composer's `standardControls` row. The model seat sits at flex `order: 0`; the button sets `order: 1` and therefore lands to the **right** of the model selector and before the `activity` container that holds the microphone. It is ordinary flex flow — no absolute positioning — so it reflows with the row at any width.
- **Visibility** comes from `ctx.modelDirectories.directoryFor(sessionId).store` (the live session selection), compared against the host-supplied `topEffortIds`.
- **Host half** registers one system-prompt section (`external:unlimited-mode`, order `10250`, right after `deployment:persona-suffix`) plus a variable of the same name. The section text is a function: plugin on, switch on, effort in the top set → the notice; otherwise an empty string, which is dropped at render time.
- **Transport** is `/unlimited-mode/state`, loopback only. `GET` reads, `POST { enabled }` writes; bodies are capped at 8 KB.

## Permissions and data

- Writes only `$DSH_HOME/unlimited-mode.json` and, with `debug`, `$DSH_HOME/unlimited-mode.log`.
- No network calls, no uploads, no credential access, no edits to the Harness installation.
- A corrupted state file reads as "off", so a broken file can never turn the mode on.

## Uninstall

```sh
dsh plugin --profile desktop remove dsh-unlimited-effort
```

Delete `$DSH_HOME/unlimited-mode.json` to clear the leftover switch. After a restart the button and the injection are gone; model and effort configuration are untouched.

## Known limitations

- Placement depends on `conversation.input.right` being rendered as a Fragment inside a flex parent. If a future version changes that structure, the button falls back to sitting beside the other `input.right` controls — it still works.
- `conversation.input.activity` is a `single` slot occupied by voice input, so the button cannot sit flush against the microphone; `order: 1` puts it between the two.
- `topEffortIds` is a static set. A model that only declares `low`/`high` never shows the button — by design: no top tier, no unlimited mode.
- Switching models mid-session re-evaluates the button against the new model's tiers.

## Development

```sh
npm run build   # src/client/body.js + src/shared/decide.js -> lib/client.js
npm test        # node --test
npm run check   # tools/check.mjs
```

`lib/client.js` is committed, so `dsh plugin add` needs no build on the user's machine.

## License

MIT
