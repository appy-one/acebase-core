"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.proxyAccess = exports.LiveDataProxy = void 0;
const utils_1 = require("./utils");
const data_snapshot_1 = require("./data-snapshot");
const path_reference_1 = require("./path-reference");
const id_1 = require("./id");
// Import RxJS Observable without throwing errors when not available.
const { Observable } = require('rxjs'); //'rxjs/internal/observable'
const isProxy = Symbol('isProxy');
class LiveDataProxy {
    /**
     * Creates a live data proxy for the given reference. The data of the reference's path will be loaded, and kept in-sync
     * with live data by listening for 'mutated' events. Any changes made to the value by the client will be synced back
     * to the database.
     * @param ref DataReference to create proxy for.
     * @param defaultValue Default value to use for the proxy if the database path does not exist yet. This value will also
     * be written to the database.
     */
    static async create(ref, defaultValue) {
        let cache, loaded = false;
        const proxyId = id_1.ID.generate(); //ref.push().key;
        let onMutationCallback;
        let onErrorCallback = err => {
            console.error(err.message, err.details);
        };
        // Subscribe to mutated events on the target path
        // const subscription = ref.on('mutated').subscribe(async (snap: DataSnapshot) => {
        //     if (!loaded) { 
        //         return;
        //     }
        //     const context:IProxyContext = snap.ref.context();
        //     const remoteChange = context.acebase_proxy?.id !== proxyId;
        //     if (snap.ref.path === ref.path) {
        //         // cache value itself being mutated (changing types? being removed/created?)
        //         if (context.acebase_operation === 'update_cache') {
        //             // Ignore cachedb updates that came from a .get
        //             return;
        //         }
        //         cache = snap.val();
        //         return;
        //     }
        //     let reloadCache = false;
        //     if (remoteChange) {
        //         // Make changes to cached object
        //         const mutatedPath = snap.ref.path;
        //         const trailPath = mutatedPath.slice(ref.path.length);
        //         const trailKeys = PathInfo.getPathKeys(trailPath);
        //         let target = cache;
        //         while (trailKeys.length > 1) {
        //             const key = trailKeys.shift();
        //             if (!(key in target)) {
        //                 // Have we missed an event, or are local pending mutations creating this conflict?
        //                 // Do not proceed, reload entire value into cache
        //                 reloadCache = true;
        //                 console.warn(`Cached value appears outdated, will be reloaded`);
        //                 break;
        //                 // target[key] = typeof trailKeys[0] === 'number' ? [] : {}
        //             }
        //             target = target[key];
        //         }
        //         if (!reloadCache) {
        //             const prop = trailKeys.shift();
        //             // const oldValue = target[prop] || null;
        //             const newValue = snap.val();
        //             if (newValue === null) {
        //                 // Remove it
        //                 target instanceof Array ? target.splice(prop as number, 1) : delete target[prop];                    
        //             }
        //             else {
        //                 // Set or update it
        //                 target[prop] = newValue;
        //             }
        //         }
        //     }
        //     if (reloadCache) {
        //         const newSnap = await ref.get();
        //         cache = newSnap.val();
        //         // Set mutationSnap to our new value snapshot, with conflict context
        //         const mutationContext = snap.ref.context();
        //         newSnap.ref.context(<IProxyContext>{ acebase_proxy: { id: proxyId, source: 'conflict', conflict: mutationContext }});
        //         snap = newSnap;
        //     }
        //     onMutationCallback && onMutationCallback(snap, remoteChange);
        // });
        const applyChange = (keys, newValue) => {
            // Make changes to cache
            if (keys.length === 0) {
                cache = newValue;
                return true;
            }
            let target = cache;
            keys = keys.slice();
            while (keys.length > 1) {
                const key = keys.shift();
                if (!(key in target)) {
                    // Have we missed an event, or are local pending mutations creating this conflict?
                    return false; // Do not proceed
                }
                target = target[key];
            }
            const prop = keys.shift();
            if (newValue === null) {
                // Remove it
                target instanceof Array ? target.splice(prop, 1) : delete target[prop];
            }
            else {
                // Set or update it
                target[prop] = newValue;
            }
            return true;
        };
        // Subscribe to mutations events on the target path
        const subscription = ref.on('mutations').subscribe(async (snap) => {
            var _a;
            if (!loaded) {
                return;
            }
            const context = snap.ref.context();
            const isRemote = ((_a = context.acebase_proxy) === null || _a === void 0 ? void 0 : _a.id) !== proxyId;
            if (!isRemote) {
                return; // Update was done by us, no need to update cache
            }
            const mutations = snap.val(false);
            const proceed = mutations.every(mutation => {
                if (!applyChange(mutation.target, mutation.val)) {
                    return false;
                }
                const changeRef = mutation.target.reduce((ref, key) => ref.child(key), ref);
                const changeSnap = new data_snapshot_1.DataSnapshot(changeRef, mutation.val, false, mutation.prev);
                onMutationCallback && onMutationCallback(changeSnap, isRemote);
                return true;
            });
            if (!proceed) {
                console.error(`Cached value appears outdated, will be reloaded`);
                await reload();
            }
        });
        // Setup updating functionality: enqueue all updates, process them at next tick in the order they were issued 
        let processQueueTimeout, processPromise = Promise.resolve();
        const overwriteQueue = [];
        const mutations = [];
        const flagOverwritten = (target) => {
            if (!mutations.find(m => m.target.length === target.length && m.target.every((key, i) => key === target[i]))) {
                mutations.push({ target, previous: utils_1.cloneObject(getTargetValue(cache, target)), value: null });
            }
            // flag target for overwriting, if an ancestor (or itself) has not been already.
            // it will remove the flag for any descendants target previously set
            const ancestorOrSelf = overwriteQueue.find(otherTarget => otherTarget.length <= target.length && otherTarget.every((key, i) => key === target[i]));
            if (ancestorOrSelf) {
                return;
            }
            // remove descendants
            const descendants = overwriteQueue.filter(otherTarget => otherTarget.length > target.length && otherTarget.every((key, i) => key === target[i]));
            descendants.forEach(d => overwriteQueue.splice(descendants.indexOf(d), 1));
            // add to the queue
            overwriteQueue.push(target);
            // schedule database updates
            if (!processQueueTimeout) {
                processQueueTimeout = setTimeout(() => {
                    processQueueTimeout = null;
                    const targets = overwriteQueue.splice(0);
                    // Group targets into parent updates
                    const updates = targets.reduce((updates, target) => {
                        if (target.length === 0) {
                            // Overwrite this proxy's root value
                            updates.push({ ref, value: cache, type: 'set' });
                        }
                        else {
                            const parentTarget = target.slice(0, -1);
                            const key = target.slice(-1)[0];
                            const parentRef = parentTarget.reduce((ref, key) => ref.child(key), ref);
                            const parentUpdate = updates.find(update => update.ref.path === parentRef.path);
                            let cacheValue = target.reduce((value, key) => value[key], cache);
                            if (typeof cacheValue === 'undefined') {
                                cacheValue = null; // Being deleted
                            }
                            if (parentUpdate) {
                                parentUpdate.value[key] = cacheValue;
                            }
                            else {
                                updates.push({ ref: parentRef, value: { [key]: cacheValue }, type: 'update' });
                            }
                        }
                        return updates;
                    }, []);
                    // Schedule local subscription callbacks in next tick
                    // for super responsiveness
                    process.nextTick(() => {
                        // Run onMutation callback for each changed node
                        mutations.forEach(mutation => {
                            mutation.value = utils_1.cloneObject(getTargetValue(cache, mutation.target));
                            const mutationRef = mutation.target.reduce((ref, key) => ref.child(key), ref);
                            const mutationSnap = new data_snapshot_1.DataSnapshot(mutationRef, mutation.value, false, mutation.previous);
                            onMutationCallback(mutationSnap, false);
                        });
                        mutations.splice(0);
                        // Run local change subscriptions now
                        clientSubscriptions
                            .filter(sub => typeof sub.snapshot !== 'undefined')
                            .forEach(sub => {
                            const currentValue = utils_1.cloneObject(getTargetValue(cache, sub.target));
                            const previousValue = sub.snapshot;
                            delete sub.snapshot;
                            let keepSubscription = true;
                            try {
                                keepSubscription = false !== sub.callback(Object.freeze(currentValue), Object.freeze(previousValue), false, { proxy: { id: proxyId, source: 'local_update' } });
                            }
                            catch (err) {
                                onErrorCallback({ source: 'local_update', message: `Error running subscription callback`, details: err });
                            }
                            if (!keepSubscription) {
                                sub.subscription.stop();
                                clientSubscriptions.splice(clientSubscriptions.findIndex(cs => cs.subscription === sub.subscription), 1);
                            }
                        });
                    });
                    // Update database async
                    const batchId = id_1.ID.generate();
                    // console.log(`Proxy: processing ${updates.length} db updates to paths:`, updates.map(update => update.ref.path));
                    processPromise = updates.reduce(async (promise, update) => {
                        await promise;
                        return update.ref
                            .context({ acebase_proxy: { id: proxyId, source: 'update', update_id: id_1.ID.generate(), batch_id: batchId, batch_updates: updates.length } })[update.type](update.value) // .set or .update
                            .catch(err => {
                            onErrorCallback({ source: 'update', message: `Error processing update of "/${ref.path}"`, details: err });
                        });
                    }, processPromise);
                });
            }
        };
        const clientSubscriptions = [];
        const addOnChangeHandler = (target, callback) => {
            const targetRef = getTargetRef(ref, target);
            const subscription = targetRef.on('mutations').subscribe(async (snap) => {
                var _a;
                const context = snap.ref.context();
                const isRemote = ((_a = context.acebase_proxy) === null || _a === void 0 ? void 0 : _a.id) !== proxyId;
                if (!isRemote) {
                    // Any local changes already triggered subscription callbacks
                    return;
                }
                // Construct previous value from snapshot
                const currentValue = getTargetValue(cache, target);
                let newValue = utils_1.cloneObject(currentValue);
                let previousValue = utils_1.cloneObject(newValue);
                // const mutationPath = snap.ref.path;
                const mutations = snap.val(false);
                mutations.every(mutation => {
                    if (mutation.target.length === 0) {
                        newValue = mutation.val;
                        previousValue = mutation.prev;
                        return true;
                    }
                    for (let i = 0, val = newValue, prev = previousValue, arr = mutation.target; i < arr.length; i++) { // arr = PathInfo.getPathKeys(mutationPath).slice(PathInfo.getPathKeys(targetRef.path).length)
                        const last = i + 1 === arr.length, key = arr[i];
                        if (last) {
                            val[key] = mutation.val;
                            if (val[key] === null) {
                                delete val[key];
                            }
                            prev[key] = mutation.prev;
                            if (prev[key] === null) {
                                delete prev[key];
                            }
                        }
                        else {
                            val = val[key] = key in val ? val[key] : {};
                            prev = prev[key] = key in prev ? prev[key] : {};
                        }
                    }
                    return true;
                });
                process.nextTick(() => {
                    // Run callback with read-only (frozen) values in next tick
                    const keepSubscription = callback(Object.freeze(newValue), Object.freeze(previousValue), isRemote, context);
                    if (keepSubscription === false) {
                        stop();
                    }
                });
            });
            const stop = () => {
                subscription.stop();
                clientSubscriptions.splice(clientSubscriptions.findIndex(cs => cs.subscription === subscription), 1);
            };
            clientSubscriptions.push({ target, subscription, callback, snapshot: utils_1.cloneObject(getTargetValue(cache, target)) });
            return { stop };
        };
        const prepareSnapshots = (target) => {
            // Add snapshots to onChange subscriptions that don't have them yet
            clientSubscriptions
                .filter(sub => typeof sub.snapshot === 'undefined' && sub.target.every((key, i) => i >= target.length || key === target[i]))
                .forEach(sub => {
                sub.snapshot = utils_1.cloneObject(getTargetValue(cache, sub.target));
            });
        };
        const handleFlag = (flag, target, args) => {
            if (flag === 'write') {
                prepareSnapshots(target);
                return flagOverwritten(target); //, args.previous
            }
            else if (flag === 'onChange') {
                return addOnChangeHandler(target, args.callback);
            }
            else if (flag === 'observe') {
                if (!Observable) {
                    throw new Error(`Cannot observe proxy value because rxjs package could not be loaded. Add it to your project with: npm i rxjs`);
                }
                return new Observable(observer => {
                    const currentValue = getTargetValue(cache, target);
                    observer.next(currentValue);
                    const subscription = addOnChangeHandler(target, (value, previous, isRemote, context) => {
                        observer.next(value);
                    });
                    return function unsubscribe() {
                        subscription.stop();
                    };
                });
            }
            // else if (flag === 'runEvents') {
            //     clientSubscriptions.filter(cs => cs.target.length <= target.length && cs.target.every((key, index) => key === target[index]))
            //     .forEach(cs => {
            //         const value = Object.freeze(cloneObject(getTargetValue(cache, cs.target)));
            //         try {
            //             cs.callback(value, value, false, { simulated: true });
            //         }
            //         catch(err) {
            //             console.error(`Error running change callback: `, err);
            //         }
            //     });
            // }
        };
        const snap = await ref.get({ allow_cache: true });
        loaded = true;
        cache = snap.val();
        if (cache === null && typeof defaultValue !== 'undefined') {
            cache = defaultValue;
            await ref.set(cache);
        }
        let proxy = createProxy({ root: { ref, cache }, target: [], id: proxyId, flag: handleFlag });
        const assertProxyAvailable = () => {
            if (proxy === null) {
                throw new Error(`Proxy was destroyed`);
            }
        };
        const reload = async () => {
            // Manually reloads current value when cache is out of sync, which should only 
            // be able to happen if an AceBaseClient is used without cache database, 
            // and the connection to the server was lost for a while. In all other cases, 
            // there should be no need to call this method.
            assertProxyAvailable();
            const newSnap = await ref.get();
            cache = newSnap.val();
            proxy = createProxy({ root: { ref, cache }, target: [], id: proxyId, flag: handleFlag });
            newSnap.ref.context({ acebase_proxy: { id: proxyId, source: 'reload' } });
            onMutationCallback(newSnap, true);
            // TODO: run all other subscriptions
        };
        return {
            async destroy() {
                await processPromise;
                subscription.stop();
                clientSubscriptions.forEach(cs => cs.subscription.stop());
                cache = null; // Remove cache
                proxy = null;
            },
            stop() {
                this.destroy();
            },
            get value() {
                assertProxyAvailable();
                return proxy;
            },
            get hasValue() {
                assertProxyAvailable();
                return cache !== null;
            },
            set value(val) {
                // Overwrite the value of the proxied path itself!
                assertProxyAvailable();
                if (typeof val === 'object' && val[isProxy]) {
                    // Assigning one proxied value to another
                    val = val.getTarget();
                }
                // const previous = cache;
                flagOverwritten([]);
                cache = val;
                proxy = createProxy({ root: { ref, cache }, target: [], id: proxyId, flag: handleFlag });
                // flagOverwritten([], previous);
            },
            reload,
            onMutation(callback) {
                // Fires callback each time anything changes
                assertProxyAvailable();
                // addOnChangeHandler([], (value: T, previous: T, isRemote, context) => {
                //     const snap = new DataSnapshot(ref.context(context), value, false, previous);
                //     try { callback(snap, isRemote); }
                //     catch(err) { 
                //         onErrorCallback({ source: 'mutation_callback', message: 'Error in dataproxy onMutation callback', details: err });
                //     }
                // });
                onMutationCallback = (...args) => {
                    try {
                        callback(...args);
                    }
                    catch (err) {
                        onErrorCallback({ source: 'mutation_callback', message: 'Error in dataproxy onMutation callback', details: err });
                    }
                };
            },
            onError(callback) {
                // Fires callback each time anything goes wrong
                assertProxyAvailable();
                onErrorCallback = (...args) => {
                    try {
                        callback(...args);
                    }
                    catch (err) {
                        console.error(`Error in dataproxy onError callback: ${err.message}`);
                    }
                };
            }
        };
    }
}
exports.LiveDataProxy = LiveDataProxy;
function getTargetValue(obj, target) {
    let val = obj;
    for (let key of target) {
        val = typeof val === 'object' && val !== null && key in val ? val[key] : null;
    }
    return val;
}
function getTargetRef(ref, target) {
    let targetRef = ref;
    for (let key of target) {
        targetRef = targetRef.child(key);
    }
    return targetRef;
}
function createProxy(context) {
    const targetRef = getTargetRef(context.root.ref, context.target);
    const childProxies = [];
    const handler = {
        get(target, prop, receiver) {
            target = getTargetValue(context.root.cache, context.target);
            if (typeof prop === 'symbol') {
                if (prop.toString() === isProxy.toString()) {
                    return true;
                }
                return Reflect.get(target, prop, receiver);
            }
            if (typeof target === null || typeof target !== 'object') {
                throw new Error(`Cannot read property "${prop}" of ${target}. Value of path "/${targetRef.path}" is not an object (anymore)`);
            }
            if (target instanceof Array && typeof prop === 'string' && /^[0-9]+$/.test(prop)) {
                // Proxy type definitions say prop can be a number, but this is never the case.
                prop = parseInt(prop);
            }
            const value = target[prop];
            // Check if we have a child proxy for this property already.
            // If so, and the properties' typeof value did not change, return that
            const childProxy = childProxies.find(proxy => proxy.prop === prop);
            if (childProxy) {
                if (childProxy.typeof === typeof value) {
                    return childProxy.value;
                }
                childProxies.splice(childProxies.indexOf(childProxy), 1);
            }
            // If the property contains a simple value, return it. 
            if (['string', 'number', 'boolean'].includes(typeof value)
                || value instanceof Date
                || value instanceof path_reference_1.PathReference
                || value instanceof ArrayBuffer
                || (typeof value === 'object' && 'buffer' in value) // Typed Arrays
            ) {
                return value;
            }
            const isArray = target instanceof Array;
            // TODO: Implement updateWithContext and setWithContext
            if (!(prop in target)) {
                if (prop === 'getTarget') {
                    // Get unproxied readonly (but still live) version of data.
                    return function getTarget() {
                        console.warn(`Use getTarget with caution - any changes will not be synchronized!`);
                        return target;
                    };
                }
                if (prop === 'getRef') {
                    // Gets the DataReference to this data target
                    return function getRef() {
                        const ref = getTargetRef(context.root.ref, context.target);
                        ref.context({ acebase_proxy: { id: context.id, source: 'getRef' } });
                        return ref;
                    };
                }
                if (prop === 'forEach') {
                    return function forEach(callback) {
                        const keys = Object.keys(target);
                        for (let i = 0; i < keys.length && callback(target[keys[i]], keys[i], i) !== false; i++) { }
                    };
                }
                if (prop === 'toArray') {
                    return function toArray(sortFn) {
                        const arr = Object.keys(target).map(key => target[key]);
                        if (sortFn) {
                            arr.sort(sortFn);
                        }
                        return arr;
                    };
                }
                if (prop === 'onChanged') {
                    // Starts monitoring the value
                    return function onChanged(callback) {
                        return context.flag('onChange', context.target, { callback });
                    };
                }
                if (prop === 'getObservable') {
                    // Creates an observable for monitoring the value
                    return function getObservable() {
                        return context.flag('observe', context.target);
                    };
                }
                // if (prop === 'runEvents') {
                //     // Triggers change event subscriptions / observables to be executed with current data
                //     return function runEvents() {
                //         return context.flag('runEvents', context.target);
                //     }
                // }
                if (!isArray && prop === 'remove') {
                    // Removes target from object collection
                    return function remove() {
                        if (context.target.length === 0) {
                            throw new Error(`Can't remove proxy root value`);
                        }
                        const parent = getTargetValue(context.root.cache, context.target.slice(0, -1));
                        const key = context.target.slice(-1)[0];
                        // const previous = parent[key];
                        context.flag('write', context.target);
                        delete parent[key];
                    };
                }
            }
            if (isArray && typeof value === 'function') {
                // Handle array functions
                const writeArray = (action) => {
                    context.flag('write', context.target);
                    return action();
                };
                if (prop === 'push') {
                    return function push(...items) {
                        return writeArray(() => target.push(...items)); // push the items to the cache array
                    };
                }
                else if (prop === 'pop') {
                    return function pop() {
                        return writeArray(() => target.pop());
                    };
                }
                else if (prop === 'splice') {
                    return function splice(start, deleteCount, ...items) {
                        return writeArray(() => target.splice(start, deleteCount, ...items));
                    };
                }
                else if (prop === 'shift') {
                    return function shift() {
                        return writeArray(() => target.shift());
                    };
                }
                else if (prop === 'unshift') {
                    return function unshift(...items) {
                        return writeArray(() => target.unshift(...items));
                    };
                }
                else if (prop === 'sort') {
                    return function sort(compareFn) {
                        return writeArray(() => target.sort(compareFn));
                    };
                }
                else if (prop === 'reverse') {
                    return function reverse() {
                        return writeArray(() => target.reverse());
                    };
                }
                else {
                    // Other array function, does not alter its value
                    return function fn(...args) {
                        return target[prop](...args);
                    };
                }
            }
            else if (!isArray && typeof value === 'undefined' && prop === 'push') {
                // Push item to an object collection
                return function push(item) {
                    const childRef = targetRef.push();
                    context.flag('write', context.target.concat(childRef.key)); //, { previous: null }
                    target[childRef.key] = item;
                    return childRef.key;
                };
            }
            else if (typeof value === 'undefined') {
                return undefined;
            }
            // Proxify any other value
            const proxy = createProxy({ root: context.root, target: context.target.concat(prop), id: context.id, flag: context.flag });
            childProxies.push({ typeof: typeof value, prop, value: proxy });
            return proxy;
        },
        set(target, prop, value, receiver) {
            // Eg: chats.chat1.title = 'New chat title';
            // target === chats.chat1, prop === 'title'
            target = getTargetValue(context.root.cache, context.target);
            if (typeof prop === 'symbol') {
                return Reflect.set(target, prop, value, receiver);
            }
            if (target === null || typeof target !== 'object') {
                throw new Error(`Cannot set property "${prop}" of ${target}. Value of path "/${targetRef.path}" is not an object`);
            }
            if (target instanceof Array && typeof prop === 'string') {
                if (!/^[0-9]+$/.test(prop)) {
                    throw new Error(`Cannot set property "${prop}" on array value of path "/${targetRef.path}"`);
                }
                prop = parseInt(prop);
            }
            if (typeof value === 'object' && value[isProxy]) {
                // Assigning one proxied value to another
                value = value.getTarget();
            }
            else if (typeof value === 'object' && Object.isFrozen(value)) {
                // Create a copy to unfreeze it
                value = utils_1.cloneObject(value);
            }
            if (typeof value !== 'object' && target[prop] === value) {
                // not changing the actual value, ignore
                return true;
            }
            if (context.target.some(key => typeof key === 'number')) {
                // Updating an object property inside an array. Flag the first array in target to be written.
                // Eg: when chat.members === [{ name: 'Ewout', id: 'someid' }]
                // --> chat.members[0].name = 'Ewout' --> Rewrite members array instead of chat/members[0]/name
                context.flag('write', context.target.slice(0, context.target.findIndex(key => typeof key === 'number')));
            }
            else if (target instanceof Array) {
                // Flag the entire array to be overwritten
                context.flag('write', context.target);
            }
            else {
                // Flag child property
                context.flag('write', context.target.concat(prop));
            }
            // Set cached value:
            target[prop] = value;
            return true;
        },
        deleteProperty(target, prop) {
            target = getTargetValue(context.root.cache, context.target);
            if (target === null) {
                throw new Error(`Cannot delete property ${prop.toString()} of null`);
            }
            if (typeof prop === 'symbol') {
                return Reflect.deleteProperty(target, prop);
            }
            if (!(prop in target)) {
                return true; // Nothing to delete
            }
            context.flag('write', context.target.concat(prop));
            delete target[prop];
            return true;
        },
        ownKeys(target) {
            target = getTargetValue(context.root.cache, context.target);
            return Reflect.ownKeys(target);
        },
        has(target, prop) {
            target = getTargetValue(context.root.cache, context.target);
            return Reflect.has(target, prop);
        },
        getOwnPropertyDescriptor(target, prop) {
            target = getTargetValue(context.root.cache, context.target);
            const descriptor = Reflect.getOwnPropertyDescriptor(target, prop);
            if (descriptor) {
                descriptor.configurable = true; // prevent "TypeError: 'getOwnPropertyDescriptor' on proxy: trap reported non-configurability for property '...' which is either non-existant or configurable in the proxy target"
            }
            return descriptor;
        },
        getPrototypeOf(target) {
            target = getTargetValue(context.root.cache, context.target);
            return Reflect.getPrototypeOf(target);
        }
    };
    return new Proxy({}, handler);
}
function proxyAccess(proxiedValue) {
    if (typeof proxiedValue !== 'object' || !proxiedValue[isProxy]) {
        throw new Error(`Given value is not proxied. Make sure you are referencing the value through the live data proxy.`);
    }
    return proxiedValue;
}
exports.proxyAccess = proxyAccess;
