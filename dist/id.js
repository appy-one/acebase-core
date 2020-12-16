"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ID = void 0;
const cuid_1 = require("./cuid");
// const uuid62 = require('uuid62');
let timeBias = 0;
class ID {
    static set timeBias(bias) {
        if (typeof bias !== 'number') {
            return;
        }
        timeBias = bias;
    }
    static generate() {
        // Could also use https://www.npmjs.com/package/pushid for Firebase style 20 char id's
        return cuid_1.default(timeBias).slice(1); // Cuts off the always leading 'c'
        // return uuid62.v1();
    }
}
exports.ID = ID;
//# sourceMappingURL=id.js.map