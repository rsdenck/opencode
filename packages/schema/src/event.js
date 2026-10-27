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
exports.Version = exports.Seq = exports.ID = exports.Event = void 0;
exports.durable = durable;
exports.ephemeral = ephemeral;
exports.inventory = inventory;
exports.latest = latest;
exports.versionedType = versionedType;
exports.durableMap = durableMap;
exports.Event = __importStar(require("./event.js"));
const effect_1 = require("effect");
const schema_js_1 = require("./schema.js");
const identifier_js_1 = require("./identifier.js");
const location_js_1 = require("./location.js");
const schema_js_2 = require("./schema.js");
exports.ID = effect_1.Schema.String.check(effect_1.Schema.isStartingWith("evt_")).pipe(effect_1.Schema.brand("Event.ID"), effect_1.Schema.annotate({ identifier: "Event.ID" }), (0, schema_js_2.statics)((schema) => ({ create: () => schema.make("evt_" + (0, identifier_js_1.ascending)()) })));
/**
 * Position in one aggregate's durable log. Values originate from the durable
 * event envelope and synced markers;
 * `after` cursors accept only values that came from those sources.
 */
exports.Seq = effect_1.Schema.Int.check(effect_1.Schema.isGreaterThanOrEqualTo(0)).pipe(effect_1.Schema.brand("Event.Seq"), effect_1.Schema.annotate({ identifier: "Event.Seq" }));
/** Durable schema version of one event type, from the event definition that committed it. */
exports.Version = effect_1.Schema.Int.check(effect_1.Schema.isGreaterThanOrEqualTo(1)).pipe(effect_1.Schema.brand("Event.Version"), effect_1.Schema.annotate({ identifier: "Event.Version" }));
const DurableEnvelope = effect_1.Schema.Struct({ aggregateID: effect_1.Schema.String, seq: exports.Seq, version: exports.Version });
function durable(input) {
    const data = effect_1.Schema.Struct(input.schema);
    const durable = effect_1.Schema.Struct({
        aggregateID: DurableEnvelope.fields.aggregateID,
        seq: DurableEnvelope.fields.seq,
        version: effect_1.Schema.Literal(input.durable.version).pipe(effect_1.Schema.decodeTo(effect_1.Schema.toType(exports.Version), effect_1.SchemaTransformation.transform({
            decode: () => exports.Version.make(input.durable.version),
            encode: () => input.durable.version,
        }))),
    });
    return effect_1.Schema.Struct({
        id: exports.ID,
        created: effect_1.Schema.Finite,
        metadata: (0, schema_js_1.optional)(effect_1.Schema.Record(effect_1.Schema.String, effect_1.Schema.Unknown)),
        type: effect_1.Schema.Literal(input.type),
        durable,
        location: (0, schema_js_1.optional)(location_js_1.Location.Ref),
        data,
    })
        .annotate({ identifier: input.identifier ?? input.type })
        .pipe((0, schema_js_2.statics)(() => ({
        type: input.type,
        durability: "durable",
        durable: input.durable,
        data,
    })));
}
function ephemeral(input) {
    const data = effect_1.Schema.Struct(input.schema);
    return effect_1.Schema.Struct({
        id: exports.ID,
        created: effect_1.Schema.Finite,
        metadata: (0, schema_js_1.optional)(effect_1.Schema.Record(effect_1.Schema.String, effect_1.Schema.Unknown)),
        type: effect_1.Schema.Literal(input.type),
        location: (0, schema_js_1.optional)(location_js_1.Location.Ref),
        data,
    })
        .annotate({ identifier: input.identifier ?? input.type })
        .pipe((0, schema_js_2.statics)(() => ({
        type: input.type,
        durability: "ephemeral",
        durable: undefined,
        data,
    })));
}
function inventory(...definitions) {
    return Object.freeze(definitions);
}
function latest(definitions) {
    return readonlyMap(definitions.reduce((result, definition) => {
        const existing = result.get(definition.type);
        if (!existing) {
            result.set(definition.type, definition);
            return result;
        }
        if (definition.durable && existing.durable && definition.durable.version !== existing.durable.version) {
            if (definition.durable.version > existing.durable.version)
                result.set(definition.type, definition);
            return result;
        }
        if (definition !== existing)
            throw new Error(`Duplicate latest event definition for ${definition.type}`);
        return result;
    }, new Map()));
}
function versionedType(type, version) {
    return `${type}.${version}`;
}
function durableMap(definitions) {
    return readonlyMap(definitions.reduce((result, definition) => {
        if (definition.durability !== "durable")
            return result;
        const key = versionedType(definition.type, definition.durable.version);
        if (result.has(key))
            throw new Error(`Duplicate durable event definition for ${key}`);
        result.set(key, definition);
        return result;
    }, new Map()));
}
function readonlyMap(map) {
    const result = Object.freeze({
        get size() {
            return map.size;
        },
        entries: () => map.entries(),
        forEach: (callback, thisArg) => map.forEach((value, key) => callback.call(thisArg, value, key, result)),
        get: (key) => map.get(key),
        has: (key) => map.has(key),
        keys: () => map.keys(),
        values: () => map.values(),
        [Symbol.iterator]: () => map[Symbol.iterator](),
    });
    return result;
}
