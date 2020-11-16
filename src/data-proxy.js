"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.proxyAccess = exports.LiveDataProxy = void 0;
const utils_1 = require("./utils");
const path_info_1 = require("./path-info");
const path_reference_1 = require("./path-reference");
// Import RxJS Observable without throwing errors when not available.
const { Observable } = require('rxjs/internal/observable');
const isProxy = Symbol("isProxy");
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
        const proxyId = ref.push().key;
        let onMutationCallback;
        let onErrorCallback = err => {
            console.error(err.message, err.details);
        };
        // const waitingForMutationEvents = [];
        // function globalMutationEventsFired() {
        //     return new Promise(resolve => waitingForMutationEvents.push(resolve));
        // };
        // Subscribe to mutated events on the target path
        const subscription = ref.on('mutated').subscribe(async (snap) => {
            if (!loaded) {
                return;
            }
            // // alert those that were waiting for mutation events to fire
            // waitingForMutationEvents.splice(0).forEach(resolve => process.nextTick(resolve));
            const context = snap.ref.context();
            const remoteChange = context.proxy_id !== proxyId;
            if (snap.ref.path === ref.path) {
                // cache value itself being mutated (changing types? being removed/created?)
                cache = snap.val();
                return;
            }
            let reloadCache = false;
            if (remoteChange) {
                // Make changes to cached object
                const mutatedPath = snap.ref.path;
                const trailPath = mutatedPath.slice(ref.path.length);
                const trailKeys = path_info_1.PathInfo.getPathKeys(trailPath);
                let target = cache;
                while (trailKeys.length > 1) {
                    const key = trailKeys.shift();
                    if (!(key in target)) {
                        // Have we missed an event, or are local pending mutations creating this conflict?
                        // Do not proceed, reload entire value into cache
                        reloadCache = true;
                        console.warn(`Cached value appears outdated, will be reloaded`);
                        break;
                        // target[key] = typeof trailKeys[0] === 'number' ? [] : {}
                    }
                    target = target[key];
                }
                if (!reloadCache) {
                    const prop = trailKeys.shift();
                    // const oldValue = target[prop] || null;
                    const newValue = snap.val();
                    if (newValue === null) {
                        // Remove it
                        target instanceof Array ? target.splice(prop, 1) : delete target[prop];
                    }
                    else {
                        // Set or update it
                        target[prop] = newValue;
                    }
                }
            }
            if (reloadCache) {
                const newSnap = await ref.get();
                cache = newSnap.val();
                // Set mutationSnap to our new value snapshot, with conflict context
                const mutationContext = snap.ref.context();
                newSnap.ref.context({ proxy_id: proxyId, proxy_source: 'conflict', proxy_conflict: mutationContext });
                snap = newSnap;
            }
            onMutationCallback && onMutationCallback(snap, remoteChange);
        });
        // Setup updating functionality: enqueue all updates, process them at next tick in the order they were issued 
        let processQueueTimeout, processPromise = Promise.resolve();
        const overwriteQueue = [];
        const flagOverwritten = (target) => {
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
                    const targets = overwriteQueue.splice(0);
                    // Group targets into parent updates
                    const updates = targets.reduce((updates, target) => {
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
                            updates.push({ ref: parentRef, value: { [key]: cacheValue } });
                        }
                        return updates;
                    }, []);
                    console.log(`Proxy: processing ${updates.length} db updates`);
                    processQueueTimeout = null;
                    processPromise = updates.reduce(async (promise, update) => {
                        await promise;
                        return update.ref
                            .context({ proxy_id: proxyId, proxy_source: 'update' })
                            .update(update.value)
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
            const subscription = targetRef.on('mutated').subscribe(async (snap) => {
                // await globalMutationEventsFired(); // Wait for the mutated events to fire
                const context = snap.ref.context();
                const isRemote = context.proxy_id !== proxyId;
                // Construct previous value from snapshot (we don't know what it was if the update was done locally) 
                const currentValue = getTargetValue(cache, target);
                const newValue = utils_1.cloneObject(currentValue);
                const previousValue = utils_1.cloneObject(newValue);
                for (let i = 0, val = newValue, prev = previousValue, arr = path_info_1.PathInfo.getPathKeys(snap.ref.path).slice(path_info_1.PathInfo.getPathKeys(targetRef.path).length); i < arr.length; i++) {
                    const last = i + 1 === arr.length, key = arr[i];
                    if (last) {
                        val[key] = snap.val();
                        if (val[key] === null) {
                            delete val[key];
                        }
                        prev[key] = snap.previous();
                        if (prev[key] === null) {
                            delete prev[key];
                        }
                    }
                    else {
                        val = val[key] = key in val ? val[key] : {};
                        prev = prev[key] = key in prev ? prev[key] : {};
                    }
                }
                // const proxyValue = newValue === null ? null : createProxy({ root: { ref, cache }, target, id: proxyId, flag: handleFlag });
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
                clientSubscriptions.splice(clientSubscriptions.indexOf(subscription), 1);
            };
            clientSubscriptions.push(subscription);
            return { stop };
        };
        const handleFlag = (flag, target, args) => {
            if (flag === 'write') {
                return flagOverwritten(target);
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
        };
        const snap = await ref.get();
        loaded = true;
        cache = snap.val();
        if (cache === null && typeof defaultValue !== 'undefined') {
            cache = defaultValue;
            flagOverwritten([]);
        }
        let proxy = createProxy({ root: { ref, cache }, target: [], id: proxyId, flag: handleFlag });
        const assertProxyAvailable = () => {
            if (proxy === null) {
                throw new Error(`Proxy was destroyed`);
            }
        };
        return {
            destroy() {
                subscription.stop();
                clientSubscriptions.forEach(sub => sub.stop());
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
                    throw new Error(`Cannot set value to another proxy`);
                }
                cache = val;
                proxy = createProxy({ root: { ref, cache }, target: [], id: proxyId, flag: handleFlag });
                flagOverwritten([]);
            },
            async reload() {
                // Manually reloads current value when cache is out of sync, which should only 
                // be able to happen if an AceBaseClient is used without cache database, 
                // and the connection to the server was lost for a while. In all other cases, 
                // there should be no need to call this method.
                assertProxyAvailable();
                const newSnap = await ref.get();
                cache = newSnap.val();
                proxy = createProxy({ root: { ref, cache }, target: [], id: proxyId, flag: handleFlag });
                newSnap.ref.context({ proxy_id: proxyId, proxy_source: 'reload' });
                onMutationCallback(newSnap, true);
            },
            onMutation(callback) {
                // Fires callback each time anything changes
                assertProxyAvailable();
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
//update(ref: DataReference, value: any): void
function createProxy(context) {
    const targetRef = getTargetRef(context.root.ref, context.target);
    const childProxies = [];
    const handler = {
        get(target, prop, receiver) {
            target = getTargetValue(context.root.cache, context.target);
            if (prop === isProxy) {
                return true;
            }
            else if (typeof prop === 'symbol') {
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
                        ref.context({ proxy_id: context.id, proxy_reason: 'getRef' });
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
                if (!isArray && prop === 'remove') {
                    // Removes target from object collection
                    return function remove() {
                        if (context.target.length === 0) {
                            throw new Error(`Can't remove proxy root value`);
                        }
                        const parent = getTargetValue(context.root.cache, context.target.slice(0, -1));
                        const key = context.target.slice(-1)[0];
                        delete parent[key];
                        context.flag('write', context.target);
                    };
                }
            }
            if (isArray && typeof value === 'function') {
                // Handle array functions
                const writeArray = ret => {
                    context.flag('write', context.target);
                    return ret;
                };
                if (prop === 'push') {
                    return function push(...items) {
                        const ret = target.push(...items); // push the items to the cache array
                        return writeArray(ret);
                    };
                }
                else if (prop === 'pop') {
                    return function pop() {
                        const ret = target.pop();
                        return writeArray(ret);
                    };
                }
                else if (prop === 'splice') {
                    return function splice(start, deleteCount, ...items) {
                        const ret = target.splice(start, deleteCount, ...items);
                        return writeArray(ret);
                    };
                }
                else if (prop === 'shift') {
                    return function shift() {
                        const ret = target.shift();
                        return writeArray(ret);
                    };
                }
                else if (prop === 'unshift') {
                    return function unshift(...items) {
                        const ret = target.unshift(...items);
                        return writeArray(ret);
                    };
                }
                else if (prop === 'sort') {
                    return function sort(compareFn) {
                        const ret = target.sort(compareFn);
                        return writeArray(ret);
                    };
                }
                else if (prop === 'reverse') {
                    return function reverse() {
                        const ret = target.reverse();
                        return writeArray(ret);
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
                    // Add item to cache collection
                    target[childRef.key] = item;
                    // // Add it to the database, return promise
                    // return childRef.set(item);
                    context.flag('write', context.target.concat(childRef.key)); //(childRef, item);
                    return childRef.key;
                };
            }
            else if (typeof value === 'undefined') { //(!(prop in target)) {
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
            // Set cached value:
            target[prop] = value;
            if (context.target.some(key => typeof key === 'number')) {
                // Updating an object property inside an array. Flag the first array in target to be written.
                // Eg: when chat.members === [{ name: 'Ewout', id: 'someid' }]
                // --> chat.members[0].name = 'Ewout' --> Rewrite members array instead of chat/members[0]/name
                context.flag('write', context.target.slice(0, context.target.findIndex(key => typeof key === 'number')));
            }
            else if (target instanceof Array) {
                // Flag the entire array to be overwritten
                context.flag('write', context.target); //(targetRef, target);
            }
            else {
                // Flag child property
                context.flag('write', context.target.concat(prop)); //(targetRef.child(prop), value);
            }
            return true;
        },
        deleteProperty(target, prop) {
            target = getTargetValue(context.root.cache, context.target);
            if (typeof prop === 'symbol') {
                return Reflect.deleteProperty(target, prop);
            }
            delete target[prop];
            context.flag('write', context.target.concat(prop));
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
