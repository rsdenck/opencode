"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceID = void 0;
const effect_1 = require("effect");
const identifier_js_1 = require("./identifier.js");
const schema_js_1 = require("./schema.js");
exports.WorkspaceID = effect_1.Schema.String.check(effect_1.Schema.isStartingWith("wrk")).pipe(effect_1.Schema.brand("Workspace.ID"), effect_1.Schema.annotate({ identifier: "Workspace.ID" }), (0, schema_js_1.statics)((schema) => {
    const create = () => schema.make("wrk_" + (0, identifier_js_1.ascending)());
    return {
        ascending: (id) => {
            if (!id)
                return create();
            return schema.make(id);
        },
        create,
    };
}));
