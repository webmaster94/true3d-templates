# True 3D Templates

True 3D Templates adds elevation control to D&D 5e AOE placement in Foundry VTT 14.

Hold the configured modifier and use the mouse wheel while placing a spell, feature, or item template. Wheel up raises the template and wheel down lowers it. Modifier + Up/Down Arrow is also available as an accessibility fallback. The elevation badge shows the absolute elevation with a sign and the offset from the source token. Foundry saves that elevation on the Region created for the template, so elevation-aware targeting modules can use it.

The default modifier is Alt. A GM can change the world default, and each player can choose a client-side override. The GM also controls the elevation step and the default wall preview. Players can show or hide the wall preview locally.

When wall preview is enabled, Foundry's sight-wall collision check runs at the selected elevation. Blocked parts of the template are painted red before placement. This is a preview aid. A spell's own rules still decide whether a wall blocks its effect.

## Compatibility

- Foundry Virtual Tabletop 14.360
- D&D 5e 5.3.3
- Region-backed templates introduced in Foundry 14
- Compatible with Midi-QOL's template elevation handling

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
