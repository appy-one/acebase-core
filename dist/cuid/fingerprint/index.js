"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pad_1 = require("../pad");
const os = require("os");
const padding = 2, pid = pad_1.default(process.pid.toString(36), padding), hostname = os.hostname(), length = hostname.length, hostId = pad_1.default(hostname
    .split('')
    .reduce(function (prev, char) {
    return +prev + char.charCodeAt(0);
}, +length + 36)
    .toString(36), padding);
function fingerprint() {
    return pid + hostId;
}
exports.default = fingerprint;
//# sourceMappingURL=index.js.map