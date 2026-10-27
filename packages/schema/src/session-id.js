"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionID = void 0;
const effect_1 = require("effect");
const identifier_js_1 = require("./identifier.js");
const schema_js_1 = require("./schema.js");
exports.SessionID = effect_1.Schema.String.check(effect_1.Schema.isStartingWith("ses")).pipe(effect_1.Schema.brand("SessionID"), effect_1.Schema.annotate({ identifier: "Session.ID" }), (0, schema_js_1.statics)((schema) => ({
    create: () => schema.make("ses_" + (0, identifier_js_1.descending)()),
})));
