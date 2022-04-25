"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PartialArray = void 0;
/**
 * Sparse/partial array converted to a serializable object. Use `Object.keys(sparseArray)` and `Object.values(sparseArray)` to iterate its indice and/or values
 */
class PartialArray {
    constructor(sparseArray) {
        if (sparseArray instanceof Array) {
            for (let i = 0; i < sparseArray.length; i++) {
                if (typeof sparseArray[i] !== 'undefined') {
                    this[i] = sparseArray[i];
                }
            }
        }
        else if (sparseArray) {
            Object.assign(this, sparseArray);
        }
    }
}
exports.PartialArray = PartialArray;
//# sourceMappingURL=partial-array.js.map