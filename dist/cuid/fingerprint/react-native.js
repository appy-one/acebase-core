"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pad_1 = require("../pad");
const globalCount = Object.keys(global).length;
const clientId = pad_1.default(globalCount.toString(36), 4);
function fingerprint() {
    return clientId;
}
exports.default = fingerprint;
//# sourceMappingURL=react-native.js.map