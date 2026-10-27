"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ruleset = exports.Rule = exports.Effect = exports.Event = exports.Reply = exports.Request = exports.Source = exports.ID = exports.Permission = void 0;
exports.Permission = __importStar(require("./permission.js"));
const effect_1 = require("effect");
const schema_js_1 = require("./schema.js");
const event_js_1 = require("./event.js");
const identifier_js_1 = require("./identifier.js");
const session_id_js_1 = require("./session-id.js");
const schema_js_2 = require("./schema.js");
exports.ID = effect_1.Schema.String.check(effect_1.Schema.isStartingWith("per")).pipe(effect_1.Schema.brand("Permission.ID"), effect_1.Schema.annotate({ identifier: "Permission.ID" }), (0, schema_js_2.statics)((schema) => ({ create: (id) => schema.make(id ?? "per_" + (0, identifier_js_1.ascending)()) })));
exports.Source = effect_1.Schema.Union([
    effect_1.Schema.Struct({
        type: effect_1.Schema.Literal("tool"),
        messageID: effect_1.Schema.String,
        id: effect_1.Schema.String,
    }),
]).annotate({ identifier: "Permission.Source" });
const RequestFields = {
    sessionID: session_id_js_1.SessionID,
    action: effect_1.Schema.String,
    resources: effect_1.Schema.Array(effect_1.Schema.String),
    save: effect_1.Schema.Array(effect_1.Schema.String).pipe(schema_js_1.optional),
    metadata: effect_1.Schema.Record(effect_1.Schema.String, effect_1.Schema.Unknown).pipe(schema_js_1.optional),
    source: exports.Source.pipe(schema_js_1.optional),
    message: effect_1.Schema.String.pipe(schema_js_1.optional),
};
exports.Request = effect_1.Schema.Struct({
    id: exports.ID,
    ...RequestFields,
}).annotate({ identifier: "Permission.Request" });
exports.Reply = effect_1.Schema.Literals(["once", "always", "reject"]).annotate({ identifier: "Permission.Reply" });
const Asked = (0, event_js_1.ephemeral)({ type: "permission.asked", schema: exports.Request.fields });
const Replied = (0, event_js_1.ephemeral)({
    type: "permission.replied",
    schema: {
        sessionID: session_id_js_1.SessionID,
        requestID: exports.ID,
        reply: exports.Reply,
    },
});
exports.Event = { Asked, Replied, Definitions: (0, event_js_1.inventory)(Asked, Replied) };
exports.Effect = effect_1.Schema.Literals(["allow", "deny", "ask"]).annotate({ identifier: "Permission.Effect" });
exports.Rule = effect_1.Schema.Struct({
    action: effect_1.Schema.String,
    resource: effect_1.Schema.String,
    effect: exports.Effect,
}).annotate({ identifier: "Permission.Rule" });
exports.Ruleset = effect_1.Schema.Array(exports.Rule).annotate({ identifier: "Permission.Ruleset" });
