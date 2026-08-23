# True 3D Templates

True 3D Templates adds elevation control to D&D 5e AOE placement in Foundry VTT 14.

Hold the configured modifier and use the mouse wheel while placing a spell, feature, or item template. Wheel up raises the template and wheel down lowers it. Modifier + Up/Down Arrow is also available as an accessibility fallback. The elevation badge shows the absolute elevation with a sign and the offset from the source token. Foundry saves that elevation on the Region created for the template, so elevation-aware targeting modules can use it.

The default modifier is Alt. A GM can change the world default, and each player can choose a client-side override. The GM also controls the elevation step and the default wall preview. Players can show or hide the wall preview locally.

When wall preview is enabled, Foundry's sight-wall collision check runs at the selected elevation. Blocked parts of the template are painted red before placement. This is a preview aid. A spell's own rules still decide whether a wall blocks its effect.

For sphere templates such as Fireball, live targeting uses the actual 3D distance from the template center to each creature: horizontal distance and elevation difference are combined instead of treating the circle as an infinite vertical column. The badge shows the current target count while the template moves. When Midi-QOL is active, True 3D Templates replaces the final targets through Midi's workflow hook for these spherical Regions only. Other templates and Midi targeting behavior are left unchanged.

True 3D sphere targeting is enabled for the world by default. Each player can turn the live target preview on or off for their client. Midi-QOL's auto-target mode, defeated/incapacitated exclusions, disposition filters, target limits, and wall-blocking choice are respected.

## Compatibility

- Foundry Virtual Tabletop 14.360 and later v14 builds
- D&D 5e 5.3.3
- Region-backed templates introduced in Foundry 14
- Compatible with Midi-QOL auto-targeting; spherical Region targets are corrected without patching Midi-QOL

## Install

Paste this manifest URL into Foundry's module installer:

`https://github.com/webmaster94/true3d-templates/releases/latest/download/module.json`

Enable **True 3D Templates** in the world, then open **Configure Settings → Module Settings** to change the defaults.

## Development

```sh
npm test
npm run check
npm run package
```

The release archive and manifest are written to `release/`.
