"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pad_1 = require("../pad");
const env = typeof window === 'object' ? window : self, globalCount = Object.keys(env).length, mimeTypesLength = navigator.mimeTypes ? navigator.mimeTypes.length : 0, clientId = pad_1.default((mimeTypesLength +
    navigator.userAgent.length).toString(36) +
    globalCount.toString(36), 4);
function fingerprint() {
    return clientId;
}
exports.default = fingerprint;
//# sourceMappingURL=browser.js.map