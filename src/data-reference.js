const { DataSnapshot } = require('./data-snapshot');
const { EventStream } = require('./subscription');
const { ID } = require('./id');
const debug = require('./debug');
const { getPathKeys, getPathInfo } = require('./utils');

class DataRetrievalOptions {
    constructor(options) {
        /**
         * @property {string[]} include - child keys to include (will exclude other keys)
         */
        this.include = options.include || undefined;
        /**
         * @property {string[]} exclude - child keys to exclude (will include other keys)
         */
        this.exclude = options.exclude || undefined;
        /**
         * @property {boolean} child_objects - whether or not to include any child objects
         */
        this.child_objects = typeof options.child_objects === "boolean" ? options.child_objects : undefined;
    }
}

const _private = Symbol("private");
class DataReference {
    /**
     * Creates a reference to a node
     * @param {AceBase} db
     * @param {string} path 
     */
    constructor (db, path) {
        if (!path) { path = ""; }
        path = path.replace(/^\/|\/$/g, ""); // Trim slashes
        const key = path.length === 0 ? "" : path.substr(path.lastIndexOf("/") + 1); //path.match(/(?:^|\/)([a-z0-9_$]+)$/i)[1];
        // const query = { 
        //     filters: [],
        //     skip: 0,
        //     take: 0,
        //     order: []
        // };
        const callbacks = [];
        this[_private] = {
            get path() { return path; },
            get key() { return key; },
            //get query() { return query; },
            get callbacks() { return callbacks; }
        };
        this.db = db; //Object.defineProperty(this, "db", ...)
    }

    /**
    * Returns the path this instance was created with
    */
    get path() { return this[_private].path; }

    /**
     * Returns the key (property) name of this node
     */
    get key() { return this[_private].key; }
    
    /**
     * Returns a new reference to this node's parent
     */
    get parent() {
        const path = getPathInfo(this.path);
        if (path.parent === null) {
            return null;
        }
        return new DataReference(this.db, path.parent);
        // const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("["));
        // const parentPath = i < 0 ? "" : path.slice(0, i); //path.replace(/\/[a-z0-9_$]+$/, "");
        // // if (path.lastIndexOf("[") > i) {
        // //     parentPath = path.slice(0, path.lastIndexOf("["));
        // // }
        // if (path === parentPath) { return null; }
        // return new DataReference(this.db, parentPath);
    }

    /**
     * Returns a new reference to a child node
     * @param {string} childPath - Child path
     * @returns {DataReference} - reference to the child
     */
    child(childPath) {
        childPath = childPath.replace(/^\/|\/$/g, "");
        return new DataReference(this.db, `${this.path}/${childPath}`);
    }
    
    /**
     * Sets or overwrites the stored value
     * @param {any} value - value to store in database
     * @returns {Promise<DataReference>} - promise that resolves with this reference when completed
     */
    set(value, onComplete = undefined) {
        if (this.parent === null) {
            throw new Error(`Cannot set the root object. Use update, or set individual child properties`);
        }
        if (typeof value === 'undefined') {
            throw new TypeError(`Cannot store value undefined`);
        }
        value = this.db.types.serialize(this.path, value);
        let flags;
        // if (this.__pushed) {
        //     flags = { pushed: true };
        // }
        return this.db.api.set(this, value).then(res => { // , flags
            onComplete && onComplete(null, this);
            return this;
        });
    }

    /**
     * Updates properties of the referenced object
     * @param {object} updates - object containing the properties to update
     * @return {Promise<DataReference>} - Returns promise that resolves with this reference once completed
     */
    update(updates, onComplete = undefined) {
        const ret = () => {
            onComplete && onComplete(null, this);
            return this;
        };
        if (typeof updates !== "object" || updates instanceof Array || updates instanceof ArrayBuffer || updates instanceof Date) {
            return this.set(updates).then(ret);
        }
        updates = this.db.types.serialize(this.path, updates);
        return this.db.api.update(this, updates).then(ret);
    }

    /**
     * 
     * @param {function} callback - callback function(currentValue) => newValue: is called with the current value, should return a new value to store in the database
     */
    transaction(callback) {
        let cb = (currentValue) => {
            currentValue = this.db.types.deserialize(this.path, currentValue);
            const snap = new DataSnapshot(this, currentValue);
            const newValue = callback(snap);
            if (newValue instanceof Promise) {
                return newValue.then((val) => {
                    return this.db.types.serialize(this.path, val);
                });
            }
            else {
                return this.db.types.serialize(this.path, newValue);
            }
        }
        return this.db.api.transaction(this, cb)
        .then(result => {
            return this;
        });
    }

    /**
     * Subscribes to an event. Supported events are "value", "child_added", "child_changed", "child_removed", 
     * which will run the callback with a snapshot of the data. If you only wish to receive notifications of the 
     * event (without the data), use the "notify_value", "notify_child_added", "notify_child_changed", 
     * "notify_child_removed" events instead, which will run the callback with a DataReference to the changed 
     * data. This enables you to manually retreive data upon changes (eg if you want to exclude certain child 
     * data from loading)
     * @param {string} event - Name of the event to subscribe to
     * @param {((snapshotOrReference:DataSnapshot|DataReference) => void)|boolean} callback - Callback function(snapshot) or whether or not to run callbacks on current values when using "value" or "child_added" events
     * @returns {EventStream} returns an EventStream
     */
    on(event, callback) {
        // Does not support firebase's cancelCallbackOrContext and/or context yet,
        // because AceBase doesn't have user/security layer built in (yet)

        const useCallback = typeof callback === 'function';
        const eventStream = new EventStream();
        
        // Map OUR callback to original callback, so .off can remove the right callback
        let cb = { 
            subscr: eventStream,
            original: callback, 
            ours: (err, path, newValue, oldValue) => {
                if (err) {
                    debug.error(`Error getting data for event ${event} on path "${path}"`, err);
                    return;
                }
                let ref = this.db.ref(path);
                
                let callbackObject;
                if (event.startsWith('notify_')) {
                    // No data event, callback with reference
                    callbackObject = ref;
                }
                else {
                    let val = this.db.types.deserialize(path, event === "child_removed" ? oldValue : newValue);
                    let snap = new DataSnapshot(ref, val);
                    callbackObject = snap;
                }

                useCallback && callback(callbackObject);
                let keep = eventStream.publish(callbackObject);
                if (!keep && !useCallback) {
                    // If no callback was used, unsubscribe
                    let callbacks = this[_private].callbacks;
                    callbacks.splice(callbacks.indexOf(cb), 1);
                    this.db.api.unsubscribe(this, event, cb.ours);
                }
            }
        };
        this[_private].callbacks.push(cb);

        this.db.api.subscribe(this, event, cb.ours);

        if (callback) {
            // If callback param is supplied (either a callback function or true eg),
            // it will fire events for current values right now.
            // Otherwise, it expects the .subscribe methode to be used, which will then
            // only be called for future events
            if (event === "value") {
                this.get().then((snap) => {
                    eventStream.publish(snap);
                    useCallback && callback(snap);
                });
            }
            else if (event === "child_added") {
                this.get().then(snap => {
                    const val = snap.val();
                    if (typeof val !== "object") { return; }
                    Object.keys(val).forEach(key => {
                        let childSnap = new DataSnapshot(this.child(key), val[key]);
                        eventStream.publish(childSnap);
                        useCallback && callback(childSnap);
                    });
                });
            }
        }

        return eventStream;
    }

    /**
     * Unsubscribes from a previously added event
     * @param {string} event | Name of the event
     * @param {Function} callback | callback function to remove
     */
    off(event = undefined, callback = undefined) {
        const callbacks = this[_private].callbacks;
        if (callback) {
            const cb = callbacks.find(cb => cb.original === callback);
            if (!cb) {
                debug.error(`Can't find specified callback to unsubscribe from (path: "${this.path}", event: ${event}, callback: ${callback})`);
                return;
            }
            callbacks.splice(callbacks.indexOf(cb), 1);
            callback = cb.ours;
            cb.subscr.stop(callback);
        }
        else {
            callbacks.splice(0, callbacks.length).forEach(cb => {
                cb.subscr.stop();
            });
        }
        this.db.api.unsubscribe(this, event, callback);
        return this;
    }

    /**
     * Gets a snapshot of the stored value. Shorthand method for .once("value")
     * @param {((snapshot:DataSnapshot) => void)|DataRetrievalOptions} callbackOrOptions - (optional) callback or data retrieval options
     * @param {DataRetrievalOptions?} options - (optional) data retrieval options to include or exclude specific child keys.
     * @returns {Promise<DataSnapshot>} returns a promise that resolves with a snapshot of the data
     */
    get(callbackOrOptions = undefined, options = undefined) {
        const callback = 
            typeof callbackOrOptions === 'function' 
            ? callbackOrOptions 
            : undefined;

        options = 
            typeof callbackOrOptions === 'object' 
            ? callbackOrOptions 
            : typeof options === 'object'
                ? options
                : undefined;

        const promise = this.db.api.get(this, options).then(value => {
            value = this.db.types.deserialize(this.path, value);
            const snapshot = new DataSnapshot(this, value);
            callback && callback(snapshot);
            return snapshot;
        });

        return promise;
    }

    /**
     * Waits for an event to occur
     * @param {string} event - Name of the event, eg "value", "child_added", "child_changed", "child_removed"
     * @param {DataRetrievalOptions} options - data retrieval options, to include or exclude specific child keys
     * @returns {Promise<DataSnapshot>} - returns promise that resolves with a snapshot of the data
     */
    once(event, options) {

        switch(event) {
            case "value": {
                return this.get(options);
            }
            default: {
                return new Promise((resolve, reject) => {
                    const callback = (snap) => {
                        this.off(event, snap); // unsubscribe directly
                        resolve(snap);
                    }
                    this.on(event, callback);
                })
            }
        }
    }

    /**
     * Creates a new child with a unique key and returns the new reference. 
     * If a value is passed as an argument, it will be stored to the database directly. 
     * The returned reference can be used as a promise that resolves once the
     * given value is stored in the database
     * @param {any} value optional value to store into the database right away
     * @param {function} onComplete optional callback function to run once value has been stored
     * @returns {DataReference|Promise<DataReference>} returns a reference to the new child, or a promise that resolves with the reference after the passed value has been stored
     * @example 
     * // Create a new user in "game_users"
     * db.ref("game_users")
     * .push({ name: "Betty Boop", points: 0 })
     * .then(ref => {
     * //  ref is a new reference to the newly created object,
     * //  eg to: "game_users/7dpJMeLbhY0tluMyuUBK27"
     * });
     * @example
     * // Create a new child reference with a generated key, 
     * // but don't store it yet
     * let userRef = db.ref("users").push();
     * // ... to store it later:
     * userRef.set({ name: "Popeye the Sailor" })
     */
    push(value = undefined, onComplete = undefined) {
        const id = ID.generate(); //uuid62.v1({ node: [0x61, 0x63, 0x65, 0x62, 0x61, 0x73] });
        const ref = this.child(id);
        ref.__pushed = true;

        if (typeof value !== 'undefined') {
            return ref.set(value, onComplete).then(res => ref);
        }
        else {
            return ref;
        }
    }

    /**
     * Removes this node and all children
     */
    remove() {
        if (this.parent === null) {
            throw new Error(`Cannot remove the top node`);
        }
        return this.set(null);
    }

    /**
     * Quickly checks if this reference has a value in the database, without returning its data
     * @returns {Promise<boolean>} | returns a promise that resolves with a boolean value
     */
    exists() {
        return this.db.api.exists(this);
    }

    query() {
        return new DataReferenceQuery(this);
    }

    reflect(type, args) {
        return this.db.api.reflect(this.path, type, args);
    }
} 

class DataReferenceQuery {
    // const q = db.ref("chats").query(); // creates this class
    // q.where("title", "matches", /\Wdatabase\W/i)
    // q.get({ exclude: ["*/messages"] })
    // OR q.remove(); // To remove all matches

    constructor(ref) {
        this.ref = ref;
        this[_private] = {
            filters: [],
            skip: 0,
            take: 0,
            order: []
        };
    }

    /**
     * 
     * @param {string} key | property to test value of
     * @param {string} op | operator to use
     * @param {any} compare | value to compare with, or null/undefined to test property existance (in combination with operators eq or neq)
     */                
    where(key, op, compare) {
        if ((op === "in" || op === "!in") && (!(compare instanceof Array) || compare.length === 0)) {
            throw `${op} filter for ${key} must supply an Array compare argument containing at least 1 value`;
        }
        if ((op === "between" || op === "!between") && (!(compare instanceof Array) || compare.length !== 2)) {
            throw `${op} filter for ${key} must supply an Array compare argument containing 2 values`;
        }
        if ((op === "matches" || op === "!matches") && !(compare instanceof RegExp)) {
            throw `${op} filter for ${key} must supply a RegExp compare argument`;
        }
        if (op === "custom" && typeof compare !== "function") {
            throw `${op} filter for ${key} must supply a Function compare argument`;
        }
        this[_private].filters.push({ key, op, compare });
        return this;
    }

    take(nr) {
        this[_private].take = nr;
        return this;
    }

    skip(nr) {
        this[_private].skip = nr;
        return this;
    }

    order(key, ascending = true) {
        if (typeof key !== "string") {
            throw `key must be a string`;
        }
        this[_private].order.push({ key, ascending });
        return this;
    }

    /**
     * Executes the query
     * @param {DataRetrievalOptions} options | Configures how the query runs. snapshots: Whether to resolve with snapshots or references
     * @returns {Promise<DataReference[]>|Promise<DataSnapshot[]>} | returns an Promise that resolves with an array of DataReferences or DataSnapshots
     */
    get(options = { snapshots: true, include: undefined, exclude: undefined, child_objects: undefined }) {
        if (typeof options.snapshots == 'undefined') {
            options.snapshots = true;
        }
        const db = this.ref.db;
        return db.api.query(this.ref, this[_private], options)
        .then(results => {
            results.forEach((result, index) => {
                if (options.snapshots) {
                    const val = db.types.deserialize(result.path, result.val);
                    results[index] = new DataSnapshot(db.ref(result.path), val);
                }
                else {
                    results[index] = db.ref(result);
                }
            });
            return results;
        });
    }

    /**
     * Executes the query, removes all matches from the database
     * @returns {Promise} | returns an Promise that resolves once all matches have been removed
     */
    remove() {
        return this.get({ snapshots: false })
        .then(refs => {
            const promises = [];
            return Promise.all(refs.map(ref => ref.remove()));
        });
    }
}

module.exports = { DataReference, DataReferenceQuery };