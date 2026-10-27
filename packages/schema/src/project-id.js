"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectID = void 0;
const effect_1 = require("effect");
const schema_js_1 = require("./schema.js");
exports.ProjectID = effect_1.Schema.String.pipe(effect_1.Schema.brand("Project.ID"), effect_1.Schema.annotate({ identifier: "Project.ID" }), (0, schema_js_1.statics)((schema) => ({ global: schema.make("global") })));
