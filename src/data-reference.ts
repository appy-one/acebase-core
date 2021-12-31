import { DataSnapshot, MutationsDataSnapshot } from './data-snapshot';
import { EventStream, EventPublisher } from './subscription';
import { ID } from './id';
import { PathInfo } from './path-info';
import { LiveDataProxy } from './data-proxy';
import { getObservable } from './optional-observable';
import type { AceBaseBase } from './acebase-base';
import { IApiQueryOptions, StreamReadFunction, StreamWriteFunction, ValueMutation, ValueChange } from './api';

export class DataRetrievalOptions {
    /**
     * child keys to include (will exclude other keys), can include wildcards (eg "messages/*\/title")
     */
    include?: Array<string|number>;
    /**
     * child keys to exclude (will include other keys), can include wildcards (eg "messages/*\/replies")
     */
    exclude?: Array<string|number>;
    /**
     * whether or not to include any child objects, default is true
     */
    child_objects?: boolean;
    /**
     * If a cached value is allowed to be served. A cached value will be used if the client is offline, if cache priority setting is true, or if the cached value is available and the server value takes too long to load (>1s). If the requested value is not filtered, the cache will be updated with the received server value, triggering any event listeners set on the path. Default is `true`.  
     * @deprecated Use `cache_mode: "allow"` instead
     */
    allow_cache?: boolean
    /** 
     * Use a cursor to update the local cache with mutations from the server, then load and serve the entire 
     * value from cache. Only works in combination with `cache_mode: "allow"`
     * 
     * Requires an AceBaseClient with cache db
     */
    cache_cursor?: string
    /** 
     * Determines if the value is allowed to be loaded from cache:
     * - `"allow"`: (default) a cached value will be used if the client is offline, if cache `priority` setting is `"cache"`, or if the cached value is available and the server value takes too long to load (>1s). If the requested value is not filtered, the cache will be updated with the received server value, triggering any event listeners set on the path.
     * - `"bypass"`: Value will be loaded from the server. If the requested value is not filtered, the cache will be updated with the received server value, triggering any event listeners set on the path
     * - `"force"`: Forces the value to be loaded from cache only
     * 
     * A returned snapshot's context will reflect where the data was loaded from: `snap.context().acebase_origin` will be set to `"cache"`, `"server"`, or `"hybrid"` if a `cache_cursor` was used.
     * 
     * Requires an AceBaseClient with cache db */
    cache_mode?: 'allow'|'bypass'|'force'
 
    /**
     * Options for data retrieval, allows selective loading of object properties
     */
    constructor(options: DataRetrievalOptions) {
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
        if (typeof options.cache_mode === 'string' && !['allow','bypass','force'].includes(options.cache_mode)) {
            throw new TypeError(`invalid value for options.cache_mode`);
        }
        this.include = options.include || undefined;
        this.exclude = options.exclude || undefined;
        this.child_objects = typeof options.child_objects === 'boolean' ? options.child_objects : undefined;
        this.cache_mode = typeof options.cache_mode === 'string'
            ? options.cache_mode
            : typeof options.allow_cache === 'boolean'
                ? options.allow_cache ? 'allow' : 'bypass'
                : 'allow';
    }
}

export class QueryDataRetrievalOptions extends DataRetrievalOptions {
    /**
     * Whether to return snapshots of matched nodes (include data), or references only (no data). Default is true
     */
    snapshots?: boolean;

    /**
     * @param options Options for data retrieval, allows selective loading of object properties
     */
    constructor(options: QueryDataRetrievalOptions) {
        super(options);
        if (!['undefined', 'boolean'].includes(typeof options.snapshots)) {
            throw new TypeError(`options.snapshots must be a boolean`);
        }
        this.snapshots = typeof options.snapshots === 'boolean' ? options.snapshots : true;
    }
}

type PathVariables = { [index: number]: string|number, [variable: string]: string|number };

type EventCallback = ((snapshotOrReference:DataSnapshot|DataReference) => void);
// type SubscriptioncallbackArgument = ((snapshotOrReference:DataSnapshot|DataReference) => void)|boolean;
interface IEventSubscription {
    event: string,
    stream: EventStream,
    userCallback: EventCallback,
    ourCallback(err: Error, path: string, newValue: any, oldValue: any, eventContext: any): void
}

interface EventSettings { 
    newOnly?: boolean, 
    syncFallback?: 'reload'|(() => any|Promise<any>)
}
const _private = Symbol("private");
export class DataReference {
    readonly db: AceBaseBase;
    private [_private]: {
        readonly path: string,
        readonly key: string|number,
        readonly callbacks: IEventSubscription[],
        vars: PathVariables,
        context: any,
        pushed: boolean // If DataReference was created by .push 
    }

    /**
     * Creates a reference to a node
     */
    constructor (db: AceBaseBase, path: string, vars?: PathVariables) {
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
            vars: vars || {},
            context: {},
            pushed: false
        };
        this.db = db; //Object.defineProperty(this, "db", ...)
    }

    /**
     * Adds contextual info for database updates through this reference. 
     * This allows you to identify the event source (and/or reason) of 
     * data change events being triggered. You can use this for example 
     * to track if data updates were performed by the local client, a 
     * remote client, or the server. And, why it was changed, and by whom.
     * @param context Context to set for this reference.
     * @param merge whether to merge given context object with the previously set context. Default is false
     * @returns returns this instance, or the previously set context when calling context()
     */
    context(context:any, merge?:boolean): DataReference
    /**
     * Gets a previously set context on this reference. If the reference is returned
     * by a data event callback, it contains the context used in the reference used 
     * for updating the data 
     * @returns returns the previously set context
     */
    context(): any
    context(context:any = undefined, merge:boolean = false): DataReference|any {
        const currentContext = this[_private].context;
        if (typeof context === 'object') {
            const newContext = context ? merge ? currentContext || {} : context : {};
            if (context) { 
                // Merge new with current context
                Object.keys(context).forEach(key => {
                    newContext[key] = context[key];
                });
            }
            this[_private].context = newContext;
            return this;
        }
        else if (typeof context === 'undefined') {
            console.warn(`Use snap.context() instead of snap.ref.context() to get updating context in event callbacks`);
            return currentContext;
        }
        else {
            throw new Error('Invalid context argument');
        }
    }

    /**
    * The path this instance was created with
    */
    get path(): string { return this[_private].path; }

    /**
     * The key or index of this node
     */
    get key(): string|number { return this[_private].key; }
    
    /**
     * Returns a new reference to this node's parent
     */
    get parent(): DataReference {
        let currentPath = PathInfo.fillVariables2(this.path, this.vars);
        const info = PathInfo.get(currentPath);
        if (info.parentPath === null) {
            return null;
        }
        return new DataReference(this.db, info.parentPath).context(this[_private].context);
    }

    /**
     * Contains values of the variables/wildcards used in a subscription path if this reference was 
     * created by an event ("value", "child_added" etc)
     */
    get vars(): PathVariables {
        return this[_private].vars;
    }

    /**
     * Returns a new reference to a child node
     * @param childPath Child key, index or path
     * @returns reference to the child
     */
    child(childPath: string|number): DataReference {
        childPath = typeof childPath === 'number' ? childPath : childPath.replace(/^\/|\/$/g, "");
        const currentPath = PathInfo.fillVariables2(this.path, this.vars);
        const targetPath = PathInfo.getChildPath(currentPath, childPath);
        return new DataReference(this.db, targetPath).context(this[_private].context); //  `${this.path}/${childPath}`
    }
    
    /**
     * Sets or overwrites the stored value
     * @param value value to store in database
     * @param onComplete completion callback to use instead of returning promise 
     * @returns promise that resolves with this reference when completed (when not using onComplete callback)
     */
    async set(value: any, onComplete?: (err: Error, ref: DataReference) => void): Promise<DataReference> {
        try {
            if (this.isWildcardPath) {
               throw new Error(`Cannot set the value of wildcard path "/${this.path}"`);
            }
            if (this.parent === null) {
                throw new Error(`Cannot set the root object. Use update, or set individual child properties`);
            }
            if (typeof value === 'undefined') {
               throw new TypeError(`Cannot store undefined value in "/${this.path}"`);
            }
            if (!this.db.isReady) {
                await this.db.ready();
            }
            value = this.db.types.serialize(this.path, value);
            await this.db.api.set(this.path, value, { context: this[_private].context });
            if (typeof onComplete === 'function') {
                try { onComplete(null, this);} catch(err) { console.error(`Error in onComplete callback:`, err); }
            }
        }
        catch (err) {
            if (typeof onComplete === 'function') {
                try { onComplete(err, this); } catch(err) { console.error(`Error in onComplete callback:`, err); }
            }
            else {
                // throw again
                throw err;
            }
        }
        return this;
    }

    /**
     * Updates properties of the referenced node
     * @param updates object containing the properties to update
     * @param onComplete completion callback to use instead of returning promise 
     * @return returns promise that resolves with this reference once completed (when not using onComplete callback)
     */
    async update(updates: object, onComplete?:(err: Error, ref: DataReference) => void): Promise<DataReference> {
        try {
            if (this.isWildcardPath) {
                throw new Error(`Cannot update the value of wildcard path "/${this.path}"`);
            }
            if (!this.db.isReady) {
                await this.db.ready();
            }
            if (typeof updates !== "object" || updates instanceof Array || updates instanceof ArrayBuffer || updates instanceof Date) {
                await this.set(updates);
            }
            else if (Object.keys(updates).length === 0) {
                console.warn(`update called on path "/${this.path}", but there is nothing to update`);
            }
            else {            
                updates = this.db.types.serialize(this.path, updates);
                await this.db.api.update(this.path, updates, { context: this[_private].context });
            }
            if (typeof onComplete === 'function') {
                try { onComplete(null, this); } catch(err) { console.error(`Error in onComplete callback:`, err); }
            }
        }
        catch(err) {
            if (typeof onComplete === 'function') {
                try { onComplete(err, this); } catch(err) { console.error(`Error in onComplete callback:`, err); }
            }
            else {
                // throw again
                throw err;
            }
        }
        return this;
    }

    /**
     * Sets the value a node using a transaction: it runs your callback function with the current value, uses its return value as the new value to store.
     * The transaction is canceled if your callback returns undefined, or throws an error. If your callback returns null, the target node will be removed.
     * @param callback - callback function that performs the transaction on the node's current value. It must return the new value to store (or promise with new value), undefined to cancel the transaction, or null to remove the node.
     * @returns returns a promise that resolves with the DataReference once the transaction has been processed
     */
    async transaction(callback: (currentValue: DataSnapshot) => any): Promise<DataReference> {
        if (this.isWildcardPath) {
            throw new Error(`Cannot start a transaction on wildcard path "/${this.path}"`);
        }
        if (!this.db.isReady) {
            await this.db.ready();
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
        const result = await this.db.api.transaction(this.path, cb, { context: this[_private].context });
        if (throwError) {
            // Rethrow error from callback code
            throw throwError;
        }
        return this;
    }

    /**
     * Subscribes to an event. Supported events are "value", "child_added", "child_changed", "child_removed", 
     * which will run the callback with a snapshot of the data. If you only wish to receive notifications of the 
     * event (without the data), use the "notify_value", "notify_child_added", "notify_child_changed", 
     * "notify_child_removed" events instead, which will run the callback with a DataReference to the changed 
     * data. This enables you to manually retrieve data upon changes (eg if you want to exclude certain child 
     * data from loading)
     * @param event Name of the event to subscribe to
     * @param callback Callback function, event settings, or whether or not to run callbacks on current values when using "value" or "child_added" events
     * @param cancelCallback Function to call when the subscription is not allowed, or denied access later on
     * @returns returns an EventStream
     */
    on(event: string, callback?: EventCallback|boolean|EventSettings, cancelCallback?: (error: string) => void): EventStream {
        if (this.path === '' && ['value', 'child_changed'].includes(event)) {
            // Removed 'notify_value' and 'notify_child_changed' events from the list, they do not require additional data loading anymore.
            console.warn(`WARNING: Listening for value and child_changed events on the root node is a bad practice. These events require loading of all data (value event), or potentially lots of data (child_changed event) each time they are fired`);
        }

        let eventPublisher:EventPublisher = null;
        const eventStream = new EventStream(publisher => { eventPublisher = publisher });

        // Map OUR callback to original callback, so .off can remove the right callback(s)
        const cb:IEventSubscription = { 
            event,
            stream: eventStream,
            userCallback: typeof callback === 'function' && callback, 
            ourCallback: (err, path, newValue, oldValue, eventContext) => {
                if (err) {
                    // TODO: Investigate if this ever happens?
                    this.db.debug.error(`Error getting data for event ${event} on path "${path}"`, err);
                    return;
                }
                let ref = this.db.ref(path);
                ref[_private].vars = PathInfo.extractVariables(this.path, path);
                
                let callbackObject;
                if (event.startsWith('notify_')) {
                    // No data event, callback with reference
                    callbackObject = ref.context(eventContext || {});
                }
                else {
                    const values = { 
                        previous: this.db.types.deserialize(path, oldValue),
                        current: this.db.types.deserialize(path, newValue)
                    };
                    if (event === 'child_removed') {
                        callbackObject = new DataSnapshot(ref, values.previous, true, values.previous, eventContext);
                    }
                    else if (event === 'mutations') {
                        callbackObject = new MutationsDataSnapshot(ref, values.current, eventContext);
                    }
                    else {
                        const isRemoved = event === 'mutated' && values.current === null;
                        callbackObject = new DataSnapshot(ref, values.current, isRemoved, values.previous, eventContext);
                    }
                }
                eventPublisher.publish(callbackObject);
            }
        };
        this[_private].callbacks.push(cb);

        const subscribe = () => {

            // (NEW) Add callback to event stream 
            // ref.on('value', callback) is now exactly the same as ref.on('value').subscribe(callback)
            if (typeof callback === 'function') {
                eventStream.subscribe(callback, (activated, cancelReason) => {
                    if (!activated) { cancelCallback && cancelCallback(cancelReason); }
                });
            }
    
            const advancedOptions:EventSettings = typeof callback === 'object' 
                ? callback 
                : { newOnly: !callback }; // newOnly: if callback is not 'truthy', could change this to (typeof callback !== 'function' && callback !== true) but that would break client code that uses a truthy argument.
            if (typeof advancedOptions.newOnly !== 'boolean') { 
                advancedOptions.newOnly = false; 
            }
            if (this.isWildcardPath) {
                advancedOptions.newOnly = true;
            }
            const cancelSubscription = (err) => {
                // Access denied?
                // Cancel subscription
                let callbacks = this[_private].callbacks;
                callbacks.splice(callbacks.indexOf(cb), 1);
                this.db.api.unsubscribe(this.path, event, cb.ourCallback);

                // Call cancelCallbacks
                eventPublisher.cancel(err.message);
            }
            let authorized = this.db.api.subscribe(this.path, event, cb.ourCallback, { newOnly: advancedOptions.newOnly, cancelCallback: cancelSubscription, syncFallback: advancedOptions.syncFallback });
            const allSubscriptionsStoppedCallback = () => {
                let callbacks = this[_private].callbacks;
                callbacks.splice(callbacks.indexOf(cb), 1);
                return this.db.api.unsubscribe(this.path, event, cb.ourCallback);
            };
            if (authorized instanceof Promise) {
                // Web API now returns a promise that resolves if the request is allowed
                // and rejects when access is denied by the set security rules
                authorized.then(() => {
                    // Access granted
                    eventPublisher.start(allSubscriptionsStoppedCallback);
                })
                .catch(cancelSubscription);
            }
            else {
                // Local API, always authorized
                eventPublisher.start(allSubscriptionsStoppedCallback);
            }

            if (!advancedOptions.newOnly) {
                // If callback param is supplied (either a callback function or true or something else truthy),
                // it will fire events for current values right now.
                // Otherwise, it expects the .subscribe methode to be used, which will then
                // only be called for future events
                if (event === "value") {
                    this.get(snap => {
                        eventPublisher.publish(snap);
                        // typeof callback === 'function' && callback(snap);
                    });
                }
                else if (event === "child_added") {
                    this.get(snap => {
                        const val = snap.val();
                        if (val === null || typeof val !== "object") { return; }
                        Object.keys(val).forEach(key => {
                            let childSnap = new DataSnapshot(this.child(key), val[key]);
                            eventPublisher.publish(childSnap);
                            // typeof callback === 'function' && callback(childSnap);
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
                                // typeof callback === 'function' && callback(childRef);
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
        };

        if (this.db.isReady) {
            subscribe();
        }
        else {
            this.db.ready(subscribe);
        }

        return eventStream;
    }

    /**
     * Unsubscribes from a previously added event
     * @param event Name of the event
     * @param callback callback function to remove
     */
    off(event?:string, callback?:EventCallback) {
        const subscriptions = this[_private].callbacks;
        const stopSubs = subscriptions.filter(sub => (!event || sub.event === event) && (!callback || sub.userCallback === callback));
        if (stopSubs.length === 0) {
            this.db.debug.warn(`Can't find event subscriptions to stop (path: "${this.path}", event: ${event || '(any)'}, callback: ${callback})`);
        }
        stopSubs.forEach(sub => {
            sub.stream.stop();
        });
        return this;
    }

    /**
     * Gets a snapshot of the stored value. Shorthand method for .once("value")
     * @param options data retrieval options to include or exclude specific child keys
     * @param optionsOrCallback options, or callback
     * @param callback callback function to run with a snapshot of the data instead of returning a promise
     * @returns returns a promise that resolves with a snapshot of the data, or nothing if callback is used
     */
    get(): Promise<DataSnapshot>;
    get(options: DataRetrievalOptions): Promise<DataSnapshot>;
    get(callback: (snapshot:DataSnapshot) => void): void;
    get(options: DataRetrievalOptions, callback: (snapshot:DataSnapshot) => void): void;
    get(optionsOrCallback?:DataRetrievalOptions|((snapshot:DataSnapshot) => void), callback?: (snapshot:DataSnapshot) => void): Promise<DataSnapshot>|void;
    get(optionsOrCallback?:DataRetrievalOptions|((snapshot:DataSnapshot) => void), callback?: (snapshot:DataSnapshot) => void): Promise<DataSnapshot>|void {
        if (!this.db.isReady) {
            const promise = this.db.ready().then(() => this.get(optionsOrCallback, callback) as any);
            return typeof optionsOrCallback !== 'function' && typeof callback !== 'function' ? promise : undefined; // only return promise if no callback is used
        }

        callback = 
            typeof optionsOrCallback === 'function' 
            ? optionsOrCallback 
            : typeof callback === 'function'
                ? callback
                : undefined;

        if (this.isWildcardPath) {
            const error = new Error(`Cannot get value of wildcard path "/${this.path}". Use .query() instead`);
            if (typeof callback === 'function') { throw error; }
            return Promise.reject(error);
        }

        const options = new DataRetrievalOptions(typeof optionsOrCallback === 'object' ? optionsOrCallback : { cache_mode: 'allow' });
        const promise = this.db.api.get(this.path, options).then(result => {
            const isNewApiResult = ('context' in result && 'value' in result);
            if (!isNewApiResult) {
                // acebase-core version package was updated but acebase or acebase-client package was not? Warn, but don't throw an error.
                console.warn(`AceBase api.get method returned an old response value. Update your acebase or acebase-client package`);
                result = { value: result, context: {} };
            }
            const value = this.db.types.deserialize(this.path, result.value);
            const snapshot = new DataSnapshot(this, value, undefined, undefined, result.context);
            return snapshot;
        });

        if (callback) { 
            promise.then(callback).catch(err => {
                console.error(`Uncaught error:`, err);
            });
            return; 
        }
        else {
            return promise;
        }
    }

    /**
     * Waits for an event to occur
     * @param event Name of the event, eg "value", "child_added", "child_changed", "child_removed"
     * @param options data retrieval options, to include or exclude specific child keys
     * @returns returns promise that resolves with a snapshot of the data
     */
    once(event: string, options?: DataRetrievalOptions): Promise<DataSnapshot> {
        if (event === "value" && !this.isWildcardPath) {
            // Shortcut, do not start listening for future events
            return this.get(options) as Promise<DataSnapshot>;
        }
        return new Promise((resolve, reject) => {
            const callback = (snap: DataSnapshot) => {
                this.off(event, callback); // unsubscribe directly
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
     * @param value optional value to store into the database right away
     * @param onComplete optional callback function to run once value has been stored
     * @returns returns promise that resolves with the reference after the passed value has been stored
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
    push(value: any, onComplete?: (err: Error, ref: DataReference) => void): Promise<DataReference>
    /**
     * @returns returns a reference to the new child
     */
    push(): DataReference
    /**
     * @param value optional value to store into the database right away
     * @param onComplete optional callback function to run once value has been stored
     * @returns returns promise that resolves with the reference after the passed value has been stored
     */
    push(value?: any, onComplete?: (err: Error, ref: DataReference) => void): DataReference|Promise<DataReference> {
        if (this.isWildcardPath) {
            const error = new Error(`Cannot push to wildcard path "/${this.path}"`);
            if (typeof value === 'undefined' || typeof onComplete === 'function') { throw error; }
            return Promise.reject(error);
        }

        const id = ID.generate();
        const ref = this.child(id);
        ref[_private].pushed = true;

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
    async remove() {
        if (this.isWildcardPath) {
            throw new Error(`Cannot remove wildcard path "/${this.path}". Use query().remove instead`);
        }
        if (this.parent === null) {
            throw new Error(`Cannot remove the root node`);
        }
        return this.set(null);
    }

    /**
     * Quickly checks if this reference has a value in the database, without returning its data
     * @returns {Promise<boolean>} | returns a promise that resolves with a boolean value
     */
    async exists() {
        if (this.isWildcardPath) {
            throw new Error(`Cannot check wildcard path "/${this.path}" existence`);
        }
        if (!this.db.isReady) {
            await this.db.ready();
        }
        return this.db.api.exists(this.path);
    }

    get isWildcardPath() {
        return this.path.indexOf('*') >= 0 || this.path.indexOf('$') >= 0;
    }

    query() {
        return new DataReferenceQuery(this);
    }

    async count() {
        const info = await this.reflect("info", { child_count: true });
        return info.children.count;
    }

    async reflect(type: 'info'|'children', args:any) {
        if (this.isWildcardPath) {
            throw new Error(`Cannot reflect on wildcard path "/${this.path}"`);
        }
        if (!this.db.isReady) {
            await this.db.ready();
        }
        return this.db.api.reflect(this.path, type, args);
    }

    async export(write: StreamWriteFunction, options = { format: 'json', type_safe: true }) {
        if (this.isWildcardPath) {
            throw new Error(`Cannot export wildcard path "/${this.path}"`);
        }
        if (!this.db.isReady) {
            await this.db.ready();
        }
        return this.db.api.export(this.path, write, options);
    }

    async import(read: StreamReadFunction, options = { format: 'json', suppress_events: false }) {
        if (this.isWildcardPath) {
            throw new Error(`Cannot import to wildcard path "/${this.path}"`);
        }
        if (!this.db.isReady) {
            await this.db.ready();
        }
        return this.db.api.import(this.path, read, options);
    }

    proxy(defaultValue: any) {
        return LiveDataProxy.create(this, defaultValue);
    }

    observe(options?: DataRetrievalOptions) {
        // options should not be used yet - we can't prevent/filter mutation events on excluded paths atm 
        if (options) { throw new Error('observe does not support data retrieval options yet'); }

        if (this.isWildcardPath) {
            throw new Error(`Cannot observe wildcard path "/${this.path}"`);
        }
        const Observable = getObservable();
        return new Observable(observer => {
            let cache, resolved = false;
            let promise = this.get(options).then(snap => {
                resolved = true;
                cache = snap.val();
                observer.next(cache);
            });

            const updateCache = (snap) => {
                if (!resolved) { 
                    promise = promise.then(() => updateCache(snap));
                    return; 
                }
                const mutatedPath = snap.ref.path;
                if (mutatedPath === this.path) {
                    cache = snap.val();
                    return observer.next(cache);
                }
                const trailKeys = PathInfo.getPathKeys(mutatedPath).slice(PathInfo.getPathKeys(this.path).length);
                let target = cache;
                while (trailKeys.length > 1) {
                    const key = trailKeys.shift();
                    if (!(key in target)) {
                        // Happens if initial loaded data did not include / excluded this data, 
                        // or we missed out on an event
                        target[key] = typeof trailKeys[0] === 'number' ? [] : {}
                    }
                    target = target[key];
                }
                const prop = trailKeys.shift();
                const newValue = snap.val();
                if (newValue === null) {
                    // Remove it
                    target instanceof Array && typeof prop === 'number' ? target.splice(prop, 1) : delete target[prop];                    
                }
                else {
                    // Set or update it
                    target[prop] = newValue;
                }
                observer.next(cache);
            };

            this.on('mutated', updateCache); // TODO: Refactor to 'mutations' event instead

            // Return unsubscribe function
            return () => {
                this.off('mutated', updateCache);
            };
        });
    }

    async forEach(callbackOrOptions: ForEachIteratorCallback|DataRetrievalOptions, callback?: ForEachIteratorCallback): Promise<ForEachIteratorResult> {
        let options;
        if (typeof callbackOrOptions === 'function') { callback = callbackOrOptions; }
        else { options = callbackOrOptions; }
        if (typeof callback !== 'function') { throw new TypeError(`No callback function given`); }

        // Get all children through reflection. This could be tweaked further using paging
        const info = await this.reflect('children', { limit: 0, skip: 0 }); // Gets ALL child keys

        const summary:ForEachIteratorResult = {
            canceled: false,
            total: info.list.length,
            processed: 0
        };

        // Iterate through all children until callback returns false
        for (let i = 0; i < info.list.length; i++) {
            const key = info.list[i].key;
            
            // Get child data
            const snapshot = await this.child(key).get(options);
            summary.processed++;

            if (!snapshot.exists()) {
                // Was removed in the meantime, skip
                continue;
            }

            // Run callback
            const result = await callback(snapshot);
            if (result === false) {
                summary.canceled = true;
                break; // Stop looping
            }
        }

        return summary;
    }

    async getMutations(cursorOrDate?: string|Date|null): Promise<{ used_cursor: string, new_cursor: string, mutations: ValueMutation[] }> {
        const cursor = typeof cursorOrDate === 'string' ? cursorOrDate : undefined;
        const timestamp = cursorOrDate === null || typeof cursorOrDate === 'undefined' ? 0 : cursorOrDate instanceof Date ? cursorOrDate.getTime() : undefined;
        return this.db.api.getMutations({ path: this.path, cursor, timestamp });
    }

    async getChanges(cursorOrDate?: string|Date|null): Promise<{ used_cursor: string, new_cursor: string, changes: ValueChange[] }> {
        const cursor = typeof cursorOrDate === 'string' ? cursorOrDate : undefined;
        const timestamp = cursorOrDate === null || typeof cursorOrDate === 'undefined' ? 0 : cursorOrDate instanceof Date ? cursorOrDate.getTime() : undefined;
        return this.db.api.getChanges({ path: this.path, cursor, timestamp });
    }
}

type ForEachIteratorCallback = (childSnapshot: DataSnapshot) => boolean|void|Promise<boolean|void>;
interface ForEachIteratorResult {
    canceled: boolean, 
    total: number,
    processed: number
}

interface QueryFilter {
    key: string|number,
    op: QueryOperator,
    compare: any
}

interface QueryOrder {
    key: string|number,
    ascending: boolean
}

export interface RealtimeQueryEvent {
    name: string, 
    snapshot?: DataSnapshot, 
    ref?: DataReference
}
export type RealtimeQueryEventCallback = (event: RealtimeQueryEvent) => void

export interface QueryRemoveResult {
    success: boolean,
    error?: Error,
    ref: DataReference
}

export type StandardQueryOperator = '<'|'<='|'=='|'!='|'>'|'>='|'exists'|'!exists'|'between'|'!between'|'like'|'!like'|'matches'|'!matches'|'in'|'!in'|'has'|'!has'|'contains'|'!contains';
export type FullTextQueryOperator = 'fulltext:contains' | 'fulltext:!contains';
export type GeoQueryOperator = 'geo:nearby';
export type QueryOperator = StandardQueryOperator | FullTextQueryOperator | GeoQueryOperator;

export class DataReferenceQuery {
    private [_private]: {
        filters: QueryFilter[],
        skip: number,
        take: number,
        order: QueryOrder[],
        events: { [name: string]: RealtimeQueryEventCallback[] }
    }
    ref: DataReference

    /**
     * Creates a query on a reference
     */
    constructor(ref: DataReference) {
        this.ref = ref;
        this[_private] = {
            filters: [],
            skip: 0,
            take: 0,
            order: [],
            events: {}
        };
    }

    /**
     * Applies a filter to the children of the refence being queried. 
     * If there is an index on the property key being queried, it will be used 
     * to speed up the query
     * @param key property to test value of
     * @param op operator to use
     * @param compare value to compare with
     */
    filter(key:string|number, op: QueryOperator, compare: any): DataReferenceQuery {
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
    where(key:string|number, op: QueryOperator, compare: any) {
        return this.filter(key, op, compare)
    }

    /**
     * Limits the number of query results to n
     */
    take(n: number): DataReferenceQuery {
        this[_private].take = n;
        return this;
    }

    /**
     * Skips the first n query results
     */
    skip(n: number): DataReferenceQuery {
        this[_private].skip = n;
        return this;
    }

    /**
     * Sorts the query results
     */
    sort(key:string|number, ascending:boolean = true): DataReferenceQuery {
        if (!['string','number'].includes(typeof key)) {
            throw `key must be a string or number`;
        }
        this[_private].order.push({ key, ascending });
        return this;
    }

    /**
     * @deprecated use .sort instead
     */
    order(key:string|number, ascending:boolean = true) {
        return this.sort(key, ascending);
    }

    /**
     * Executes the query
     * @param options data retrieval options (to include or exclude specific child data, and whether to return snapshots (default) or references only)
     * @param optionsOrCallback options, or callback
     * @param callback callback to use instead of returning a promise
     * @returns returns an Promise that resolves with an array of DataReferences or DataSnapshots, or void if a callback is used instead
     */
    get(): Promise<DataSnapshotsArray>;
    get(options: QueryDataRetrievalOptions): Promise<DataSnapshotsArray|DataReferencesArray>;
    get(callback: (snaps: DataSnapshotsArray) => void): void;
    get(options: QueryDataRetrievalOptions, callback: (results: DataSnapshotsArray|DataReferencesArray) => void): void;
    get(optionsOrCallback?: QueryDataRetrievalOptions|((results: DataSnapshotsArray|DataReferencesArray) => void), callback?: (results: DataSnapshotsArray|DataReferencesArray) => void): Promise<DataSnapshotsArray|DataReferencesArray>|void;
    get(optionsOrCallback?: QueryDataRetrievalOptions|((results: DataSnapshotsArray|DataReferencesArray) => void), callback?: (results: DataSnapshotsArray|DataReferencesArray) => void): Promise<DataSnapshotsArray|DataReferencesArray>|void {
        if (!this.ref.db.isReady) {
            const promise = this.ref.db.ready().then(() => this.get(optionsOrCallback, callback) as any);
            return typeof optionsOrCallback !== 'function' && typeof callback !== 'function' ? promise : undefined; // only return promise if no callback is used
        }

        callback = 
            typeof optionsOrCallback === 'function' 
            ? optionsOrCallback 
            : typeof callback === 'function'
                ? callback
                : undefined;

        const options:IApiQueryOptions = new QueryDataRetrievalOptions(typeof optionsOrCallback === 'object' ? optionsOrCallback : { snapshots: true, cache_mode: 'allow' });
        options.allow_cache = options.cache_mode !== 'bypass'; // Backward compatibility when using older acebase-client
        options.eventHandler = ev => {
            // TODO: implement context for query events
            if (!this[_private].events[ev.name]) { return false; }
            const listeners = this[_private].events[ev.name];
            if (typeof listeners !== 'object' || listeners.length === 0) { return false; }
            if (['add','change','remove'].includes(ev.name)) {
                const ref = new DataReference(this.ref.db, ev.path);
                const eventData:RealtimeQueryEvent = { name: ev.name };
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
        if (this[_private].events) {
            if (this[_private].events['add'] && this[_private].events['add'].length > 0) {
                options.monitor.add = true;
            }
            if (this[_private].events['change'] && this[_private].events['change'].length > 0) {
                options.monitor.change = true;
            }
            if (this[_private].events['remove'] && this[_private].events['remove'].length > 0) {
                options.monitor.remove = true;
            }
        }
        const db = this.ref.db;
        // NOTE: returning promise here, regardless of callback argument. Good argument to refactor method to async/await soon
        return db.api.query(this.ref.path, this[_private], options)
        .catch(err => {
            throw new Error(err);
        })
        .then(res => {
            let { results, context } = res;
            if (!('results' in res && 'context' in res)) {
                console.warn(`Query results missing context. Update your acebase and/or acebase-client packages`);
                results = <any>res, context = {};
            }
            if (options.snapshots) {
                const snaps = (results as { path: string, val: any }[]).map<DataSnapshot>(result => {
                    const val = db.types.deserialize(result.path, result.val);
                    return new DataSnapshot(db.ref(result.path), val, false, undefined, context);
                });
                return DataSnapshotsArray.from(snaps);
            }
            else {
                const refs = (results as string[]).map<DataReference>(path => db.ref(path));
                return DataReferencesArray.from(refs);
            }
        })
        .then(results => {
            callback && callback(results);
            return results;
        });
    }

    /**
     * Executes the query and returns references. Short for `.get({ snapshots: false })`
     * @param callback callback to use instead of returning a promise
     * @returns returns an Promise that resolves with an array of DataReferences, or void when using a callback
     * @deprecated Use `find` instead
     */
    getRefs(callback?:(references:DataReferencesArray) => void): Promise<DataReferencesArray>|void {
        return this.get({ snapshots: false }, callback);
    }

    /**
     * Executes the query and returns an array of references. Short for `.get({ snapshots: false })`
     */
    find(): Promise<DataReferencesArray> {
        return this.get({ snapshots: false }) as Promise<DataReferencesArray>;
    }
    
    /**
     * Executes the query and returns the number of results
     */
    count(): Promise<number> {
        return this.get({ snapshots: false }).then(refs => refs.length);
    }

    /**
     * Executes the query and returns if there are any results
     */
    exists(): Promise<boolean> {
        return this.count().then(count => count > 0);
    }
    
    /**
     * Executes the query, removes all matches from the database
     * @returns returns an Promise that resolves once all matches have been removed, or void if a callback is used
     */
    remove(callback: (results:QueryRemoveResult[]) => void): Promise<QueryRemoveResult[]>|void {
        const promise = this.get({ snapshots: false })
        .then((refs: DataReferencesArray) => {
            return Promise.all(
                refs.map<Promise<QueryRemoveResult>>(ref => 
                    ref.remove()
                    .then(() => {
                        return { success: true, ref };
                    })
                    .catch(err => {
                        return { success: false, error: err, ref }
                    })
                )
            )
            .then(results => {
                callback && callback(results);
                return results;
            });
        });
        if (!callback) { return promise; }
    }

    /**
     * Subscribes to an event. Supported events are:
     *  "stats": receive information about query performance.
     *  "hints": receive query or index optimization hints
     *  "add", "change", "remove": receive real-time query result changes
     * @param event Name of the event to subscribe to
     * @param callback Callback function
     * @returns returns reference to this query
     */
    on(event: string, callback:RealtimeQueryEventCallback) {
        if (!this[_private].events[event]) { this[_private].events[event] = []; }
        this[_private].events[event].push(callback);
        return this;
    }

    /**
     * Unsubscribes from a previously added event(s)
     * @param event Name of the event
     * @param callback callback function to remove
     * @returns returns reference to this query
     */
    off(event?: string, callback?: RealtimeQueryEventCallback): DataReferenceQuery {
        if (typeof event === 'undefined') {
            this[_private].events = {};
            return this;
        }
        if (!this[_private].events[event]) { return this; }
        if (typeof callback === 'undefined') {
            delete this[_private].events[event];
            return this;
        }
        const index = this[_private].events[event].indexOf(callback);
        if (!~index) { return this; }
        this[_private].events[event].splice(index, 1);
        return this;
    }

    async forEach(callbackOrOptions: ForEachIteratorCallback|DataRetrievalOptions, callback?: ForEachIteratorCallback): Promise<ForEachIteratorResult> {
        let options;
        if (typeof callbackOrOptions === 'function') { callback = callbackOrOptions; }
        else { options = callbackOrOptions; }
        if (typeof callback !== 'function') { throw new TypeError(`No callback function given`); }

        // Get all query results. This could be tweaked further using paging
        const refs = await this.getRefs() as DataReferencesArray;

        const summary:ForEachIteratorResult = {
            canceled: false,
            total: refs.length,
            processed: 0
        };

        // Iterate through all children until callback returns false
        for (let i = 0; i < refs.length; i++) {
            const ref = refs[i];
            
            // Get child data
            const snapshot = await ref.get(options);
            summary.processed++;
            
            if (!snapshot.exists()) {
                // Was removed in the meantime, skip
                continue;
            }

            // Run callback
            const result = await callback(snapshot);
            if (result === false) {
                summary.canceled = true;
                break; // Stop looping
            }
        }

        return summary;
    }

}

export class DataSnapshotsArray extends Array<DataSnapshot> {
    static from(snaps: DataSnapshot[]) {
        const arr = new DataSnapshotsArray(snaps.length);
        snaps.forEach((snap, i) => arr[i] = snap);
        return arr;
    }
    getValues() {
        return this.map(snap => snap.val());
    }
}

export class DataReferencesArray extends Array<DataReference> { 
    static from(refs: DataReference[]) {
        const arr = new DataReferencesArray(refs.length);
        refs.forEach((ref, i) => arr[i] = ref);
        return arr;
    }
    getPaths() {
        return this.map(ref => ref.path);
    }
}