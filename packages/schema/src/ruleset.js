"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.permissionsForMode = permissionsForMode;
/** Generate a Permission.Ruleset from a mode string. */
function permissionsForMode(mode) {
    if (mode === "auto") {
        return [{ action: "*", resource: "*", effect: "allow" }];
    }
    const base = { action: "*", resource: "*", effect: "allow" };
    const mutating = ["edit", "write", "shell", "bash"];
    const network = ["webfetch", "websearch", "fetch"];
    if (mode === "ask") {
        return [
            base,
            ...mutating.map((a) => ({ action: a, resource: "*", effect: "ask" })),
            ...network.map((a) => ({ action: a, resource: "*", effect: "ask" })),
        ];
    }
    // strict
    return [
        base,
        ...mutating.map((a) => ({ action: a, resource: "*", effect: "ask" })),
        ...network.map((a) => ({ action: a, resource: "*", effect: "deny" })),
        { action: "task", resource: "*", effect: "deny" },
        { action: "browser", resource: "*", effect: "deny" },
    ];
}
