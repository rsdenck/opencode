"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DateTimeUtcFromMillis = exports.statics = exports.withStatics = exports.optional = exports.AbsolutePath = exports.RelativePath = exports.NonNegativeInt = exports.PositiveInt = void 0;
const effect_1 = require("effect");
exports.PositiveInt = effect_1.Schema.Int.check(effect_1.Schema.isGreaterThan(0));
exports.NonNegativeInt = effect_1.Schema.Int.check(effect_1.Schema.isGreaterThanOrEqualTo(0));
exports.RelativePath = effect_1.Schema.String.pipe(effect_1.Schema.brand("RelativePath"), effect_1.Schema.annotate({ identifier: "RelativePath" }));
exports.AbsolutePath = effect_1.Schema.String.pipe(effect_1.Schema.brand("AbsolutePath"), effect_1.Schema.annotate({ identifier: "AbsolutePath" }));
const optional = (schema) => effect_1.Schema.optionalKey(schema).pipe(effect_1.Schema.decodeTo(effect_1.Schema.optional(effect_1.Schema.toType(schema)), {
    decode: effect_1.SchemaGetter.passthrough({ strict: false }),
    encode: effect_1.SchemaGetter.transformOptional(effect_1.Option.filter((value) => value !== undefined)),
}));
exports.optional = optional;
// Effect schemas expose `make` through prototype getters, so `Object.assign` cannot override it.
// Defining the properties replaces a constructor as long as the schema's own `make` has not been read.
const withStatics = (schema, methods) => Object.defineProperties(schema, Object.getOwnPropertyDescriptors(methods));
exports.withStatics = withStatics;
const statics = (methods) => (schema) => (0, exports.withStatics)(schema, methods(schema));
exports.statics = statics;
exports.DateTimeUtcFromMillis = effect_1.Schema.Finite.pipe(effect_1.Schema.decodeTo(effect_1.Schema.DateTimeUtc, {
    decode: effect_1.SchemaGetter.transform((value) => effect_1.DateTime.makeUnsafe(value)),
    encode: effect_1.SchemaGetter.transform((value) => effect_1.DateTime.toEpochMillis(value)),
}));
