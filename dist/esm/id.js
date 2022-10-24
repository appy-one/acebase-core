import cuid from './cuid/index.js';
// const uuid62 = require('uuid62');
let timeBias = 0;
export class ID {
    /**
     * (for internal use)
     * bias in milliseconds to adjust generated cuid timestamps with
     */
    static set timeBias(bias) {
        if (typeof bias !== 'number') {
            return;
        }
        timeBias = bias;
    }
    static generate() {
        // Could also use https://www.npmjs.com/package/pushid for Firebase style 20 char id's
        return cuid(timeBias).slice(1); // Cuts off the always leading 'c'
        // return uuid62.v1();
    }
}
//# sourceMappingURL=id.js.map