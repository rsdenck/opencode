# Official plugins

Each directory is a separately installable OpenCode plugin. Plugins are currently installed from Git URLs, not npm. The URL can omit a branch name to use the repository's default branch.

These packages are not bundled with OpenCode or loaded automatically. Do not add them to Core's dependencies, its built-in plugin registry, or the repository's `.opencode/plugins/` directory.

| Plugin                                       | Directory                          |
| -------------------------------------------- | ---------------------------------- |
| [Figma](figma/README.md)                     | `packages/plugins/figma`           |
| [Proton Mail](proton-mail/README.md)         | `packages/plugins/proton-mail`     |
| [Proton Calendar](proton-calendar/README.md) | `packages/plugins/proton-calendar` |
| [Proton Drive](proton-drive/README.md)       | `packages/plugins/proton-drive`    |
| [Proton Docs](proton-docs/README.md)         | `packages/plugins/proton-docs`     |
| [Proton Sheets](proton-sheets/README.md)     | `packages/plugins/proton-sheets`   |
| [Proton Meet](proton-meet/README.md)         | `packages/plugins/proton-meet`     |
