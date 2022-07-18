"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fingerprint_1 = require("./fingerprint");
const performance_1 = require("./performance");
const ourEpoch = 1529539200000, // use own epoch instead of standard Unix? Allows cuids far into 2130 to be lexicographically sortable // new Date('2018-06-21').getTime()
dictionary = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', base = dictionary.length, // 62
counterBlockSize = 3, maxCounterNr = Math.pow(base, counterBlockSize), randomBlockSize = 6, maxRandomNr = Math.pow(base, randomBlockSize);
function randomBlock() {
    return encode(Math.floor(Math.random() * maxRandomNr)).padStart(randomBlockSize, '0');
}
let c = 0;
function safeCounter() {
    c = c < maxCounterNr ? c : 0;
    return c++; // this is not subliminal
}
function encode(nr) {
    if (nr === 0) {
        return dictionary[0];
    }
    const base = dictionary.length;
    let str = '';
    while (nr >= 1) {
        str = dictionary[nr % base] + str; //dictionary[(nr - (base * Math.floor(nr / base)))] + str;
        nr = Math.floor(nr / base);
    }
    return str;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function decode(str) {
    const base = dictionary.length, length = str.length;
    let nr = 0;
    for (let i = 0; i < length; i++) {
        const n = dictionary.indexOf(str[i]);
        nr += n * Math.pow(base, length - i - 1);
    }
    return nr;
}
/**
 * New cuid generator using high resolution timestamps with performance.timeOrigin and performance.now().
 * It also uses radix 62 (0-9, a-z, A-Z) alphabet: less characters needed for larger numbers
 * breakdown:
 * 'c' ttttttt nnnn ccc ffff rrrrrr
 * t = milliseconds (7 bytes)
 * n = nanoseconds (4 bytes)
 * c = counter (3 bytes)
 * f = fingerprint (4 bytes)
 * r = random (6 bytes)
 * @param timebias
 * @returns a high resolution cuid
 */
function cuid(timebias = 0) {
    // Starting with a lowercase letter makes
    // it HTML element ID friendly.
    const letter = 'c'; // hard-coded allows for sequential access
    const zero = dictionary[0];
    // timestamp
    // warning: this exposes the exact date and time that the cuid was created.
    // NOTES Ewout:
    // - added timebias
    // - at '2081/08/05 12:16:46.208', timestamp will become 1 character larger!
    const hires = performance_1.default.timeOrigin + performance_1.default.now() + timebias - ourEpoch, rational = Math.floor(hires), fraction = Math.round((hires - rational) * 1000000); // Use 6 decimals to get nanoseconds
    const timestamp = encode(rational).padStart(7, zero) + encode(fraction).padStart(4, zero);
    // Prevent same-machine collisions. Allows for 238328 IDs in the same nanosecond
    const counter = encode(safeCounter()).padStart(counterBlockSize, zero);
    // A few chars to generate distinct ids for different
    // clients (so different computers are far less
    // likely to generate the same id)
    const print = (0, fingerprint_1.default)();
    // Grab some more chars from Math.random()
    const random = randomBlock();
    return letter + timestamp + counter + print + random;
}
exports.default = cuid;
//# sourceMappingURL=hires.js.map