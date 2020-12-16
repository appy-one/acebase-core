import cuid from './cuid';
// const uuid62 = require('uuid62');

let timeBias = 0;

export class ID {
    static set timeBias(bias) {
        if (typeof bias !== 'number') { return; }
        timeBias = bias;
    }
    static generate() {
        // Could also use https://www.npmjs.com/package/pushid for Firebase style 20 char id's

        return cuid(timeBias).slice(1); // Cuts off the always leading 'c'
        // return uuid62.v1();
    }
}