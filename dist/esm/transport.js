import { PathReference } from './path-reference.js';
import { cloneObject } from './utils.js';
import { ascii85 } from './ascii85.js';
import { PathInfo } from './path-info.js';
import { PartialArray } from './partial-array.js';
/*
    There are now 2 different serialization methods for transporting values.

    v1:
    The original version (v1) created an object with "map" and "val" properties.
    The "map" property was made optional in v1.14.1 so they won't be present for values needing no serializing

    v2:
    The new version replaces serialized values inline by objects containing ".type" and ".val" properties.
    This serializing method was introduced by `export` and `import` methods because they use streaming and
    are unable to prepare type mappings up-front. This format is smaller in transmission (in many cases),
    and easier to read and process.

    original: { "date": (some date) }
    v1 serialized: { "map": { "date": "date" }, "val": { date: "2022-04-22T07:49:23Z" } }
    v2 serialized: { "date": { ".type": "date", ".val": "2022-04-22T07:49:23Z" } }

    original: (some date)
    v1 serialized: { "map": "date", "val": "2022-04-22T07:49:23Z" }
    v2 serialized: { ".type": "date", ".val": "2022-04-22T07:49:23Z" }
    comment: top level value that need serializing is wrapped in an object with ".type" and ".val". v1 is smaller in this case

    original: 'some string'
    v1 serialized: { "map": {}, "val": "some string" }
    v2 serialized: "some string"
    comment: primitive types such as strings don't need serializing and are returned as is in v2

    original: { "date": (some date), "text": "Some string" }
    v1 serialized: { "map": { "date": "date" }, "val": { date: "2022-04-22T07:49:23Z", "text": "Some string" } }
    v2 serialized: { "date": { ".type": "date", ".val": "2022-04-22T07:49:23Z" }, "text": "Some string" }
*/
/**
 * Original deserialization method using global `map` and `val` properties
 * @param data
 * @returns
 */
export const deserialize = (data) => {
    if (data.map === null || typeof data.map === 'undefined') {
        if (typeof data.val === 'undefined') {
            throw new Error('serialized value must have a val property');
        }
        return data.val;
    }
    const deserializeValue = (type, val) => {
        if (type === 'date') {
            // Date was serialized as a string (UTC)
            return new Date(val);
        }
        else if (type === 'binary') {
            // ascii85 encoded binary data
            return ascii85.decode(val);
        }
        else if (type === 'reference') {
            return new PathReference(val);
        }
        else if (type === 'regexp') {
            return new RegExp(val.pattern, val.flags);
        }
        else if (type === 'array') {
            return new PartialArray(val);
        }
        else if (type === 'bigint') {
            return BigInt(val);
        }
        return val;
    };
    if (typeof data.map === 'string') {
        // Single value
        return deserializeValue(data.map, data.val);
    }
    Object.keys(data.map).forEach(path => {
        const type = data.map[path];
        const keys = PathInfo.getPathKeys(path);
        let parent = data;
        let key = 'val';
        let val = data.val;
        keys.forEach(k => {
            key = k;
            parent = val;
            val = val[key]; // If an error occurs here, there's something wrong with the calling code...
        });
        parent[key] = deserializeValue(type, val);
    });
    return data.val;
};
/**
 * Function to detect the used serialization method with for the given object
 * @param data
 * @returns
 */
export const detectSerializeVersion = (data) => {
    if (typeof data !== 'object' || data === null) {
        // This can only be v2, which allows primitive types to bypass serializing
        return 2;
    }
    if ('map' in data && 'val' in data) {
        return 1;
    }
    else if ('val' in data) {
        // If it's v1, 'val' will be the only key in the object because serialize2 adds ".version": 2 to the object to prevent confusion.
        if (Object.keys(data).length > 1) {
            return 2;
        }
        return 1;
    }
    return 2;
};
/**
 * Original serialization method using global `map` and `val` properties
 * @param data
 * @returns
 */
export const serialize = (obj) => {
    // Recursively find dates and binary data
    if (obj === null || typeof obj !== 'object' || obj instanceof Date || obj instanceof ArrayBuffer || obj instanceof PathReference || obj instanceof RegExp) {
        // Single value
        const ser = serialize({ value: obj });
        return {
            map: ser.map?.value,
            val: ser.val.value,
        };
    }
    obj = cloneObject(obj); // Make sure we don't alter the original object
    const process = (obj, mappings, prefix) => {
        if (obj instanceof PartialArray) {
            mappings[prefix] = 'array';
        }
        Object.keys(obj).forEach(key => {
            const val = obj[key];
            const path = prefix.length === 0 ? key : `${prefix}/${key}`;
            if (typeof val === 'bigint') {
                obj[key] = val.toString();
                mappings[path] = 'bigint';
            }
            else if (val instanceof Date) {
                // serialize date to UTC string
                obj[key] = val.toISOString();
                mappings[path] = 'date';
            }
            else if (val instanceof ArrayBuffer) {
                // Serialize binary data with ascii85
                obj[key] = ascii85.encode(val); //ascii85.encode(Buffer.from(val)).toString();
                mappings[path] = 'binary';
            }
            else if (val instanceof PathReference) {
                obj[key] = val.path;
                mappings[path] = 'reference';
            }
            else if (val instanceof RegExp) {
                // Queries using the 'matches' filter with a regular expression can now also be used on remote db's
                obj[key] = { pattern: val.source, flags: val.flags };
                mappings[path] = 'regexp';
            }
            else if (typeof val === 'object' && val !== null) {
                process(val, mappings, path);
            }
        });
    };
    const mappings = {};
    process(obj, mappings, '');
    const serialized = { val: obj };
    if (Object.keys(mappings).length > 0) {
        serialized.map = mappings;
    }
    return serialized;
};
/**
 * New serialization method using inline `.type` and `.val` properties
 * @param obj
 * @returns
 */
export const serialize2 = (obj) => {
    // Recursively find data that needs serializing
    const getSerializedValue = (val) => {
        if (typeof val === 'bigint') {
            // serialize bigint to string
            return {
                '.type': 'bigint',
                '.val': val.toString(),
            };
        }
        else if (val instanceof Date) {
            // serialize date to UTC string
            return {
                '.type': 'date',
                '.val': val.toISOString(),
            };
        }
        else if (val instanceof ArrayBuffer) {
            // Serialize binary data with ascii85
            return {
                '.type': 'binary',
                '.val': ascii85.encode(val),
            };
        }
        else if (val instanceof PathReference) {
            return {
                '.type': 'reference',
                '.val': val.path,
            };
        }
        else if (val instanceof RegExp) {
            // Queries using the 'matches' filter with a regular expression can now also be used on remote db's
            return {
                '.type': 'regexp',
                '.val': `/${val.source}/${val.flags}`, // new: shorter
                // '.val': {
                //     pattern: val.source,
                //     flags: val.flags
                // }
            };
        }
        else if (typeof val === 'object' && val !== null) {
            if (val instanceof Array) {
                const copy = [];
                for (let i = 0; i < val.length; i++) {
                    copy[i] = getSerializedValue(val[i]);
                }
                return copy;
            }
            else {
                const copy = {}; //val instanceof Array ? [] : {} as SerializedValueV2;
                if (val instanceof PartialArray) {
                    // Mark the object as partial ("sparse") array
                    copy['.type'] = 'array';
                }
                for (const prop in val) {
                    copy[prop] = getSerializedValue(val[prop]);
                }
                return copy;
            }
        }
        else {
            // Primitive value. Don't serialize
            return val;
        }
    };
    const serialized = getSerializedValue(obj);
    if (serialized !== null && typeof serialized === 'object' && 'val' in serialized && Object.keys(serialized).length === 1) {
        // acebase-core v1.14.1 made the 'map' property optional.
        // This v2 serialized object might be confused with a v1 without mappings, because it only has a "val" property
        // To prevent this, mark the serialized object with version 2
        serialized['.version'] = 2;
    }
    return serialized;
};
/**
 * New deserialization method using inline `.type` and `.val` properties
 * @param obj
 * @returns
 */
export const deserialize2 = (data) => {
    if (typeof data !== 'object' || data === null) {
        // primitive value, not serialized
        return data;
    }
    if (typeof data['.type'] === 'undefined') {
        // No type given: this is a plain object or array
        if (data instanceof Array) {
            // Plain array, deserialize items into a copy
            const copy = [];
            const arr = data;
            for (let i = 0; i < arr.length; i++) {
                copy.push(deserialize2(arr[i]));
            }
            return copy;
        }
        else {
            // Plain object, deserialize properties into a copy
            const copy = {};
            const obj = data;
            for (const prop in obj) {
                copy[prop] = deserialize2(obj[prop]);
            }
            return copy;
        }
    }
    else if (typeof data['.type'] === 'string') {
        const dataType = data['.type'].toLowerCase();
        if (dataType === 'bigint') {
            const val = data['.val'];
            return BigInt(val);
        }
        else if (dataType === 'array') {
            // partial ("sparse") array, deserialize children into a copy
            const arr = data;
            const copy = {};
            for (const index in arr) {
                copy[index] = deserialize2(arr[index]);
            }
            delete copy['.type'];
            return new PartialArray(copy);
        }
        else if (dataType === 'date') {
            // Date was serialized as a string (UTC)
            const val = data['.val'];
            return new Date(val);
        }
        else if (dataType === 'binary') {
            // ascii85 encoded binary data
            const val = data['.val'];
            return ascii85.decode(val);
        }
        else if (dataType === 'reference') {
            const val = data['.val'];
            return new PathReference(val);
        }
        else if (dataType === 'regexp') {
            const val = data['.val'];
            if (typeof val === 'string') {
                // serialized as '/(pattern)/flags'
                const match = /^\/(.*)\/([a-z]+)$/.exec(val);
                return new RegExp(match[1], match[2]);
            }
            // serialized as object with pattern & flags properties
            return new RegExp(val.pattern, val.flags);
        }
    }
    throw new Error(`Unknown data type "${data['.type']}" in serialized value`);
};
//# sourceMappingURL=transport.js.map