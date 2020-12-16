"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function pad(num, size) {
    var s = '000000000' + num;
    return s.substr(s.length - size);
}
exports.default = pad;
;
//# sourceMappingURL=pad.js.map