"use strict";
/**
 * cuid.js
 * Collision-resistant UID generator for browsers and node.
 * Sequential for fast db lookups and recency sorting.
 * Safe for element IDs and server-side lookups.
 *
 * Extracted from CLCTR
 *
 * Copyright (c) Eric Elliott 2012
 * MIT License
 *
 * time biasing added by Ewout Stortenbeker for AceBase
 */
Object.defineProperty(exports, "__esModule", { value: true });
const fingerprint_1 = require("./fingerprint");
const pad_1 = require("./pad");
var c = 0, blockSize = 4, base = 36, discreteValues = Math.pow(base, blockSize);
function randomBlock() {
    return pad_1.default((Math.random() *
        discreteValues << 0)
        .toString(base), blockSize);
}
function safeCounter() {
    c = c < discreteValues ? c : 0;
    c++; // this is not subliminal
    return c - 1;
}
function cuid(timebias = 0) {
    // Starting with a lowercase letter makes
    // it HTML element ID friendly.
    var letter = 'c', // hard-coded allows for sequential access
    // timestamp
    // warning: this exposes the exact date and time
    // that the uid was created.
    // NOTES Ewout: 
    // - added timebias
    // - at '2059/05/25 19:38:27.456', timestamp will become 1 character larger!
    timestamp = (new Date().getTime() + timebias).toString(base), 
    // Prevent same-machine collisions.
    counter = pad_1.default(safeCounter().toString(base), blockSize), 
    // A few chars to generate distinct ids for different
    // clients (so different computers are far less
    // likely to generate the same id)
    print = fingerprint_1.default(), 
    // Grab some more chars from Math.random()
    random = randomBlock() + randomBlock();
    return letter + timestamp + counter + print + random;
}
exports.default = cuid;
// Not using slugs, removed code
//# sourceMappingURL=index.js.map