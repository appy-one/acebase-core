"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObjectCollection = void 0;
const id_1 = require("./id");
class ObjectCollection {
    static from(array) {
        const collection = {};
        array.forEach(child => {
            collection[id_1.ID.generate()] = child;
        });
        return collection;
    }
}
exports.ObjectCollection = ObjectCollection;
//# sourceMappingURL=object-collection.js.map