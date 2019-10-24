const { PathReference } = require('./path-reference');

function numberToBytes(number) {
    const bytes = new Uint8Array(8);
    const view = new DataView(bytes.buffer);
    view.setFloat64(0, number);
    return new Array(...bytes);
}

function bytesToNumber(bytes) {
    //if (bytes.length !== 8) { throw "passed value must contain 8 bytes"; }
    if (bytes.length < 8) {
        throw new TypeError("must be 8 bytes");
        // // Pad with zeroes
        // let padding = new Uint8Array(8 - bytes.length);
        // for(let i = 0; i < padding.length; i++) { padding[i] = 0; }
        // bytes = concatTypedArrays(bytes, padding);
    }
    const bin = new Uint8Array(bytes);
    const view = new DataView(bin.buffer);
    const nr = view.getFloat64(0);
    return nr;
}

function concatTypedArrays(a, b) {
    const c = new a.constructor(a.length + b.length);
    c.set(a);
    c.set(b, a.length);
    return c;
};

function cloneObject(original, stack) {
    const { DataSnapshot } = require('./data-snapshot'); // Don't move to top, because data-snapshot requires this script (utils)
    if (original instanceof DataSnapshot) {
        throw new TypeError(`Object to clone is a DataSnapshot (path "${original.ref.path}")`);
    }
    
    const checkAndFixTypedArray = obj => {
        if (obj !== null && typeof obj === 'object' && ['Buffer','Uint8Array','Int8Array','Uint16Array','Int16Array','Uint32Array','Int32Array','BigUint64Array','BigInt64Array'].includes(obj.constructor.name)) {
            // FIX for typed array being converted to objects with numeric properties:
            // Convert Buffer or TypedArray to ArrayBuffer
            obj = obj.buffer.slice(obj.byteOffset, obj.byteOffset + obj.byteLength);
        }    
        return obj;
    };
    original = checkAndFixTypedArray(original);

    if (typeof original !== "object" || original === null || original instanceof Date || original instanceof ArrayBuffer || original instanceof PathReference) {
        return original;
    }

    const cloneValue = (val) => {
        // if (["string","number","boolean","function","undefined"].indexOf(typeof val) >= 0) {
        //     return val;
        // }
        if (stack.indexOf(val) >= 0) {
            throw new ReferenceError(`object contains a circular reference`);
        }
        val = checkAndFixTypedArray(val);
        if (val === null || val instanceof Date || val instanceof ArrayBuffer || val instanceof PathReference) { // || val instanceof ID
            return val;
        }
        else if (val instanceof Array) {
            stack.push(val);
            val = val.map(item => cloneValue(item));
            stack.pop();
            return val;
        }
        else if (typeof val === "object") {
            stack.push(val);
            val = cloneObject(val, stack);
            stack.pop();
            return val;
        }
        else {
            return val; // Anything other can just be copied
        }
    }
    if (typeof stack === "undefined") { stack = [original]; }
    const clone = {};
    Object.keys(original).forEach(key => {
        let val = original[key];
        if (typeof val === "function") {
            return; // skip functions
        }
        clone[key] = cloneValue(val);
    });
    return clone;
}

function compareValues (oldVal, newVal) {
    const voids = [undefined, null];
    if (oldVal === newVal) { return "identical"; }
    else if (voids.indexOf(oldVal) >= 0 && voids.indexOf(newVal) < 0) { return "added"; }
    else if (voids.indexOf(oldVal) < 0 && voids.indexOf(newVal) >= 0) { return "removed"; }
    else if (typeof oldVal !== typeof newVal) { return "changed"; }
    else if (typeof oldVal === "object") { 
        // Do key-by-key comparison of objects
        const isArray = oldVal instanceof Array;
        const oldKeys = isArray 
            ? Object.keys(oldVal).map(v => parseInt(v)) //new Array(oldVal.length).map((v,i) => i) 
            : Object.keys(oldVal);
        const newKeys = isArray 
            ? Object.keys(newVal).map(v => parseInt(v)) //new Array(newVal.length).map((v,i) => i) 
            : Object.keys(newVal);
        const removedKeys = oldKeys.filter(key => newKeys.indexOf(key) < 0);
        const addedKeys = newKeys.filter(key => oldKeys.indexOf(key) < 0);
        const changedKeys = newKeys.reduce((changed, key) => { 
            if (oldKeys.indexOf(key) >= 0) {
                const val1 = oldVal[key];
                const val2 = newVal[key];
                const c = compareValues(val1, val2);
                if (c !== "identical") {
                    changed.push({ key, change: c });
                }
            } 
            return changed;
        }, []);

        if (addedKeys.length === 0 && removedKeys.length === 0 && changedKeys.length === 0) {
            return "identical";
        }
        else {
            return {
                added: addedKeys,
                removed: removedKeys,
                changed: changedKeys
            }; 
        }
    }
    else if (oldVal !== newVal) { return "changed"; }
    return "identical";
}

const getChildValues = (childKey, oldValue, newValue) => {
    oldValue = oldValue === null ? null : oldValue[childKey];
    if (typeof oldValue === 'undefined') { oldValue = null; }
    newValue = newValue === null ? null : newValue[childKey];
    if (typeof newValue === 'undefined') { newValue = null; }
    return { oldValue, newValue };
};

module.exports = {
    numberToBytes,
    bytesToNumber,
    concatTypedArrays,
    cloneObject,
    // getPathKeys,
    // getPathInfo,
    // getChildPath,
    compareValues,
    getChildValues
};
