const cuid = require('cuid');
// const uuid62 = require('uuid62');

class ID {
    static generate() {
        // Could also use https://www.npmjs.com/package/pushid for Firebase style 20 char id's
        return cuid().slice(1); // Cuts off the always leading 'c'
        // return uuid62.v1();
    }
}

module.exports = { ID };