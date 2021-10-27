import { cloneObject } from './utils';
import { PathInfo } from './path-info';
import { DataReference } from './data-reference';
import { DataSnapshot } from './data-snapshot';
import type { AceBaseBase } from './acebase-base';

type CreatorFunction = string | ((snap: DataSnapshot) => any);
type SerializerFunction = string | ((ref: DataReference, typedObj: any) => any);
// type SerializableClassType = (obj: any) => object;
type SerializableClassType = {
    new(...args: any): any
    create?(snap: DataSnapshot): any
}
interface ITypeMapping {
    /** @deprecated refactor so it is not needed */
    db: AceBaseBase,
    type: SerializableClassType,
    creator: CreatorFunction,
    serializer: SerializerFunction,
    deserialize(snap: DataSnapshot): any,
    serialize(obj: any, ref: DataReference): any
}
interface ITypeMappings {
    [path: string]: ITypeMapping
}

/**
 * (for internal use) - gets the mapping set for a specific path
 */
function get(mappings:ITypeMappings, path: string): ITypeMapping {
    // path points to the mapped (object container) location
    path = path.replace(/^\/|\/$/g, ''); // trim slashes
    const keys = PathInfo.getPathKeys(path);
    const mappedPath = Object.keys(mappings).find(mpath => {
        const mkeys = PathInfo.getPathKeys(mpath);
        if (mkeys.length !== keys.length) {
            return false; // Can't be a match
        }
        return mkeys.every((mkey, index) => {
            if (mkey === '*' || mkey[0] === '$') {
                return true; // wildcard
            }
            return mkey === keys[index];
        });
    });
    const mapping = mappings[mappedPath];
    return mapping;
}

/**
 * (for internal use) - gets the mapping set for a specific path's parent
 */
function map(mappings: ITypeMappings, path: string): ITypeMapping {
    // path points to the object location, its parent should have the mapping
    const targetPath = PathInfo.get(path).parentPath;
    if (targetPath === null) { return; }
    return get(mappings, targetPath);
}

/**
 * (for internal use) - gets all mappings set for a specific path and all subnodes
 * @returns returns array of all matched mappings in path
 */
function mapDeep(mappings: ITypeMappings, entryPath: string): { path: string, type: ITypeMapping}[] {
    // returns mapping for this node, and all mappings for nested nodes
    // entryPath: "users/ewout"
    // mappingPath: "users"
    // mappingPath: "users/*/posts"
    entryPath = entryPath.replace(/^\/|\/$/g, ''); // trim slashes

    // Start with current path's parent node
    const pathInfo = PathInfo.get(entryPath);
    const startPath = pathInfo.parentPath;
    const keys = startPath ? PathInfo.getPathKeys(startPath) : [];

    // Every path that starts with startPath, is a match
    // TODO: refactor to return Object.keys(mappings),filter(...)
    const matches = Object.keys(mappings).reduce((m, mpath) => {

        //const mkeys = mpath.length > 0 ? mpath.split("/") : [];
        const mkeys = PathInfo.getPathKeys(mpath);
        if (mkeys.length < keys.length) {
            return m; // Can't be a match
        }
        let isMatch = true;
        if (keys.length === 0 && startPath !== null) {
            // Only match first node's children if mapping pattern is "*" or "$variable"
            isMatch = mkeys.length === 1 && (mkeys[0] === '*' || mkeys[0][0] === '$');
        }
        else {
            mkeys.every((mkey, index) => {
                if (index >= keys.length) { 
                    return false; // stop .every loop
                } 
                else if (mkey === '*' || mkey[0] === '$' || mkey === keys[index]) {
                    return true; // continue .every loop
                }
                else {
                    isMatch = false;
                    return false; // stop .every loop
                }
            });
        }

        if (isMatch) { 
            const mapping = mappings[mpath];
            m.push({ path: mpath, type: mapping }); 
        }

        return m;
    }, []);
    return matches;
}

/**
 * (for internal use) - serializes or deserializes an object using type mappings
 * @returns returns the (de)serialized value
 */
function process(db: AceBaseBase, mappings: ITypeMappings, path: string, obj: any, action: 'serialize'|'deserialize'): any {
    if (obj === null || typeof obj !== 'object') { 
        return obj; 
    }
    const keys = PathInfo.getPathKeys(path); // path.length > 0 ? path.split("/") : [];
    const m = mapDeep(mappings, path);
    const changes = [];
    m.sort((a,b) => PathInfo.getPathKeys(a.path).length > PathInfo.getPathKeys(b.path).length ? -1 : 1); // Deepest paths first
    m.forEach(mapping => {
        const mkeys = PathInfo.getPathKeys(mapping.path); //mapping.path.length > 0 ? mapping.path.split("/") : [];
        mkeys.push('*');
        const mTrailKeys = mkeys.slice(keys.length);
        if (mTrailKeys.length === 0) {
            const vars = PathInfo.extractVariables(mapping.path, path);
            const ref = new DataReference(db, path, vars);
            if (action === 'serialize') {
                // serialize this object
                obj = mapping.type.serialize(obj, ref);
            }
            else if (action === 'deserialize') {
                // deserialize this object
                const snap = new DataSnapshot(ref, obj);
                obj = mapping.type.deserialize(snap);
            }
            return;
        }

        // Find all nested objects at this trail path
        const process = (parentPath, parent, keys) => {
            if (obj === null || typeof obj !== 'object') { 
                return obj; 
            }
            const key = keys[0];
            let children = [];
            if (key === '*' || key[0] === '$') {
                // Include all children
                if (parent instanceof Array) {
                    children = parent.map((val, index) => ({ key: index, val }));
                }
                else {
                    children = Object.keys(parent).map(k => ({ key: k, val: parent[k] }));
                }
            }
            else {
                // Get the 1 child
                const child = parent[key];
                if (typeof child === 'object') {
                    children.push({ key, val: child });
                }
            }
            children.forEach(child => { 
                const childPath = PathInfo.getChildPath(parentPath, child.key);
                const vars = PathInfo.extractVariables(mapping.path, childPath);
                const ref = new DataReference(db, childPath, vars);

                if (keys.length === 1) {
                    // TODO: this alters the existing object, we must build our own copy!
                    if (action === 'serialize') {
                        // serialize this object
                        changes.push({ parent, key: child.key, original: parent[child.key] });
                        parent[child.key] = mapping.type.serialize(child.val, ref);
                    }
                    else if (action === 'deserialize') {
                        // deserialize this object
                        const snap = new DataSnapshot(ref, child.val);
                        parent[child.key] = mapping.type.deserialize(snap);
                    }
                }
                else {
                    // Dig deeper
                    process(childPath, child.val, keys.slice(1)); 
                }
            });
        };
        process(path, obj, mTrailKeys);
    });
    if (action === "serialize") {
        // Clone this serialized object so any types that remained
        // will become plain objects without functions, and we can restore
        // the original object's values if any mappings were processed.
        // This will also prevent circular references
        obj = cloneObject(obj);

        if (changes.length > 0) {
            // Restore the changes made to the original object
            changes.forEach(change => {
                change.parent[change.key] = change.original;
            });
        }
    }
    return obj;
}

export interface TypeMappingOptions {
    serializer?: SerializerFunction
    creator?: CreatorFunction
}

const _mappings = Symbol("mappings");
export class TypeMappings {
    /** @deprecated refactor so it is not needed */
    db: AceBaseBase

    private [_mappings]: ITypeMappings

    /**
     * 
     * @param {AceBaseBase} db 
     */
    constructor(db: AceBaseBase) {
        this.db = db;
        this[_mappings] = {};
    }

    get mappings() { return this[_mappings]; }
    map(path: string) {
        return map(this[_mappings], path);
    }

    /**
     * Maps objects that are stored in a specific path to a class, so they can automatically be 
     * serialized when stored to, and deserialized (instantiated) when loaded from the database.
     * @param path path to an object container, eg "users" or "users/*\/posts"
     * @param type class to bind all child objects of path to
     * @param options (optional) You can specify the functions to use to 
     * serialize and/or instantiate your class. If you do not specificy a creator (constructor) method, 
     * AceBase will call YourClass.create(obj, ref) method if it exists, or execute: new YourClass(obj, ref).
     * If you do not specifiy a serializer method, AceBase will call YourClass.prototype.serialize(ref) if it
     * exists, or tries storing your object's fields unaltered. NOTE: 'this' in your creator function will point 
     * to YourClass, and 'this' in your serializer function will point to the instance of YourClass.
     */
    bind(path: string, type:SerializableClassType, options:TypeMappingOptions = {}) {
        // Maps objects that are stored in a specific path to a constructor method,
        // so they are automatically deserialized
        if (typeof path !== "string") {
            throw new TypeError("path must be a string");
        }
        if (typeof type !== "function") {
            throw new TypeError("constructor must be a function");
        }

        if (typeof options.serializer === 'undefined') {
            // if (typeof type.prototype.serialize === 'function') {
            //     // Use .serialize instance method
            //     options.serializer = type.prototype.serialize;
            // }

            // Use object's serialize method upon serialization (if available)
        }
        else if (typeof options.serializer === 'string') {
            if (typeof type.prototype[options.serializer] === 'function') {
                options.serializer = type.prototype[options.serializer];
            }
            else {
                throw new TypeError(`${type.name}.prototype.${options.serializer} is not a function, cannot use it as serializer`)
            }
        }
        else if (typeof options.serializer !== 'function') {
            throw new TypeError(`serializer for class ${type.name} must be a function, or the name of a prototype method`);
        }

        if (typeof options.creator === 'undefined') {
            if (typeof type.create === 'function') {
                // Use static .create as creator method
                options.creator = type.create;
            }
        }
        else if (typeof options.creator === 'string') {
            if (typeof type[options.creator] === 'function') {
                options.creator = type[options.creator];
            }
            else {
                throw new TypeError(`${type.name}.${options.creator} is not a function, cannot use it as creator`)
            }
        }
        else if (typeof options.creator !== 'function') {
            throw new TypeError(`creator for class ${type.name} must be a function, or the name of a static method`);
        }

        path = path.replace(/^\/|\/$/g, ""); // trim slashes
        this[_mappings][path] = {
            db: this.db,
            type,
            creator: options.creator,
            serializer: options.serializer,
            deserialize(snap) {
                // run constructor method
                let obj;
                if (this.creator) {
                    obj = this.creator.call(this.type, snap)
                }
                else {
                    obj = new this.type(snap);
                }
                return obj;
            },
            serialize(obj, ref) {
                if (this.serializer) {
                    obj = this.serializer.call(obj, ref, obj);
                }
                else if (obj && typeof obj.serialize === 'function') {
                    obj = obj.serialize(ref, obj);
                }
                return obj;
            }
        };
    }

    /**
     * Serializes any child in given object that has a type mapping
     * @param {string} path | path to the object's location
     * @param {object} obj | object to serialize
     */
    serialize(path, obj) {
        return process(this.db, this[_mappings], path, obj, "serialize");
    }

    /**
     * Deserialzes any child in given object that has a type mapping
     * @param {string} path | path to the object's location
     * @param {object} obj | object to deserialize
     */
    deserialize(path, obj) {
        return process(this.db, this[_mappings], path, obj, "deserialize");
    }
}