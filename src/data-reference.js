const { DataSnapshot } = require('./data-snapshot');
const { EventStream, EventPublisher } = require('./subscription');
const { ID } = require('./id');
const debug = require('./debug');
const { PathInfo } = require('./path-info');

class DataRetrievalOptions {
    /**
     * Options for data retrieval, allows selective loading of object properties
     * @param {{ include?: Array<string|number>, exclude?: Array<string|number>, child_objects?: boolean, allow_cache?: boolean }} options 
     */
    constructor(options) {
        if (!options) {
            options = {};
        }
        if (typeof options.include !== 'undefined' && !(options.include instanceof Array)) {
            throw new TypeError(`options.include must be an array`);
        }
        if (typeof options.exclude !== 'undefined' && !(options.exclude instanceof Array)) {
            throw new TypeError(`options.exclude must be an array`);
        }
        if (typeof options.child_objects !== 'undefined' && typeof options.child_objects !== 'boolean') {
            throw new TypeError(`options.child_objects must be a boolean`);
        }
        if (typeof options.allow_cache !== 'undefined' && typeof options.allow_cache !== 'boolean') {
            throw new TypeError(`options.allow_cache must be a boolean`);
        }

        /**
         * @property {string[]} include - child keys to include (will exclude other keys), can include wildcards (eg "messages/*\/title")
         */
        this.include = options.include || undefined;
        /**
         * @property {string[]} exclude - child keys to exclude (will include other keys), can include wildcards (eg "messages/*\/replies")
         */
        this.exclude = options.exclude || undefined;
        /**
         * @property {boolean} child_objects - whether or not to include any child objects, default is true
         */
        this.child_objects = typeof options.child_objects === "boolean" ? options.child_objects : undefined;
        /**
         * @property {boolean} allow_cache - whether cached results are allowed to be used (supported by AceBaseClients using local cache), default is true
         */
        this.allow_cache = typeof options.allow_cache === "boolean" ? options.allow_cache : undefined;
    }
}

class QueryDataRetrievalOptions extends DataRetrievalOptions {
    /**
     * Options for data retrieval, allows selective loading of object properties
     * @param {QueryDataRetrievalOptions} [options]
     */
    constructor(options) {
        super(options);
        if (typeof options.snapshots !== 'undefined' && typeof options.snapshots !== 'boolean') {
            throw new TypeError(`options.snapshots must be an array`);
        }
        /**
         * @property {boolean} snapshots - whether to return snapshots of matched nodes (include data), or references only (no data). Default is true
         */
        this.snapshots = typeof options.snapshots === 'boolean' ? options.snapshots : undefined;
    }
}

const _private = Symbol("private");
class DataReference {
    /**
     * Creates a reference to a node
     * @param {AceBase} db
     * @param {string} path 
     */
    constructor (db, path, vars) {
        if (!path) { path = ""; }
        path = path.replace(/^\/|\/$/g, ""); // Trim slashes
        const pathInfo = PathInfo.get(path);
        const key = pathInfo.key; //path.length === 0 ? "" : path.substr(path.lastIndexOf("/") + 1); //path.match(/(?:^|\/)([a-z0-9_$]+)$/i)[1];
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
            get callbacks() { return callbacks; },
            vars: vars || {}
        };
        this.db = db; //Object.defineProperty(this, "db", ...)
    }

    /**
    * The path this instance was created with
    * @type {string}
    */
    get path() { return this[_private].path; }

    /**
     * The key or index of this node
     * @type {string|number}
     */
    get key() { return this[_private].key; }
    
    /**
     * Returns a new reference to this node's parent
     * @type {DataReference}
     */
    get parent() {
        let currentPath = PathInfo.fillVariables2(this.path, this.vars);
        const info = PathInfo.get(currentPath);
        if (info.parentPath === null) {
            return null;
        }
        return new DataReference(this.db, info.parentPath);
    }

    /**
     * Contains values of the variables/wildcards used in a subscription path if this reference was 
     * created by an event ("value", "child_added" etc)
     * @type {{ [index: number]: string|number, [variable: string]: string|number }}
     */
    get vars() {
        return this[_private].vars;
    }

    /**
     * Returns a new reference to a child node
     * @param {string|number} childPath Child key, index or path
     * @returns {DataReference} reference to the child
     */
    child(childPath) {
        childPath = typeof childPath === 'number' ? childPath : childPath.replace(/^\/|\/$/g, "");
        const currentPath = PathInfo.fillVariables2(this.path, this.vars);
        const targetPath = PathInfo.getChildPath(currentPath, childPath);
        return new DataReference(this.db, targetPath); //  `${this.path}/${childPath}`
    }
    
    /**
     * Sets or overwrites the stored value
     * @param {any} value value to store in database
     * @param {(err: Error, ref: DataReference) => void} [onComplete] completion callback to use instead of returning promise 
     * @returns {Promise<DataReference>} promise that resolves with this reference when completed (when not using onComplete callback)
     */
    set(value, onComplete = undefined) {
        if (this.isWildcardPath) {
            throw new Error(`Cannot set the value of a path with wildcards and/or variables`);
        }
        if (this.parent === null) {
            throw new Error(`Cannot set the root object. Use update, or set individual child properties`);
        }
        if (typeof value === 'undefined') {
            throw new TypeError(`Cannot store value undefined`);
        }
        value = this.db.types.serialize(this.path, value);
        return this.db.api.set(this.path, value)
        .then(res => {
            if (typeof onComplete === 'function') {
                try { onComplete(null, this);} catch(err) { console.error(`Error in onComplete callback:`, err); }
            }
        })
        .catch(err => {
            if (typeof onComplete === 'function') {
                try { onComplete(err); } catch(err) { console.error(`Error in onComplete callback:`, err); }
            }
            else {
                // throw again
                throw err;
            }
        })
        .then(() => {
            return this;
        });
    }

    /**
     * Updates properties of the referenced node
     * @param {object} updates object containing the properties to update
     * @param {(err: Error, ref: DataReference) => void} [onComplete] completion callback to use instead of returning promise 
     * @return {Promise<DataReference>} returns promise that resolves with this reference once completed (when not using onComplete callback)
     */
    update(updates, onComplete = undefined) {
        if (this.isWildcardPath) {
            throw new Error(`Cannot update the value of a path with wildcards and/or variables`);
        }
        let promise;
        if (typeof updates !== "object" || updates instanceof Array || updates instanceof ArrayBuffer || updates instanceof Date) {
            promise = this.set(updates);
        }
        else if (Object.keys(updates).length === 0) {
            console.warn(`update called on path "/${this.path}", but there is nothing to update`);
            return Promise.resolve();
        }
        else {            
            updates = this.db.types.serialize(this.path, updates);
            promise = this.db.api.update(this.path, updates);
        }
        return promise.then(() => {
            if (typeof onComplete === 'function') {
                try { onComplete(null, this); } catch(err) { console.error(`Error in onComplete callback:`, err); }
            }
        })
        .catch(err => {
            if (typeof onComplete === 'function') {
                try { onComplete(err); } catch(err) { console.error(`Error in onComplete callback:`, err); }
            }
            else {
                throw err;
            }
        })
        .then(() => {
            return this;
        })
    }

    /**
     * Sets the value a node using a transaction: it runs your callback function with the current value, uses its return value as the new value to store.
     * The transaction is canceled if your callback returns undefined, or throws an error. If your callback returns null, the target node will be removed.
     * @param {(currentValue: DataSnapshot) => any} callback - callback function that performs the transaction on the node's current value. It must return the new value to store (or promise with new value), undefined to cancel the transaction, or null to remove the node.
     * @returns {Promise<DataReference>} returns a promise that resolves with the DataReference once the transaction has been processed
     */
    transaction(callback) {
        if (this.isWildcardPath) {
            throw new Error(`Cannot start a transaction on a path with wildcards and/or variables`);
        }
        let throwError;
        let cb = (currentValue) => {
            currentValue = this.db.types.deserialize(this.path, currentValue);
            const snap = new DataSnapshot(this, currentValue);
            let newValue;
            try {
                newValue = callback(snap);
            }
            catch(err) {
                // callback code threw an error
                throwError = err; // Remember error
                return; // cancel transaction by returning undefined
            }
            if (newValue instanceof Promise) {
                return newValue
                .then((val) => {
                    return this.db.types.serialize(this.path, val);
                })
                .catch(err => {
                    throwError = err; // Remember error
                    return; // cancel transaction by returning undefined
                });
            }
            else {
                return this.db.types.serialize(this.path, newValue);
            }
        }
        return this.db.api.transaction(this.path, cb)
        .then(result => {
            if (throwError) {
                // Rethrow error from callback code
                throw throwError;
            }
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
    on(event, callback, cancelCallbackOrContext, context) {
        if (this.path === '' && ['value','notify_value','child_changed','notify_child_changed'].includes(event)) {
            console.warn(`WARNING: Listening for value and child_changed events on the root node is a bad practice`);
        }
        const cancelCallback = typeof cancelCallbackOrContext === 'function' && cancelCallbackOrContext;
        context = typeof cancelCallbackOrContext === 'object' ? cancelCallbackOrContext : context

        const useCallback = typeof callback === 'function';
        
        /** @type {EventPublisher} */
        let eventPublisher = null;
        const eventStream = new EventStream(publisher => { eventPublisher = publisher });

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
                ref[_private].vars = PathInfo.extractVariables(this.path, path);
                
                let callbackObject;
                if (event.startsWith('notify_')) {
                    // No data event, callback with reference
                    callbackObject = ref;
                }
                else {
                    const isRemoved = event === "child_removed";
                    const val = this.db.types.deserialize(path, isRemoved ? oldValue : newValue);
                    const snap = new DataSnapshot(ref, val, isRemoved);
                    callbackObject = snap;
                }

                try { useCallback && callback.call(context || null, callbackObject); }
                catch (err) { console.error(`ERROR firing "${event}" callback for path "${path}":`, err); }
                
                let keep = eventPublisher.publish(callbackObject);
                if (!keep && !useCallback) {
                    // If no callback was used, unsubscribe
                    let callbacks = this[_private].callbacks;
                    callbacks.splice(callbacks.indexOf(cb), 1);
                    this.db.api.unsubscribe(this.path, event, cb.ours);
                }
            }
        };
        this[_private].callbacks.push(cb);

        let authorized = this.db.api.subscribe(this.path, event, cb.ours);
        const allSubscriptionsStoppedCallback = () => {
            let callbacks = this[_private].callbacks;
            callbacks.splice(callbacks.indexOf(cb), 1);
            this.db.api.unsubscribe(this.path, event, cb.ours);
        };
        if (authorized instanceof Promise) {
            // Web API now returns a promise that resolves if the request is allowed
            // and rejects when access is denied by the set security rules
            authorized.then(() => {
                // Access granted
                eventPublisher.start(allSubscriptionsStoppedCallback);
            })
            .catch(err => {
                // Access denied?
                // Cancel subscription
                let callbacks = this[_private].callbacks;
                callbacks.splice(callbacks.indexOf(cb), 1);
                this.db.api.unsubscribe(this.path, event, cb.ours);

                // Call cancelCallbacks
                eventPublisher.cancel(err.message);
                cancelCallback && cancelCallback(err.message);
            });
        }
        else {
            // Local API, always authorized
            eventPublisher.start(allSubscriptionsStoppedCallback);
        }

        if (callback && !this.isWildcardPath) {
            // If callback param is supplied (either a callback function or true or something else truthy),
            // it will fire events for current values right now.
            // Otherwise, it expects the .subscribe methode to be used, which will then
            // only be called for future events
            if (event === "value") {
                this.get(snap => {
                    eventPublisher.publish(snap);
                    useCallback && callback(snap);
                });
            }
            else if (event === "child_added") {
                this.get(snap => {
                    const val = snap.val();
                    if (val === null || typeof val !== "object") { return; }
                    Object.keys(val).forEach(key => {
                        let childSnap = new DataSnapshot(this.child(key), val[key]);
                        eventPublisher.publish(childSnap);
                        useCallback && callback(childSnap);
                    });
                });
            }
            else if (event === "notify_child_added") {
                // Use the reflect API to get current children. 
                // NOTE: This does not work with AceBaseServer <= v0.9.7, only when signed in as admin
                const step = 100;
                let limit = step, skip = 0;
                const more = () => {
                    this.db.api.reflect(this.path, "children", { limit, skip })
                    .then(children => {
                        children.list.forEach(child => {
                            const childRef = this.child(child.key);
                            eventPublisher.publish(childRef);
                            useCallback && callback(childRef);
                        })
                        if (children.more) {
                            skip += step;
                            more();
                        }
                    });
                };
                more();
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
            cb.subscr.unsubscribe(callback);
        }
        else {
            callbacks.splice(0, callbacks.length).forEach(cb => {
                cb.subscr.unsubscribe();
            });
        }
        this.db.api.unsubscribe(this.path, event, callback);
        return this;
    }

    /**
     * Gets a snapshot of the stored value. Shorthand method for .once("value")
     * @param {DataRetrievalOptions|((snapshot:DataSnapshot) => void)} [optionsOrCallback] data retrieval options to include or exclude specific child keys, or callback
     * @param {(snapshot:DataSnapshot) => void} [callback] callback function to run with a snapshot of the data instead of returning a promise
     * @returns {Promise<DataSnapshot>|void} returns a promise that resolves with a snapshot of the data, or nothing if callback is used
     */
    get(optionsOrCallback = undefined, callback = undefined) {
        if (this.isWildcardPath) {
            throw new Error(`Cannot get the value of a path with wildcards and/or variables. Use .query() instead`);
        }

        callback = 
            typeof optionsOrCallback === 'function' 
            ? optionsOrCallback 
            : typeof callback === 'function'
                ? callback
                : undefined;

        const options = 
            typeof optionsOrCallback === 'object' 
            ? optionsOrCallback
            : new DataRetrievalOptions({ allow_cache: true });

        if (typeof options.allow_cache === 'undefined') {
            options.allow_cache = true;
        }

        const promise = this.db.api.get(this.path, options).then(value => {
            value = this.db.types.deserialize(this.path, value);
            const snapshot = new DataSnapshot(this, value);
            return snapshot;
        });

        if (callback) { 
            promise.then(callback);
            return; 
        }
        else {
            return promise;
        }
    }

    /**
     * Waits for an event to occur
     * @param {string} event - Name of the event, eg "value", "child_added", "child_changed", "child_removed"
     * @param {DataRetrievalOptions} options - data retrieval options, to include or exclude specific child keys
     * @returns {Promise<DataSnapshot>} - returns promise that resolves with a snapshot of the data
     */
    once(event, options) {
        if (event === "value" && !this.isWildcardPath) {
            // Shortcut, do not start listening for future events
            return this.get(options);
        }
        return new Promise((resolve, reject) => {
            const callback = (snap) => {
                this.off(event, snap); // unsubscribe directly
                resolve(snap);
            }
            this.on(event, callback);
        });
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
        if (this.isWildcardPath) {
            throw new Error(`Cannot push to a path with wildcards and/or variables`);
        }

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
        if (this.isWildcardPath) {
            throw new Error(`Cannot remove a path with wildcards and/or variables. Use query().remove instead`);
        }
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
        if (this.isWildcardPath) {
            throw new Error(`Cannot push to a path with wildcards and/or variables`);
        }
        return this.db.api.exists(this.path);
    }

    get isWildcardPath() {
        return this.path.indexOf('*') >= 0 || this.path.indexOf('$') >= 0;
    }

    query() {
        return new DataReferenceQuery(this);
    }

    reflect(type, args) {
        if (this.pathHasVariables) {
            throw new Error(`Cannot reflect on a path with wildcards and/or variables`);
        }
        return this.db.api.reflect(this.path, type, args);
    }

    export(stream, options = { format: 'json' }) {
        return this.db.api.export(this.path, stream, options);
    }
} 

class DataReferenceQuery {
    
    /**
     * Creates a query on a reference
     * @param {DataReference} ref 
     */
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
     * Applies a filter to the children of the refence being queried. 
     * If there is an index on the property key being queried, it will be used 
     * to speed up the query
     * @param {string|number} key | property to test value of
     * @param {string} op | operator to use
     * @param {any} compare | value to compare with
     * @returns {DataReferenceQuery}
     */                
    filter(key, op, compare) {
        if ((op === "in" || op === "!in") && (!(compare instanceof Array) || compare.length === 0)) {
            throw new Error(`${op} filter for ${key} must supply an Array compare argument containing at least 1 value`);
        }
        if ((op === "between" || op === "!between") && (!(compare instanceof Array) || compare.length !== 2)) {
            throw new Error(`${op} filter for ${key} must supply an Array compare argument containing 2 values`);
        }
        if ((op === "matches" || op === "!matches") && !(compare instanceof RegExp)) {
            throw new Error(`${op} filter for ${key} must supply a RegExp compare argument`);
        }
        // DISABLED 2019/10/23 because it is not fully implemented only works locally
        // if (op === "custom" && typeof compare !== "function") {
        //     throw `${op} filter for ${key} must supply a Function compare argument`;
        // }
        if ((op === "contains" || op === "!contains") && ((typeof compare === 'object' && !(compare instanceof Array) && !(compare instanceof Date)) || (compare instanceof Array && compare.length === 0))) {
            throw new Error(`${op} filter for ${key} must supply a simple value or (non-zero length) array compare argument`);
        }
        this[_private].filters.push({ key, op, compare });
        return this;
    }

    /**
     * @deprecated use .filter instead
     */
    where(key, op, compare) {
        return this.filter(key, op, compare)
    }

    /**
     * Limits the number of query results to n
     * @param {number} n 
     * @returns {DataReferenceQuery}
     */
    take(n) {
        this[_private].take = n;
        return this;
    }

    /**
     * Skips the first n query results
     * @param {number} n 
     * @returns {DataReferenceQuery}
     */
    skip(n) {
        this[_private].skip = n;
        return this;
    }

    /**
     * Sorts the query results
     * @param {string} key 
     * @param {boolean} [ascending=true]
     * @returns {DataReferenceQuery}
     */
    sort(key, ascending = true) {
        if (typeof key !== "string") {
            throw `key must be a string`;
        }
        this[_private].order.push({ key, ascending });
        return this;
    }

    /**
     * @deprecated use .sort instead
     */
    order(key, ascending = true) {
        return this.sort(key, ascending);
    }

    /**
     * Executes the query
     * @param {((snapshotsOrReferences:DataSnapshotsArray|DataReferencesArray) => void)|QueryDataRetrievalOptions} [optionsOrCallback] data retrieval options (to include or exclude specific child data, and whether to return snapshots (default) or references only), or callback
     * @param {(snapshotsOrReferences:DataSnapshotsArray|DataReferencesArray) => void} [callback] callback to use instead of returning a promise
     * @returns {Promise<DataSnapshotsArray>|Promise<DataReferencesArray>|void} returns an Promise that resolves with an array of DataReferences or DataSnapshots, or void if a callback is used instead
     */
    get(optionsOrCallback = undefined, callback = undefined) {
        callback = 
            typeof optionsOrCallback === 'function' 
            ? optionsOrCallback 
            : typeof callback === 'function'
                ? callback
                : undefined;

        const options = 
            typeof optionsOrCallback === 'object' 
            ? optionsOrCallback 
            : new QueryDataRetrievalOptions({ snapshots: true, allow_cache: true });

        if (typeof options.snapshots === 'undefined') {
            options.snapshots = true;
        }
        if (typeof options.allow_cache === 'undefined') {
            options.allow_cache = true;
        }
        options.eventHandler = ev => {
            if (!this._events || !this._events[ev.name]) { return false; }
            const listeners = this._events[ev.name];
            if (typeof listeners !== 'object' || listeners.length === 0) { return false; }
            if (['add','change','remove'].includes(ev.name)) {
                const ref = new DataReference(this.ref.db, ev.path);
                const eventData = { name: ev.name };
                if (options.snapshots && ev.name !== 'remove') {
                    const val = db.types.deserialize(ev.path, ev.value);
                    eventData.snapshot = new DataSnapshot(ref, val, false);
                }
                else {
                    eventData.ref = ref;
                }
                ev = eventData;
            }
            listeners.forEach(callback => { try { callback(ev); } catch(e) {} });
        };
        // Check if there are event listeners set for realtime changes
        options.monitor = { add: false, change: false, remove: false };
        if (this._events) {
            if (this._events['add'] && this._events['add'].length > 0) {
                options.monitor.add = true;
            }
            if (this._events['change'] && this._events['change'].length > 0) {
                options.monitor.change = true;
            }
            if (this._events['remove'] && this._events['remove'].length > 0) {
                options.monitor.remove = true;
            }
        }
        const db = this.ref.db;
        return db.api.query(this.ref.path, this[_private], options)
        .catch(err => {
            throw new Error(err);
        })
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
            if (options.snapshots) {
                return DataSnapshotsArray.from(results);
            }
            else {
                return DataReferencesArray.from(results);
            }
        })
        .then(results => {
            callback && callback(results);
            return results;
        });
    }

    /**
     * Executes the query and returns references. Short for .get({ snapshots: false })
     * @param {(references:DataReferencesArray) => void} [callback] callback to use instead of returning a promise
     * @returns {Promise<DataReferencesArray>|void} returns an Promise that resolves with an array of DataReferences, or void when using a callback
     */
    getRefs(callback = undefined) {
        return this.get({ snapshots: false }, callback);
    }

    /**
     * Executes the query, removes all matches from the database
     * @returns {Promise<void>|void} | returns an Promise that resolves once all matches have been removed, or void if a callback is used
     */
    remove(callback) {
        return this.get({ snapshots: false })
        .then(refs => {
            const promises = [];
            return Promise.all(refs.map(ref => ref.remove()))
            .then(() => {
                callback && callback();
            });
        });
    }

    /**
     * Subscribes to an event. Supported events are:
     *  "stats": receive information about query performance.
     *  "hints": receive query or index optimization hints
     *  "add", "change", "remove": receive real-time query result changes
     * @param {string} event - Name of the event to subscribe to
     * @param {(event: object) => void} callback - Callback function
     * @returns {DataReferenceQuery} returns reference to this query
     */
    on(event, callback) {
        if (!this._events) { this._events = {}; };
        if (!this._events[event]) { this._events[event] = []; }
        this._events[event].push(callback);
        return this;
    }

    /**
     * Unsubscribes from a previously added event(s)
     * @param {string} [event] Name of the event
     * @param {Function} [callback] callback function to remove
     * @returns {DataReferenceQuery} returns reference to this query
     */
    off(event, callback) {
        if (!this._events) { return this; }
        if (typeof event === 'undefined') {
            this._events = {};
            return this;
        }
        if (!this._events[event]) { return this; }
        if (typeof callback === 'undefined') {
            delete this._events[event];
            return this;
        }
        const index = !this._events[event].indexOf(callback);
        if (!~index) { return this; }
        this._events[event].splice(index, 1);
        return this;
    }
}

class DataSnapshotsArray extends Array {
    /**
     * 
     * @param {DataSnapshot[]} snaps 
     */
    static from(snaps) {
        const arr = new DataSnapshotsArray(snaps.length);
        snaps.forEach((snap, i) => arr[i] = snap);
        return arr;
    }
    getValues() {
        return this.map(snap => snap.val());
    }
}

class DataReferencesArray extends Array { 
    /**
     * 
     * @param {DataReference[]} refs 
     */
    static from(refs) {
        const arr = new DataReferencesArray(refs.length);
        refs.forEach((ref, i) => arr[i] = ref);
        return arr;
    }
    getPaths() {
        return this.map(ref => ref.path);
    }
}

module.exports = { 
    DataReference, 
    DataReferenceQuery,
    DataRetrievalOptions,
    QueryDataRetrievalOptions
};