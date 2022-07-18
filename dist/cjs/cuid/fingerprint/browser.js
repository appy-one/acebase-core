"use strict";
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
const pad_1 = require("../pad");
const env = typeof window === 'object' ? window : self, globalCount = Object.keys(env).length, mimeTypesLength = (_b = (_a = navigator.mimeTypes) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0, clientId = (0, pad_1.default)((mimeTypesLength
    + navigator.userAgent.length).toString(36)
    + globalCount.toString(36), 4);
function fingerprint() {
    return clientId;
}
exports.default = fingerprint;
//# sourceMappingURL=browser.js.map