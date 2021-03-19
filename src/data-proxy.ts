import { cloneObject } from './utils';
import { DataReference } from './data-reference';
import { DataSnapshot, IDataMutationsArray, MutationsDataSnapshot } from './data-snapshot';
import { PathReference } from './path-reference';
import type { ILiveDataProxyTransaction, ILiveDataProxyValue } from '../types/data-proxy';
import { EventSubscription } from './subscription';
import { ID } from './id';
import { getObservable } from './optional-observable';
import process from './process';

class RelativeNodeTarget extends Array<number|string> {
    static areEqual(t1: RelativeNodeTarget, t2: RelativeNodeTarget) {
        return t1.length === t2.length && t1.every((key, i) => t2[i] === key);
    }
    static isAncestor(ancestor: RelativeNodeTarget, other: RelativeNodeTarget) {
        return ancestor.length < other.length && ancestor.every((key, i) => other[i] === key);
    }
    static isDescendant(descendant: RelativeNodeTarget, other: RelativeNodeTarget) {
        return descendant.length > other.length && other.every((key, i) => descendant[i] === key);
    }
}
const isProxy = Symbol('isProxy');
interface IProxyContext {
    acebase_proxy: { id: string, source: string }
}

type ProxyObserveMutationsCallback = (mutationSnapshot: DataSnapshot, isRemoteChange: boolean) => any
type ProxyObserveErrorCallback = (error: { source: string, message: string, details: Error }) => any

export interface ILiveDataProxy<T> {
    /**
     * The live value of the data wrapped in a Proxy
     */
    value: T
    /**
     * Whether the loaded value exists in the database
     */
    readonly hasValue: boolean
    /**
     * Releases used resources and stops monitoring changes. Equivalent to .stop()
     */
    destroy(): void
    /**
     * Releases used resources and stops monitoring changes. Equivalent to .destroy() but sounds more civilized.
     */
    stop(): void
    /**
     * Manually reloads current value when cache is out of sync, which should only be able to happen if an 
     * AceBaseClient is used without cache database, and the connection to the server was lost for a while. 
     * In all other cases, there should be no need to call this method.
     */
    reload(): Promise<void>
    /**
     * Registers a callback function to call when the underlying data is being changed. This is optional.
     * @param callback function to invoke when data is changed
     */
    onMutation(callback: ProxyObserveMutationsCallback): void
    /**
     * Registers a callback function to call when an error occurs behind the scenes
     * @param callback 
     */
    onError(callback: ProxyObserveErrorCallback): void
}

export class LiveDataProxy {
    /**
     * Creates a live data proxy for the given reference. The data of the reference's path will be loaded, and kept in-sync
     * with live data by listening for 'mutated' events. Any changes made to the value by the client will be synced back
     * to the database.
     * @param ref DataReference to create proxy for.
     * @param defaultValue Default value to use for the proxy if the database path does not exist yet. This value will also
     * be written to the database.
     */
    static async create<T>(ref: DataReference, defaultValue: T) : Promise<ILiveDataProxy<T>> {
        ref = new DataReference(ref.db, ref.path); // Use copy to prevent context pollution on original reference
        let cache, loaded = false;
        let proxy:ILiveDataProxyValue<T>;
        const proxyId = ID.generate(); //ref.push().key;
        let onMutationCallback: ProxyObserveMutationsCallback;
        let onErrorCallback: ProxyObserveErrorCallback = err => {
            console.error(err.message, err.details);
        };
        const clientSubscriptions:Array<{ target: RelativeNodeTarget, subscription: EventSubscription, callback: (value: any, previous: any, isRemote: boolean, context: any) => void|boolean }> = []; //, snapshot?: any

        const applyChange = (keys: RelativeNodeTarget, newValue: any) => {
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
                target instanceof Array ? target.splice(prop as number, 1) : delete target[prop];                    
            }
            else {
                // Set or update it
                target[prop] = newValue;
            }
            return true;
        };

        // Subscribe to mutations events on the target path
        const subscription = ref.on('mutations').subscribe(async (snap: MutationsDataSnapshot) => {
            if (!loaded) { 
                return;
            }
            const context:IProxyContext = snap.context();
            const isRemote = context.acebase_proxy?.id !== proxyId;
            if (!isRemote) {
                return; // Update was done through this proxy, no need to update cache
            }
            const mutations:IDataMutationsArray = snap.val(false);
            const proceed = mutations.every(mutation => {
                if (!applyChange(mutation.target, mutation.val)) {
                    return false;
                }
                if (onMutationCallback) {
                    const changeRef = mutation.target.reduce((ref, key) => ref.child(key), ref);
                    const changeSnap = new (DataSnapshot as any)(changeRef, mutation.val, false, mutation.prev);
                    onMutationCallback(changeSnap, isRemote);
                }
                return true;
            });
            if (!proceed) {
                console.warn(`Cached value of live data proxy on "${ref.path}" appears outdated, will be reloaded`);
                await reload();
            }
        });

        // Setup updating functionality: enqueue all updates, process them at next tick in the order they were issued 
        let processPromise:Promise<any> = Promise.resolve();
        const mutationQueue:Array<{ target: RelativeNodeTarget, previous: any, value: any }> = [];
        const transactions:Array<{ target: RelativeNodeTarget }> = [];

        const pushLocalMutations = async () => {
            // Sync all local mutations that are not in a transaction
            const mutations:typeof mutationQueue = [];
            for (let i = 0, m = mutationQueue[0]; i < mutationQueue.length; i++, m = mutationQueue[i]) {
                if (!transactions.find(t => RelativeNodeTarget.areEqual(t.target, m.target) || RelativeNodeTarget.isAncestor(t.target, m.target))) {
                    mutationQueue.splice(i, 1);
                    i--;
                    mutations.push(m);
                }
            }
            
            if (mutations.length === 0) {
                return;
            }

            // Run local onMutation & onChange callbacks in the next tick
            process.nextTick(() => {
                // Run onMutation callback for each changed node
                if (onMutationCallback) {
                    mutations.forEach(mutation => {
                        mutation.value = cloneObject(getTargetValue(cache, mutation.target));
                        const mutationRef = mutation.target.reduce((ref, key) => ref.child(key), ref);
                        const mutationSnap = new DataSnapshot(mutationRef, mutation.value, false, mutation.previous);
                        onMutationCallback(mutationSnap, false);
                    });
                }

                // Execute local onChange subscribers
                clientSubscriptions
                .filter(s => mutations.some(m => RelativeNodeTarget.areEqual(s.target, m.target) || RelativeNodeTarget.isAncestor(s.target, m.target)))
                .forEach(s => {
                    const currentValue = cloneObject(getTargetValue(cache, s.target));
                    let previousValue = cloneObject(currentValue);

                    // replay mutations in reverse order to reconstruct previousValue 
                    mutations
                    .filter(m => RelativeNodeTarget.areEqual(s.target, m.target) || RelativeNodeTarget.isAncestor(s.target, m.target))
                    .reverse()
                    .forEach(m => {
                        const relTarget = m.target.slice(s.target.length);
                        if (relTarget.length === 0) {
                            previousValue = m.previous;
                        }
                        else {
                            try {
                                setTargetValue(previousValue, relTarget, m.previous);
                            }
                            catch(err) {
                                onErrorCallback({ source: 'local_update', message: `Failed to reconstruct previous value`, details: err });
                            }
                        }
                    });

                    // Run subscriber callback
                    let keepSubscription = true;
                    try {
                        keepSubscription = false !== s.callback(Object.freeze(currentValue), Object.freeze(previousValue), false, { acebase_proxy: { id: proxyId, source: 'local_update' } });
                    }
                    catch(err) {
                        onErrorCallback({ source: 'local_update', message: `Error running subscription callback`, details: err });
                    }
                    if (!keepSubscription) {
                        s.subscription.stop();
                        clientSubscriptions.splice(clientSubscriptions.findIndex(cs => cs.subscription === s.subscription), 1);
                    }                
                });
            });

            // Update database async
            const batchId = ID.generate();
            processPromise = mutations
            .reduce((mutations, m, i, arr) => {
                // Only keep top path mutations
                if (!arr.some(other => RelativeNodeTarget.isAncestor(other.target, m.target))) {
                    mutations.push(m);
                }
                return mutations;
            }, <typeof mutations>[])
            .reduce((updates, m, i, arr) => {
                // Prepare db updates
                const target = m.target;
                if (target.length === 0) {
                    // Overwrite this proxy's root value
                    updates.push({ ref, value: cache, type: 'set' });
                }
                else {
                    const parentTarget = target.slice(0,-1); 
                    const key = target.slice(-1)[0];
                    const parentRef = parentTarget.reduce((ref, key) => ref.child(key), ref);
                    const parentUpdate = updates.find(update => update.ref.path === parentRef.path);
                    const cacheValue = getTargetValue(cache, target);
                    if (parentUpdate) {
                        parentUpdate.value[key] = cacheValue;
                    }
                    else {
                        updates.push({ ref: parentRef, value: { [key]: cacheValue }, type: 'update'});
                    }
                }
                return updates;
            }, [] as { ref: DataReference, value: any, type:'set'|'update' }[])
            .reduce(async (promise:Promise<any>, update, i, updates) => {
                // Execute db update
                // i === 0 && console.log(`Proxy: processing ${updates.length} db updates to paths:`, updates.map(update => update.ref.path));
                await promise;
                return update.ref
                .context(<IProxyContext>{ acebase_proxy: { id: proxyId, source: 'update', update_id: ID.generate(), batch_id: batchId, batch_updates: updates.length } })
                [update.type](update.value) // .set or .update
                .catch(err => {
                    onErrorCallback({ source: 'update', message: `Error processing update of "/${ref.path}"`, details: err });
                });
            }, processPromise);

            await processPromise;
        };

        let syncInProgress = false;
        const syncPromises = [];
        const syncCompleted = () => {
            let resolve;
            const promise = new Promise(rs => resolve = rs);
            syncPromises.push({ resolve });
            return promise;
        }
        let processQueueTimeout = null;
        const scheduleSync = () => {
            if (!processQueueTimeout) {
                processQueueTimeout = setTimeout(async () => {
                    syncInProgress = true;
                    processQueueTimeout = null;
                    await pushLocalMutations();
                    syncInProgress = false;
                    syncPromises.splice(0).forEach(p => p.resolve());
                }, 0);
            }
        };

        const flagOverwritten = (target: RelativeNodeTarget) => {
            if (!mutationQueue.find(m => RelativeNodeTarget.areEqual(m.target, target))) {
                mutationQueue.push({ target, previous: cloneObject(getTargetValue(cache, target)), value: null });
            }

            // schedule database updates
            scheduleSync();
        };
        const addOnChangeHandler = (target: RelativeNodeTarget, callback: (value: any, previous: any, isRemote: boolean, context: any) => void|boolean) => {
            const targetRef = getTargetRef(ref, target);
            const subscription = targetRef.on('mutations').subscribe(async (snap: MutationsDataSnapshot) => {
                const context:IProxyContext = snap.context();
                const isRemote = context.acebase_proxy?.id !== proxyId;
                if (!isRemote) {
                    // Any local changes already triggered subscription callbacks
                    return;
                }

                // Construct previous value from snapshot
                const currentValue = getTargetValue(cache, target);
                let newValue = cloneObject(currentValue);
                let previousValue = cloneObject(newValue);
                // const mutationPath = snap.ref.path;
                const mutations:Array<{ target: RelativeNodeTarget, val: any, prev: any }> = snap.val(false);
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
                            if (val[key] === null) { delete val[key]; }
                            prev[key] = mutation.prev;
                            if (prev[key] === null) { delete prev[key]; }
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
            clientSubscriptions.push({ target, subscription, callback });
            return { stop };
        };

        const handleFlag = (flag: 'write'|'onChange'|'subscribe'|'observe'|'transaction', target: Array<string|number>, args: any) => {
            if (flag === 'write') {
                return flagOverwritten(target);
            }
            else if (flag === 'onChange') {
                return addOnChangeHandler(target, args.callback);
            }
            else if (flag === 'subscribe' || flag === 'observe') {
                const subscribe = subscriber => {
                    const currentValue = getTargetValue(cache, target);
                    subscriber.next(currentValue);
                    const subscription = addOnChangeHandler(target, (value, previous, isRemote, context) => {
                        subscriber.next(value);
                    });
                    return function unsubscribe() {
                        subscription.stop();
                    }
                };
                if (flag === 'subscribe') {
                    return subscribe;
                }
                // Try to load Observable
                const Observable = getObservable();
                return new Observable(subscribe);
            }
            else if (flag === 'transaction') {
                const hasConflictingTransaction = transactions.some(t => RelativeNodeTarget.areEqual(target, t.target) || RelativeNodeTarget.isAncestor(target, t.target) || RelativeNodeTarget.isDescendant(target, t.target));
                if (hasConflictingTransaction) {
                    // TODO: Wait for this transaction to finish, then try again
                    return Promise.reject(new Error('Cannot start transaction because it conflicts with another transaction'));
                }
                return new Promise(async resolve => {
                    // If there are pending mutations on target (or deeper), wait until they have been synchronized
                    const hasPendingMutations = mutationQueue.some(m => RelativeNodeTarget.areEqual(target, m.target) || RelativeNodeTarget.isAncestor(target, m.target))
                    if (hasPendingMutations) {
                        if (!syncInProgress) { scheduleSync(); }
                        await syncCompleted();
                    }
                    const tx:{ target: RelativeNodeTarget, status:'started'|'finished'|'canceled', transaction: ILiveDataProxyTransaction } = { target, status: 'started', transaction: null };
                    transactions.push(tx);
                    tx.transaction = {
                        get status() { return tx.status; },
                        get completed() { return tx.status !== 'started'; },
                        get mutations() {
                            return mutationQueue.filter(m => RelativeNodeTarget.areEqual(tx.target, m.target) || RelativeNodeTarget.isAncestor(tx.target, m.target));
                        },
                        get hasMutations() {
                            return this.mutations.length > 0;
                        },
                        async commit() {
                            if (this.completed) { throw new Error(`Transaction has completed already (status '${tx.status}')`); }
                            tx.status = 'finished';
                            transactions.splice(transactions.indexOf(tx), 1);
                            if (syncInProgress) {
                                // Currently syncing without our mutations
                                await syncCompleted();
                            }
                            scheduleSync();
                            await syncCompleted();
                        },
                        rollback() {
                            // Remove mutations from queue
                            if (this.completed) { throw new Error(`Transaction has completed already (status '${tx.status}')`); }
                            tx.status = 'canceled';
                            const mutations:typeof mutationQueue = [];
                            for (let i = 0; i < mutationQueue.length; i++) {
                                const m = mutationQueue[i];
                                if (RelativeNodeTarget.areEqual(tx.target, m.target) || RelativeNodeTarget.isAncestor(tx.target, m.target)) {
                                    mutationQueue.splice(i, 1);
                                    i--;
                                    mutations.push(m);
                                }
                            }
                            // Replay mutations in reverse order
                            mutations.reverse()
                            .forEach(m => {
                                if (m.target.length === 0) {
                                    cache = m.previous;
                                }
                                else {
                                    setTargetValue(cache, m.target, m.previous);
                                }
                            });  
                            // Remove transaction                      
                            transactions.splice(transactions.indexOf(tx), 1);
                        }
                    };
                    resolve(tx.transaction);
                })
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
            await ref
                .context(<IProxyContext>{ acebase_proxy: { id: proxyId, source: 'defaultvalue', update_id: ID.generate() } })
                .set(cache);
        }
    
        proxy = createProxy<T>({ root: { ref, get cache() { return cache; } }, target: [], id: proxyId, flag: handleFlag });

        const assertProxyAvailable = () => {
            if (proxy === null) { throw new Error(`Proxy was destroyed`); }
        };
        const reload = async () => {
            // Manually reloads current value when cache is out of sync, which should only 
            // be able to happen if an AceBaseClient is used without cache database, 
            // and the connection to the server was lost for a while. In all other cases, 
            // there should be no need to call this method.
            assertProxyAvailable();
            mutationQueue.splice(0); // Remove pending mutations. Will be empty in production, but might not be while debugging, leading to weird behaviour.
            const newSnap = await ref.get();
            cache = newSnap.val();
            newSnap.ref.context(<IProxyContext>{ acebase_proxy: { id: proxyId, source: 'reload' } });
            onMutationCallback && onMutationCallback(newSnap, true);
            // TODO: run all other subscriptions
        };

        let waitingForReconnectSync = false; // Prevent quick connect/disconnect pulses to stack sync_done event handlers
        ref.db.on('disconnect', () => {
            // Handle disconnect, can only happen when connected to a remote server with an AceBaseClient
            // Wait for server to connect again
            ref.db.once('connect', () => {
                // We're connected again
                // Now wait for sync_end event, so any proxy changes will have been pushed to the server
                if (waitingForReconnectSync || proxy === null) { return; }
                waitingForReconnectSync = true;
                ref.db.once('sync_done', () => {
                    // Reload proxy value now
                    waitingForReconnectSync = false;
                    if (proxy === null) { return; }
                    console.log(`Reloading proxy value after connect & sync`);
                    reload();
                });
            });
        });
    
        return { 
            async destroy() {
                await processPromise;
                const promises = [
                    subscription.stop(),
                    ...clientSubscriptions.map(cs => cs.subscription.stop())
                ];
                await Promise.all(promises);
                cache = null; // Remove cache
                proxy = null;
            },
            stop() {
                this.destroy();
            },
            get value() {
                assertProxyAvailable();
                return proxy as any as T;
            },
            get hasValue() {
                assertProxyAvailable();
                return cache !== null;
            },
            set value(val) {
                // Overwrite the value of the proxied path itself!
                assertProxyAvailable();
                if (val !== null && typeof val === 'object' && val[isProxy]) { 
                    // Assigning one proxied value to another
                    val = val.valueOf() as T;
                }
                flagOverwritten([]);
                cache = val;
            },
            reload,
            onMutation(callback: ProxyObserveMutationsCallback) {
                // Fires callback each time anything changes
                assertProxyAvailable();
                onMutationCallback = (...args) => {
                    try { callback(...args); }
                    catch(err) { 
                        onErrorCallback({ source: 'mutation_callback', message: 'Error in dataproxy onMutation callback', details: err });
                    }
                };
            },
            onError(callback: ProxyObserveErrorCallback) {
                // Fires callback each time anything goes wrong
                assertProxyAvailable();
                onErrorCallback = (...args) => {
                    try { callback(...args); }
                    catch(err) { console.error(`Error in dataproxy onError callback: ${err.message}`); }
                }
            }
        }
    }
}

function getTargetValue(obj: any, target: RelativeNodeTarget) {
    let val = obj;
    for (let key of target) { val = typeof val === 'object' && val !== null && key in val ? val[key] : null; }
    return val;
}
function setTargetValue(obj: any, target: RelativeNodeTarget, value: any) {
    if (target.length === 0) {
        throw new Error(`Cannot update root target, caller must do that itself!`);
    }
    const targetObject = target.slice(0, -1).reduce((obj, key) => obj[key], obj);
    const prop = target.slice(-1)[0];
    if (value === null || typeof value === 'undefined') {
        // Remove it
        targetObject instanceof Array ? targetObject.splice(prop as number, 1) : delete targetObject[prop];                    
    }
    else {
        // Set or update it
        targetObject[prop] = value;
    }
}
function getTargetRef(ref: DataReference, target: RelativeNodeTarget) {
    let targetRef = ref;
    for (let key of target) { targetRef = targetRef.child(key); }
    return targetRef;
}

function createProxy<T>(context: { root: { ref: DataReference, readonly cache: any }, target: RelativeNodeTarget, id: string, flag(flag:'write'|'onChange'|'subscribe'|'observe'|'transaction', target: RelativeNodeTarget, args?: any): void }): ILiveDataProxyValue<T> {
    const targetRef = getTargetRef(context.root.ref, context.target);
    const childProxies:{ typeof: string, prop: string|number, value: any }[] = [];

    const handler:ProxyHandler<any> = {
        get(target, prop:string|symbol|number, receiver) {
            target = getTargetValue(context.root.cache, context.target);
            if (typeof prop === 'symbol') { 
                if (prop.toString() === Symbol.iterator.toString()) {
                    // Use .values for @@iterator symbol
                    prop = 'values';
                }
                else if (prop.toString() === isProxy.toString()) { 
                    return true; 
                }
                else {
                    return Reflect.get(target, prop, receiver);
                }
            }
            
            if (prop === 'valueOf') {
                return function valueOf() { return target; }; 
            }            
            if (target === null || typeof target !== 'object') {
                throw new Error(`Cannot read property "${prop}" of ${target}. Value of path "/${targetRef.path}" is not an object (anymore)`);
            }
            if (target instanceof Array && typeof prop === 'string' && /^[0-9]+$/.test(prop)) {
                // Proxy type definitions say prop can be a number, but this is never the case.
                prop = parseInt(prop);
            }

            const value = target[prop];
            if (value === null) {
                // Removed property. Should never happen, but if it does:
                delete target[prop];
                return; // undefined
            }

            // Check if we have a child proxy for this property already.
            // If so, and the properties' typeof value did not change, return that
            const childProxy = childProxies.find(proxy => proxy.prop === prop);
            if (childProxy) {
                if (childProxy.typeof === typeof value) { return childProxy.value; }
                childProxies.splice(childProxies.indexOf(childProxy), 1);
            }

            const proxifyChildValue = (prop: string|number) => {
                const value = target[prop]; //
                let childProxy = childProxies.find(child => child.prop === prop);
                if (childProxy) {
                    if (childProxy.typeof === typeof value) { return childProxy.value; }
                    childProxies.splice(childProxies.indexOf(childProxy), 1);
                }
                if (typeof value !== 'object') {
                    // Can't proxify non-object values
                    return value;
                }
                const newChildProxy = createProxy({ root: context.root, target: context.target.concat(prop), id: context.id, flag: context.flag });
                childProxies.push({ typeof: typeof value, prop, value: newChildProxy });
                return newChildProxy as ILiveDataProxyValue<any>;
            };
            const unproxyValue = (value: any) => {
                return value !== null && typeof value === 'object' && value[isProxy] 
                    ? (value as ILiveDataProxyValue<any>).getTarget() 
                    : value;
            };

            // If the property contains a simple value, return it. 
            if (['string','number','boolean'].includes(typeof value) 
                || value instanceof Date 
                || value instanceof PathReference 
                || value instanceof ArrayBuffer 
                || (typeof value === 'object' && 'buffer' in value) // Typed Arrays
            ) {
                return value;
            }

            const isArray = target instanceof Array;

            if (prop === 'toString') {
                return function toString() {
                    return `[LiveDataProxy for "${targetRef.path}"]`;
                };
            }
            if (typeof value === 'undefined') {
                if (prop === 'push') {
                    // Push item to an object collection
                    return function push(item: any) {
                        const childRef = targetRef.push();
                        context.flag('write', context.target.concat(childRef.key)); //, { previous: null }
                        target[childRef.key] = item;
                        return childRef.key;
                    };
                }
                if (prop === 'getTarget') {
                    // Get unproxied readonly (but still live) version of data.
                    return function(warn: boolean = true) {
                        warn && console.warn(`Use getTarget with caution - any changes will not be synchronized!`);
                        return target;
                    };
                }
                if (prop === 'getRef') {
                    // Gets the DataReference to this data target
                    return function getRef() {
                        const ref = getTargetRef(context.root.ref, context.target);
                        return ref;
                    };
                }
                if (prop === 'forEach') {
                    return function forEach(callback: (child: any, key: string, index: number) => void|boolean) {
                        const keys = Object.keys(target);
                        // Fix: callback with unproxied value
                        let stop = false;
                        for(let i = 0; !stop && i < keys.length; i++) {
                            const key = keys[i];
                            const value = proxifyChildValue(key); //, target[key]
                            stop = callback(value, key, i) === false;
                        }
                    };
                }
                if (['values','entries','keys'].includes(prop as string)) {
                    return function* generator() {
                        const keys = Object.keys(target);
                        for (let key of keys) {
                            if (prop === 'keys') {
                                yield key;
                            }
                            else {
                                const value = proxifyChildValue(key); //, target[key]
                                if (prop === 'entries') {
                                    yield [key, value];
                                }
                                else {
                                    yield value;
                                }
                            }
                        }
                    };
                }
                if (prop === 'toArray') {
                    return function toArray<T>(sortFn?: (a:T, b:T) => number) {
                        const arr = Object.keys(target).map(key => proxifyChildValue(key)); //, target[key]
                        if (sortFn) { arr.sort(sortFn); }
                        return arr;
                    };
                }
                if (prop === 'onChanged') {
                    // Starts monitoring the value
                    return function onChanged(callback: (value: any, previous: any, isRemote: boolean, context: any) => void|boolean) {
                        return context.flag('onChange', context.target, { callback });
                    };
                }
                if (prop === 'subscribe') {
                    // Gets subscriber function to use with Observables, or custom handling
                    return function subscribe() {
                        return context.flag('subscribe', context.target);
                    };
                }
                if (prop === 'getObservable') {
                    // Creates an observable for monitoring the value
                    return function getObservable() {
                        return context.flag('observe', context.target);
                    };
                }
                if (prop === 'startTransaction') {
                    return function startTransaction() {
                        return context.flag('transaction', context.target);
                    };
                }
                if (prop === 'remove' && !isArray) {
                    // Removes target from object collection
                    return function remove() {
                        if (context.target.length === 0) { throw new Error(`Can't remove proxy root value`); }
                        const parent = getTargetValue(context.root.cache, context.target.slice(0, -1));
                        const key = context.target.slice(-1)[0];
                        context.flag('write', context.target);
                        delete parent[key];
                    };
                }
                return; // undefined
            }
            else if (typeof value === 'function') {
                if (isArray) {
                    // Handle array methods
                    const writeArray = (action: () => any) => {
                        context.flag('write', context.target);
                        return action();
                    };
                    const cleanArrayValues = values => values.map(value => {
                        value = unproxyValue(value);
                        removeVoidProperties(value);
                        return value;
                    });

                    // Methods that directly change the array:
                    if (prop === 'push') {
                        return function push(...items) {
                            items = cleanArrayValues(items);
                            return writeArray(() => target.push(...items)); // push the items to the cache array
                        };
                    }
                    if (prop === 'pop') {
                        return function pop() {
                            return writeArray(() => target.pop());
                        };
                    }
                    if (prop === 'splice') {
                        return function splice(start: number, deleteCount?: number, ...items) {
                            items = cleanArrayValues(items);
                            return writeArray(() => target.splice(start, deleteCount, ...items));
                        };
                    }
                    if (prop === 'shift') {
                        return function shift() {
                            return writeArray(() => target.shift());
                        };
                    }
                    if (prop === 'unshift') {
                        return function unshift(...items) {
                            items = cleanArrayValues(items);
                            return writeArray(() => target.unshift(...items));
                        };
                    }
                    if (prop === 'sort') {
                        return function sort(compareFn?: (a, b) => number) {
                            return writeArray(() => target.sort(compareFn));
                        };
                    }
                    if (prop === 'reverse') {
                        return function reverse() {
                            return writeArray(() => target.reverse());
                        };
                    }
                    
                    // Methods that do not change the array themselves, but
                    // have callbacks that might, or return child values:
                    if (['indexOf','lastIndexOf'].includes(prop as string)) {
                        return function indexOf(item: any, start: number) {
                            if (item !== null && typeof item === 'object' && item[isProxy]) {
                                // Use unproxied value, or array.indexOf will return -1 (fixes issue #1)
                                item = item.getTarget(false);
                            }
                            return target[prop as ArrayIndexOfMethod](item, start);
                        };
                    }                    
                    if (['forEach','every','some','filter','map'].includes(prop as string)) {
                        return function iterate(callback: (child: any, index: number, arr: any[]) => any) {
                            return target[prop as ArrayIterateMethod]((value, i) => {
                                return callback(proxifyChildValue(i), i, proxy); //, value
                            });
                        };
                    }
                    if (['reduce','reduceRight'].includes(prop as string)) {
                        return function reduce(callback: (previousValue: any, currentValue: any, currentIndex: number, array: any[]) => any) {
                            return target[prop as ArrayReduceMethod]((prev, value, i) => {
                                return callback(prev, proxifyChildValue(i), i, proxy); //, value
                            });
                        };
                    }
                    if (['find','findIndex'].includes(prop as string)) {
                        return function find(callback: (value: any, index: number, array: any[]) => any) {
                            let value = target[prop as ArrayFindMethod]((value, i) => {
                                return callback(proxifyChildValue(i), i, proxy) // , value
                            });
                            if (prop === 'find' && value) {
                                let index = target.indexOf(value);
                                value = proxifyChildValue(index); //, value
                            }
                            return value;
                        };
                    }
                    if (['values','entries','keys'].includes(prop as string)) {
                        return function* generator() {
                            for (let i = 0; i < target.length; i++) {
                                if (prop === 'keys') {
                                    yield i;
                                }
                                else {
                                    const value = proxifyChildValue(i); //, target[i]
                                    if (prop === 'entries') {
                                        yield [i, value];
                                    }
                                    else {
                                        yield value;
                                    }
                                }
                            }
                        };
                    }
                }
                // Other function (or not an array), should not alter its value
                // return function fn(...args) {
                //     return target[prop](...args);
                // }
                return value;
            }
            
            // Proxify any other value
            return proxifyChildValue(prop); //, value
        },

        set(target, prop:string|symbol|number, value, receiver) {
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
                if (!/^[0-9]+$/.test(prop)) { throw new Error(`Cannot set property "${prop}" on array value of path "/${targetRef.path}"`); }
                prop = parseInt(prop);
            }

            if (value !== null) {
                if (typeof value === 'object' && value[isProxy]) {
                    // Assigning one proxied value to another
                    value = value.getTarget(false);
                }
                else if (typeof value === 'object' && Object.isFrozen(value)) {
                    // Create a copy to unfreeze it
                    value = cloneObject(value);
                }
                
                if (typeof value !== 'object' && target[prop] === value) {
                    // not changing the actual value, ignore
                    return true;
                }
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
            if (value === null) {
                delete target[prop];
            }
            else {
                removeVoidProperties(value);
                target[prop] = value;
            }
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
    const proxy = new Proxy({}, handler) as any;
    return proxy;
}

function removeVoidProperties(obj: any) {
    if (typeof obj !== 'object') { return; }
    Object.keys(obj).forEach(key => {
        const val = obj[key];
        if (val === null || typeof val === 'undefined') {
            delete obj[key];
        }
        else if (typeof val === 'object') {
            removeVoidProperties(val);
        }
    });
}

export function proxyAccess<T>(proxiedValue: T): ILiveDataProxyValue<T> {
    if (typeof proxiedValue !== 'object' || !proxiedValue[isProxy]) { throw new Error(`Given value is not proxied. Make sure you are referencing the value through the live data proxy.`); }
    return proxiedValue as any as ILiveDataProxyValue<T>;
}
type ArrayIterateMethod = 'forEach'|'every'|'some'|'filter'|'map';
type ArrayIndexOfMethod = 'indexOf'|'lastIndexOf'
type ArrayReduceMethod = 'reduce'|'reduceRight'
type ArrayFindMethod = 'find'|'findIndex'
