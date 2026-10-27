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
exports.PublicInfo = exports.Info = exports.PublicRef = exports.Ref = exports.Location = void 0;
exports.response = response;
exports.Location = __importStar(require("./location.js"));
const effect_1 = require("effect");
const schema_js_1 = require("./schema.js");
const project_id_js_1 = require("./project-id.js");
const workspace_id_js_1 = require("./workspace-id.js");
exports.Ref = effect_1.Schema.Struct({
    directory: schema_js_1.AbsolutePath,
    workspaceID: (0, schema_js_1.optional)(workspace_id_js_1.WorkspaceID),
}).annotate({ identifier: "Location.Ref" });
exports.PublicRef = effect_1.Schema.Struct(effect_1.Struct.omit(exports.Ref.fields, ["workspaceID"])).annotate({
    identifier: "Location.PublicRef",
});
class Info extends effect_1.Schema.Class("Location.Info")({
    directory: schema_js_1.AbsolutePath,
    workspaceID: (0, schema_js_1.optional)(workspace_id_js_1.WorkspaceID),
    project: effect_1.Schema.Struct({
        id: project_id_js_1.ProjectID,
        directory: schema_js_1.AbsolutePath,
        canonical: schema_js_1.AbsolutePath,
    }),
}) {
}
exports.Info = Info;
exports.PublicInfo = effect_1.Schema.Struct(effect_1.Struct.omit(Info.fields, ["workspaceID"])).annotate({
    identifier: "Location.PublicInfo",
});
function response(data) {
    return effect_1.Schema.Struct({ location: exports.PublicRef, data });
}
