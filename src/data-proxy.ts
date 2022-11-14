import { cloneObject, getMutations, valuesAreEqual } from './utils';
import { DataReference } from './data-reference';
import { DataSnapshot, IDataMutationsArray, MutationsDataSnapshot } from './data-snapshot';
import { PathReference } from './path-reference';
import { ID } from './id';
import { getObservable, IObservableLike } from './optional-observable';
import type { Observable } from './optional-observable';
import process from './process';
import type { ObjectCollection } from './object-collection';
import { PathInfo } from './path-info';
import { SimpleEventEmitter } from './simple-event-emitter';
import type { EventSubscription } from './subscription';

class RelativeNodeTarget extends Array<number | string> {
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
    acebase_cursor?: string;
    acebase_proxy: { id: string; source: string };
}

type ProxyObserveMutation = { snapshot: DataSnapshot, isRemote: boolean };
type ProxyObserveMutationsCallback = (mutationSnapshot: DataSnapshot, isRemoteChange: boolean) => any

type ProxyObserveError = { source: string, message: string, details: Error };
type ProxyObserveErrorCallback = (error: ProxyObserveError) => any

export interface ILiveDataProxy<T> {
    /**
     * The live value of the data wrapped in a Proxy
     */
    value: T; // Consider: T & ILiveDataProxyValue<T> // Adds proxy methods for first child of proxied value, not for deeper properties

    /**
     * Whether the loaded value exists in the database
     */
    readonly hasValue: boolean

    /**
     * Reference to the proxied data path
     */
    readonly ref: DataReference

    /**
     * Current cursor for the proxied data. If you are connected to a remote server with transaction logging enabled,
     * and your client has a cache database, you can use this cursor the next time you initialize this live data proxy.
     * If you do that, your local cache value will be updated with remote changes since your cursor, and the proxy will
     * load the updated value from cache instead of from the server. For larger datasets this greatly improves performance.
     *
     * Use `proxy.on('cursor', callback)` if you want to be notified of cursor updates.
     */
    readonly cursor: string;

    /**
     * Releases used resources and stops monitoring changes. Equivalent to `proxy.stop()`
     */
    destroy(): void

    /**
     * Releases used resources and stops monitoring changes. Equivalent to `proxy.destroy()` but sounds more civilized.
     */
    stop(): void

    /**
     * Manually reloads current value. Is automatically done after server reconnects if no cursor is available (after sync_done event has fired)
     */
    reload(): Promise<void>

    /**
     * @deprecated Use `.on('mutation', callback)`
     * Registers a callback function to call when the underlying data is being changed. This is optional.
     * @param callback function to invoke when data is changed
     * @see Also see onChanged event in {@link ILiveDataProxyValue<T>}
     */
    onMutation(callback: ProxyObserveMutationsCallback): void

    /**
     * Registers a callback function to call when an error occurs behind the scenes
     * @deprecated Use `.on('error', callback)`
     * @param callback
     */
    onError(callback: ProxyObserveErrorCallback): void

    /**
     * Registers a callback function to call each time the server cursor changes. This is very useful if you are connected
     * to a server with transaction logging enabled, and have a local cache database. You can store the cursor somewhere so
     * you can synchronize your local cache with the server at app restarts.
     */
    on(event: 'cursor', callback: (cursor: string) => any): void;

    /**
     * Registers a callback function to call when the underlying data is being changed. This is optional.
     * If you make changes to the proxy value in your callback function, make sure you are not creating an endless loop!
     * @param callback function to invoke when data is changed, `mutationSnapshot` contains a `DataSnapshot` of
     * the mutated target, `isRemoteChange` indicates whether the change was made through the proxy (`false`)
     * or outside the proxied object (`true`), eg through `ref.update(...)`
     */
    on(event: 'mutation', callback: (event: ProxyObserveMutation) => any): void;

    /**
     * Registers a callback function to call when an error occurs behind the scenes
     */
    on(event: 'error', callback: ProxyObserveErrorCallback): any;

    off(event: 'cursor'|'mutation'|'error', callback: (event: any) => any): void;
}

export interface LiveDataProxyOptions<ValueType> {
    /**
     * Default value to use for the proxy if the database path does not exist yet. This value will also be written to the database.
     */
    defaultValue?: ValueType
    /**
     * Cursor to use
     */
    cursor?: string
}
export class LiveDataProxy {
    /**
     * Creates a live data proxy for the given reference. The data of the reference's path will be loaded, and kept in-sync
     * with live data by listening for 'mutations' events. Any changes made to the value by the client will be synced back
     * to the database.
     * @param ref DataReference to create proxy for.
     * @param options proxy initialization options
     * be written to the database.
     */
    static async create<T>(ref: DataReference, options?: LiveDataProxyOptions<T>) : Promise<ILiveDataProxy<T>> {
        ref = new DataReference(ref.db, ref.path); // Use copy to prevent context pollution on original reference
        let cache: any, loaded = false;
        let latestCursor = options?.cursor;
        let proxy:ILiveDataProxyValue<T>;
        const proxyId = ID.generate(); //ref.push().key;
        // let onMutationCallback: ProxyObserveMutationsCallback;
        // let onErrorCallback: ProxyObserveErrorCallback = err => {
        //     console.error(err.message, err.details);
        // };
        const clientSubscriptions:Array<{ target: RelativeNodeTarget, stop(): void }> = [];
        const clientEventEmitter = new SimpleEventEmitter();
        clientEventEmitter.on('cursor', (cursor: string) => latestCursor = cursor);
        clientEventEmitter.on('error', (err: ProxyObserveError) => {
            console.error(err.message, err.details);
        });

        const applyChange = (keys: RelativeNodeTarget, newValue: any) => {
            // Make changes to cache
            if (keys.length === 0) {
                cache = newValue;
                return true;
            }
            const allowCreation = false; //cache === null; // If the proxy'd target did not exist upon load, we must allow it to be created now.
            if (allowCreation) {
                cache = typeof keys[0] === 'number' ? [] : {};
            }
            let target = cache;
            const trailKeys = keys.slice();
            while (trailKeys.length > 1) {
                const key = trailKeys.shift();
                if (!(key in target)) {
                    if (allowCreation) {
                        target[key] = typeof key === 'number' ? [] : {};
                    }
                    else {
                        // Have we missed an event, or are local pending mutations creating this conflict?
                        return false; // Do not proceed
                    }
                }
                target = target[key];
            }
            const prop = trailKeys.shift();
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
        const syncFallback = async () => {
            if (!loaded) { return; }
            await reload();
        };
        const subscription = ref.on('mutations', { syncFallback }).subscribe(async (snap: MutationsDataSnapshot) => {
            if (!loaded) {
                return;
            }
            const context:IProxyContext = snap.context();
            const isRemote = context.acebase_proxy?.id !== proxyId;
            if (!isRemote) {
                return; // Update was done through this proxy, no need to update cache or trigger local value subscriptions
            }
            const mutations:IDataMutationsArray = snap.val(false);
            const proceed = mutations.every(mutation => {
                if (!applyChange(mutation.target, mutation.val)) {
                    return false;
                }
                // if (onMutationCallback) {
                const changeRef = mutation.target.reduce((ref, key) => ref.child(key), ref);
                const changeSnap = new (DataSnapshot as any)(changeRef, mutation.val, false, mutation.prev, snap.context());
                // onMutationCallback(changeSnap, isRemote); // onMutationCallback uses try/catch for client callback
                clientEventEmitter.emit('mutation', <ProxyObserveMutation>{ snapshot: changeSnap, isRemote });
                // }
                return true;
            });
            if (proceed) {
                clientEventEmitter.emit('cursor', context.acebase_cursor); // // NOTE: cursor is only present in mutations done remotely. For our own updates, server cursors are returned by ref.set and ref.update
                localMutationsEmitter.emit('mutations', { origin: 'remote', snap });
            }
            else {
                console.warn(`Cached value of live data proxy on "${ref.path}" appears outdated, will be reloaded`);
                await reload();
            }
        });

        // Setup updating functionality: enqueue all updates, process them at next tick in the order they were issued
        let processPromise:Promise<any> = Promise.resolve();
        const mutationQueue:Array<{ target: RelativeNodeTarget, previous: any, value?: any }> = [];
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

            // Add current (new) values to mutations
            mutations.forEach(mutation => {
                mutation.value = cloneObject(getTargetValue(cache, mutation.target));
            });

            // Run local onMutation & onChange callbacks in the next tick
            process.nextTick(() => {

                // Run onMutation callback for each changed node
                const context:IProxyContext = { acebase_proxy: { id: proxyId, source: 'update' } };
                // if (onMutationCallback) {
                mutations.forEach(mutation => {
                    const mutationRef = mutation.target.reduce((ref, key) => ref.child(key), ref);
                    const mutationSnap = new DataSnapshot(mutationRef, mutation.value, false, mutation.previous, context);
                    // onMutationCallback(mutationSnap, false);
                    clientEventEmitter.emit('mutation', { snapshot: mutationSnap, isRemote: false });
                });
                // }

                // Notify local subscribers
                const snap = new MutationsDataSnapshot(ref, mutations.map(m => ({ target: m.target, val: m.value, prev: m.previous })), context);
                localMutationsEmitter.emit('mutations', { origin: 'local', snap });
            });

            // Update database async
            // const batchId = ID.generate();
            processPromise = mutations
                .reduce((mutations, m, i, arr) => {
                    // Only keep top path mutations to prevent unneccessary child path updates
                    if (!arr.some(other => RelativeNodeTarget.isAncestor(other.target, m.target))) {
                        mutations.push(m);
                    }
                    return mutations;
                }, <typeof mutations>[])
                .reduce((updates, m) => {
                    // Prepare db updates
                    const target = m.target;
                    if (target.length === 0) {
                    // Overwrite this proxy's root value
                        updates.push({ ref, target, value: cache, type: 'set', previous: m.previous });
                    }
                    else {
                        const parentTarget = target.slice(0,-1);
                        const key = target.slice(-1)[0];
                        const parentRef = parentTarget.reduce((ref, key) => ref.child(key), ref);
                        const parentUpdate = updates.find(update => update.ref.path === parentRef.path);
                        const cacheValue = getTargetValue(cache, target); // m.value?
                        const prevValue = m.previous;
                        if (parentUpdate) {
                            parentUpdate.value[key] = cacheValue;
                            parentUpdate.previous[key] = prevValue;
                        }
                        else {
                            updates.push({ ref: parentRef, target: parentTarget, value: { [key]: cacheValue }, type: 'update', previous: { [key]: prevValue } });
                        }
                    }
                    return updates;
                }, [] as { ref: DataReference, target: RelativeNodeTarget, value: any, type:'set'|'update', previous: any }[])
                .reduce(async (promise:Promise<any>, update /*, i, updates */) => {
                    // Execute db update
                    // i === 0 && console.log(`Proxy: processing ${updates.length} db updates to paths:`, updates.map(update => update.ref.path));
                    const context: IProxyContext = {
                        acebase_proxy: {
                            id: proxyId,
                            source: update.type,
                        // update_id: ID.generate(),
                        // batch_id: batchId,
                        // batch_updates: updates.length
                        },
                    };
                    await promise;
                    await update.ref
                        .context(context)
                        [update.type](update.value) // .set or .update
                        .catch(err => {
                            clientEventEmitter.emit('error', <ProxyObserveError>{ source: 'update', message: `Error processing update of "/${ref.path}"`, details: err });
                            // console.warn(`Proxy could not update DB, should rollback (${update.type}) the proxy value of "${update.ref.path}" to: `, update.previous);

                            const context:IProxyContext = { acebase_proxy: { id: proxyId, source: 'update-rollback' } };
                            const mutations:IDataMutationsArray = [];
                            if (update.type === 'set') {
                                setTargetValue(cache, update.target, update.previous);

                                const mutationSnap = new DataSnapshot(update.ref, update.previous, false, update.value, context);
                                clientEventEmitter.emit('mutation', { snapshot: mutationSnap, isRemote: false });

                                mutations.push({ target: update.target, val: update.previous, prev: update.value });
                            }
                            else {
                                // update
                                Object.keys(update.previous).forEach(key => {
                                    setTargetValue(cache, update.target.concat(key), update.previous[key]);

                                    const mutationSnap = new DataSnapshot(update.ref.child(key), update.previous[key], false, update.value[key], context);
                                    clientEventEmitter.emit('mutation', { snapshot: mutationSnap, isRemote: false });

                                    mutations.push({ target: update.target.concat(key), val: update.previous[key], prev: update.value[key] });
                                });
                            }

                            // Run onMutation callback for each node being rolled back
                            mutations.forEach(m => {
                                const mutationRef = m.target.reduce((ref, key) => ref.child(key), ref);
                                const mutationSnap = new DataSnapshot(mutationRef, m.val, false, m.prev, context);
                                clientEventEmitter.emit('mutation', { snapshot: mutationSnap, isRemote: false });
                            });

                            // Notify local subscribers:
                            const snap = new MutationsDataSnapshot(update.ref, mutations, context);
                            localMutationsEmitter.emit('mutations', { origin: 'local', snap });
                        });
                    if (update.ref.cursor) {
                    // Should also be available in context.acebase_cursor now
                        clientEventEmitter.emit('cursor', update.ref.cursor);
                    }
                }, processPromise);

            await processPromise;
        };

        let syncInProgress = false;
        const syncPromises = [] as Array<{ resolve: () => void }>;
        const syncCompleted = () => {
            let resolve;
            const promise = new Promise<void>(rs => resolve = rs);
            syncPromises.push({ resolve });
            return promise;
        };
        let processQueueTimeout: NodeJS.Timeout = null;
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
                mutationQueue.push({ target, previous: cloneObject(getTargetValue(cache, target)) });
            }

            // schedule database updates
            scheduleSync();
        };

        const localMutationsEmitter = new SimpleEventEmitter();
        const addOnChangeHandler = (target: RelativeNodeTarget, callback: (value: any, previous: any, isRemote: boolean, context: any) => void | boolean) => {

            const isObject = (val: any) => val !== null && typeof val === 'object';
            const mutationsHandler = async (details: { snap: MutationsDataSnapshot, origin: 'remote' | 'local' }) => {
                const { snap, origin } = details;
                const context:IProxyContext = snap.context();
                const causedByOurProxy = context.acebase_proxy?.id === proxyId;
                if (details.origin === 'remote' && causedByOurProxy) {
                    // Any local changes already triggered subscription callbacks
                    console.error('DEV ISSUE: mutationsHandler was called from remote event originating from our own proxy');
                    return;
                }

                const mutations = snap.val(false).filter(mutation => {
                    // Keep mutations impacting the subscribed target: mutations on target, or descendant or ancestor of target
                    return mutation.target.slice(0, target.length).every((key, i) => target[i] === key);
                });
                if (mutations.length === 0) { return; }

                let newValue: any, previousValue: any;
                // If there is a mutation on the target itself, or parent/ancestor path, there can only be one. We can take a shortcut
                const singleMutation = mutations.find(m => m.target.length <= target.length);
                if (singleMutation) {
                    const trailKeys = target.slice(singleMutation.target.length);
                    newValue = trailKeys.reduce((val, key) => !isObject(val) || !(key in val) ? null : val[key], singleMutation.val);
                    previousValue = trailKeys.reduce((val, key) => !isObject(val) || !(key in val) ? null : val[key], singleMutation.prev);
                }
                else {
                    // All mutations are on children/descendants of our target
                    // Construct new & previous values by combining cache and snapshot
                    const currentValue = getTargetValue(cache, target);
                    newValue = cloneObject(currentValue);
                    previousValue = cloneObject(newValue);
                    mutations.forEach(mutation => {
                        // mutation.target is relative to proxy root
                        const trailKeys = mutation.target.slice(target.length);
                        for (let i = 0, val = newValue, prev = previousValue; i < trailKeys.length; i++) { // arr = PathInfo.getPathKeys(mutationPath).slice(PathInfo.getPathKeys(targetRef.path).length)
                            const last = i + 1 === trailKeys.length, key = trailKeys[i];
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
                    });
                }

                process.nextTick(() => {
                    // Run callback with read-only (frozen) values in next tick
                    let keepSubscription = true;
                    try {
                        keepSubscription = false !== callback(Object.freeze(newValue), Object.freeze(previousValue), !causedByOurProxy, context);
                    }
                    catch(err) {
                        clientEventEmitter.emit('error', <ProxyObserveError>{ source: origin === 'remote' ? 'remote_update' : 'local_update', message: 'Error running subscription callback', details: err });
                    }
                    if (keepSubscription === false) {
                        stop();
                    }
                });
            };
            localMutationsEmitter.on('mutations', mutationsHandler);
            const stop = () => {
                localMutationsEmitter.off('mutations').off('mutations', mutationsHandler);
                clientSubscriptions.splice(clientSubscriptions.findIndex(cs => cs.stop === stop), 1);
            };
            clientSubscriptions.push({ target, stop });
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
                const subscribe: SubscribeFunction<any> = (subscriber) => {
                    const currentValue = getTargetValue(cache, target);
                    subscriber.next(currentValue);
                    const subscription = addOnChangeHandler(target, (value /*, previous, isRemote, context */) => {
                        subscriber.next(value);
                    });
                    return function unsubscribe() {
                        subscription.stop();
                    };
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
                    const hasPendingMutations = mutationQueue.some(m => RelativeNodeTarget.areEqual(target, m.target) || RelativeNodeTarget.isAncestor(target, m.target));
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
                        },
                    };
                    resolve(tx.transaction);
                });
            }
        };

        const snap = await ref.get({ cache_mode: 'allow', cache_cursor: options?.cursor });
        // const gotOfflineStartValue = snap.context().acebase_origin === 'cache';
        // if (gotOfflineStartValue) {
        //     console.warn(`Started data proxy with cached value of "${ref.path}", check if its value is reloaded on next connection!`);
        // }
        if (snap.context().acebase_origin !== 'cache') {
            clientEventEmitter.emit('cursor', ref.cursor ?? null); // latestCursor = snap.context().acebase_cursor ?? null;
        }
        loaded = true;
        cache = snap.val();
        if (cache === null && typeof options?.defaultValue !== 'undefined') {
            cache = options.defaultValue;
            const context:IProxyContext = {
                acebase_proxy: {
                    id: proxyId,
                    source: 'default',
                    // update_id: ID.generate()
                },
            };
            await ref.context(context).set(cache);
        }

        proxy = createProxy<T>({ root: { ref, get cache() { return cache; } }, target: [], id: proxyId, flag: handleFlag });

        const assertProxyAvailable = () => {
            if (proxy === null) { throw new Error('Proxy was destroyed'); }
        };
        const reload = async () => {
            // Manually reloads current value when cache is out of sync, which should only
            // be able to happen if an AceBaseClient is used without cache database,
            // and the connection to the server was lost for a while. In all other cases,
            // there should be no need to call this method.
            assertProxyAvailable();
            mutationQueue.splice(0); // Remove pending mutations. Will be empty in production, but might not be while debugging, leading to weird behaviour.
            const snap = await ref.get({ allow_cache: false });
            const oldVal = cache, newVal = snap.val();
            cache = newVal;

            // Compare old and new values
            const mutations = getMutations(oldVal, newVal);
            if (mutations.length === 0) {
                return; // Nothing changed
            }

            // Run onMutation callback for each changed node
            const context:IProxyContext = snap.context(); // context might contain acebase_cursor if server support that
            context.acebase_proxy = { id: proxyId, source: 'reload' };
            // if (onMutationCallback) {
            mutations.forEach(m => {
                const targetRef = getTargetRef(ref, m.target);
                const newSnap = new (DataSnapshot as any)(targetRef, m.val, m.val === null, m.prev, context);
                clientEventEmitter.emit('mutation', { snapshot: newSnap, isRemote: true });
            });
            // }

            // Notify local subscribers
            const mutationsSnap = new MutationsDataSnapshot(ref, mutations, context);
            localMutationsEmitter.emit('mutations', { origin: 'local', snap: mutationsSnap });
        };

        return {
            async destroy() {
                await processPromise;
                const promises = [
                    subscription.stop(),
                    ...clientSubscriptions.map(cs => cs.stop()),
                ];
                await Promise.all(promises);
                ['cursor','mutation','error'].forEach(event => clientEventEmitter.off(event));
                cache = null; // Remove cache
                proxy = null;
            },
            stop() {
                this.destroy();
            },
            get value() {
                assertProxyAvailable();
                return proxy as any as ILiveDataProxy<T>['value'];
            },
            get hasValue() {
                assertProxyAvailable();
                return cache !== null;
            },
            set value(val) {
                // Overwrite the value of the proxied path itself!
                assertProxyAvailable();
                if (val !== null && typeof val === 'object' && (val as any)[isProxy]) {
                    // Assigning one proxied value to another
                    val = val.valueOf() as ILiveDataProxy<T>['value'];
                }
                flagOverwritten([]);
                cache = val;
            },
            get ref() {
                return ref;
            },
            get cursor() {
                return latestCursor;
            },
            reload,
            onMutation(callback: ProxyObserveMutationsCallback) {
                // Fires callback each time anything changes
                assertProxyAvailable();
                clientEventEmitter.off('mutation'); // Mimic legacy behaviour that overwrites handler
                clientEventEmitter.on('mutation', ({ snapshot, isRemote }: ProxyObserveMutation) => {
                    try { callback(snapshot, isRemote); }
                    catch(err) {
                        clientEventEmitter.emit('error', { source: 'mutation_callback', message: 'Error in dataproxy onMutation callback', details: err });
                    }
                });
            },
            onError(callback: ProxyObserveErrorCallback) {
                // Fires callback each time anything goes wrong
                assertProxyAvailable();
                clientEventEmitter.off('error'); // Mimic legacy behaviour that overwrites handler
                clientEventEmitter.on('error', (err: ProxyObserveError) => {
                    try { callback(err); }
                    catch(err) { console.error(`Error in dataproxy onError callback: ${err.message}`); }
                });
            },
            on(event:'cursor'|'mutation'|'error', callback: (arg: any) => void) {
                clientEventEmitter.on(event, callback);
            },
            off(event:'cursor'|'mutation'|'error', callback: (arg: any) => void) {
                clientEventEmitter.off(event, callback);
            },
        };
    }
}

function getTargetValue(obj: any, target: RelativeNodeTarget) {
    let val = obj;
    for (const key of target) { val = typeof val === 'object' && val !== null && key in val ? val[key] : null; }
    return val;
}
function setTargetValue(obj: any, target: RelativeNodeTarget, value: any) {
    if (target.length === 0) {
        throw new Error('Cannot update root target, caller must do that itself!');
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
    // Create new DataReference to prevent context reuse
    const path = PathInfo.get(ref.path).childPath(target);
    return new DataReference(ref.db, path);
}

function createProxy<T>(context: { root: { ref: DataReference, readonly cache: any }, target: RelativeNodeTarget, id: string, flag(flag: 'write' | 'onChange' | 'subscribe' | 'observe' | 'transaction', target: RelativeNodeTarget, args?: any): any }): ILiveDataProxyValue<T> {
    const targetRef = getTargetRef(context.root.ref, context.target);
    const childProxies:{ typeof: string, prop: string | number, value: any }[] = [];

    const handler:ProxyHandler<any> = {
        get(target, prop: string | symbol | number, receiver) {
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
                const childProxy = childProxies.find(child => child.prop === prop);
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
                    return function(warn = true) {
                        warn && console.warn('Use getTarget with caution - any changes will not be synchronized!');
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
                        for (const key of keys) {
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
                if (prop === 'getOrderedCollection') {
                    return function getOrderedCollection(orderProperty?: string, orderIncrement?: number) {
                        return new OrderedCollectionProxy(this, orderProperty, orderIncrement);
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
                        if (context.target.length === 0) { throw new Error('Can\'t remove proxy root value'); }
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
                    const cleanArrayValues = (values: any) => values.map((value: any) => {
                        value = unproxyValue(value);
                        removeVoidProperties(value);
                        return value;
                    });

                    // Methods that directly change the array:
                    if (prop === 'push') {
                        return function push(...items: any[]) {
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
                        return function splice(start: number, deleteCount?: number, ...items: any[]) {
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
                        return function unshift(...items: any[]) {
                            items = cleanArrayValues(items);
                            return writeArray(() => target.unshift(...items));
                        };
                    }
                    if (prop === 'sort') {
                        return function sort(compareFn?: (a: any, b: any) => number) {
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
                            return target[prop as ArrayIterateMethod]((value: any, i: number) => {
                                return callback(proxifyChildValue(i), i, proxy); //, value
                            });
                        };
                    }
                    if (['reduce','reduceRight'].includes(prop as string)) {
                        return function reduce(callback: (previousValue: any, currentValue: any, currentIndex: number, array: any[]) => any, initialValue: any) {
                            return target[prop as ArrayReduceMethod]((prev: any, value: any, i: number) => {
                                return callback(prev, proxifyChildValue(i), i, proxy); //, value
                            }, initialValue);
                        };
                    }
                    if (['find','findIndex'].includes(prop as string)) {
                        return function find(callback: (value: any, index: number, array: any[]) => any) {
                            let value = target[prop as ArrayFindMethod]((value: any, i: number) => {
                                return callback(proxifyChildValue(i), i, proxy); // , value
                            });
                            if (prop === 'find' && value) {
                                const index = target.indexOf(value);
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
                if (typeof value === 'object') {
                    if (value[isProxy]) {
                        // Assigning one proxied value to another
                        value = value.valueOf();
                    }
                    // else if (Object.isFrozen(value)) {
                    //     // Create a copy to unfreeze it
                    //     value = cloneObject(value);
                    // }
                    value = cloneObject(value); // Fix #10, always clone objects so changes made through the proxy won't change the original object (and vice versa)
                }

                if (valuesAreEqual(value, target[prop])) { //if (compareValues(value, target[prop]) === 'identical') { // (typeof value !== 'object' && target[prop] === value) {
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
        },
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


/**
 * Callback function used for creating an Observer
 */
export type SubscribeFunction<T> = (observer: { next: (val: T) => void }) => () => void;

/**
 * @param value Read-only copy of the new value.
 * @param previous Read-only copy of the previous value.
 * @param isRemote Whether the change was done outside of the current proxy.
 * @param context Context used by the code that causing this change.
 * @returns Return false if you want to stop monitoring changes
 */
export type DataProxyOnChangeCallback<T> = (value: T, previous: T, isRemote: boolean, context: any) => void|boolean;

export interface ILiveDataProxyTransaction {
    readonly status: 'started'|'finished'|'canceled'
    /**
     * Indicates if this transaction has completed, or still needs to be committed or rolled back
     */
    readonly completed: boolean;

    /**
     * Gets pending mutations, can be used to determine if user made changes.
     * Useful for asking users "Do you want to save your changes?" when they navigate away from a form without saving.
     * Note that this array only contains previous values, the mutated values are in the proxied object value.
     * The previous value is needed to rollback the value, and the new value will be read from the proxied object upon commit.
     */
    readonly mutations: { target: Array<string|number>, previous: any }[];

    /**
     * Whether the transaction has pending mutations that can be committed or rolled back.
     */
    readonly hasMutations: boolean;

    /**
     * Commits the transaction by updating the database with all changes made to the proxied object while the transaction was active
     */
    commit(): Promise<void>;

    /**
     * Rolls back any changes made to the proxied value while the transaction was active.
     */
    rollback(): void;
}
export interface ILiveDataProxyValue<T> {
    /**
     * Pushes a child value to the object collection
     * @param entry child to add
     * @returns returns the new child's key (property name)
     */
    push<T = any>(entry: T): string;

    /**
     * Removes the stored value from the database. Useful if you don't have a reference
     * to current value's parent object.
     * @example
     * const chat = proxy.value as IChat;
     * chat.messages.forEach<IChatMessage>((message, key) => {
     *  if (message.text.includes('bad words')) {
     *      (message as any).remove();
     *      // above is equivalent to:
     *      chat.messages[key] = null;
     *  }
     * })
     */
    remove(): void;

    /**
     * Executes a callback for each child in the object collection.
     * @param callback Callback function to run for each child. If the callback returns false, it will stop.
     */
    forEach<T = any>(callback: (child: T, key: string, index: number) => void|boolean): void;

    [Symbol.iterator]: IterableIterator<any>;

    /**
     * Gets an iterator that can be used in `for`...`of` loops
     */
    values<T = any>(): IterableIterator<T>;

    /**
     * Gets an iterator for all keys in the object collection that can be used in `for`...`of` loops
     */
    keys(): IterableIterator<string>;

    /**
     * Gets an iterator for all key/value pairs in the object collection that can be used in `for`...`of` loops
     */
    entries<T = any>(): IterableIterator<[string, T]>;

    /**
     * Creates an array from current object collection, and optionally sorts it with passed
     * sorting function. All entries in the array will remain proxied values, but the array
     * itself is not: changes to the array itself (adding/removing/ordering items) will NOT be
     * saved to the database!
     */
    toArray<T = any>(sortFn?: (a:T, b:T) => number): T[];

    /**
     * Gets the value wrapped by this proxy. If the value is an object, it is still live but
     * READ-ONLY, meaning that it is still being updated with changes made in the database,
     * BUT any changes made to this object will NOT be saved to the database!
     * @deprecated Use .valueOf() instead
     */
    getTarget(): T;

    /**
     * @param warn whether to log a warning message. Default is true
     */
    getTarget(warn: boolean): T;

    /**
     * Gets the value wrapped by this proxy. Be careful, changes to the returned
     * object are not tracked and synchronized.
     */
    valueOf(): T;

    /**
     * Gets a reference to the target data
     */
    getRef(): DataReference;

    /**
     * Starts a subscription that monitors the current value for changes.
     * @param callback Function that is called each time the value was updated in the database.
     * The callback might be called before the local cache value is updated, so make sure to
     * use the READ-ONLY values passed to your callback. If you make changes to the value being
     * monitored (the proxied version), make sure you are not creating an endless loop!
     * If your callback returns false, the subscription is stopped.
     * @returns Returns an EventSubscription, call .stop() on it to unsubscribe.
     */
    onChanged(callback: DataProxyOnChangeCallback<T>): EventSubscription;

    /**
     * EXPERIMENTAL: Returns a subscribe function that can be used to create an RxJS Observable with.
     * @example
     * const proxy = await db.ref('posts/post1').proxy();
     * const post = proxy.value;
     * const observable = new Observable(post.comments.subscribe());
     * const subscription = observable.subscribe(comments => {
     *  // re-render comments
     * });
     * // Later, don't forget:
     * subscription.unsubscribe();
     */
    subscribe(): SubscribeFunction<T>;

    /**
     * Returns an RxJS Observable with READ-ONLY values each time a mutation takes place.
     * @returns Returns an Observable.
     * @example
     * const proxy = await db.ref('posts/post1').proxy();
     * const post = proxy.value;
     * const observable = (post.comments as any).getObservable();
     * const subscription = observable.subscribe(comments => {
     *  // re-render comments
     * });
     * // Later, don't forget:
     * subscription.unsubscribe()
     */
    getObservable(): Observable<T>;

    getOrderedCollection<U>(): OrderedCollectionProxy<U|T>;

    /**
     * Starts a transaction on the value. Local changes made to the value and its children
     * will be queued until committed, or undone when rolled back. Meanwhile, the value will
     * still be updated with remote changes. Use this to enable editing of values (eg with a
     * UI binding), but only saving them once user clicks 'Save'.
     * @example
     * // ... part of an Angular component:
     * class CustomerAddressForm {
     *      address: CustomerAddress; // Bound to input form
     *      private transaction: ILiveDataProxyTransaction;
     *      constructor(private db: MyDBProvider) { }
     *      async ngOnInit() {
     *          const ref = this.db.ref('customers/customer1/address');
     *          const proxy = await ref.proxy<CustomerAddress>();
     *          this.address = proxy.value;
     *          this.transaction = proxyAccess(this.address).startTransaction();
     *      }
     *      async save() {
     *          // Executed when user click "Save" button
     *          await this.transaction.commit();
     *      }
     *      cancel() {
     *          // Executes when user click "Cancel" button, or closes the form
     *          this.transaction.rollback();
     *      }
     * }
     */
    startTransaction(): Promise<ILiveDataProxyTransaction>;
}

/**
 * Convenience function to access ILiveDataProxyValue methods on a proxied value
 * @param proxiedValue The proxied value to get access to
 * @returns Returns the same object typecasted to an ILiveDataProxyValue
 * @example
 * // IChatMessages is an ObjectCollection<IChatMessage>
 * let observable: Observable<IChatMessages>;
 *
 * // Allows you to do this:
 * observable = proxyAccess<IChatMessages>(chat.messages).getObservable();
 *
 * // Instead of:
 * observable = (chat.messages.msg1 as any as ILiveDataProxyValue<IChatMessages>).getObservable();
 *
 * // Both do the exact same, but the first is less obscure
 */
export function proxyAccess<T>(proxiedValue: T): ILiveDataProxyValue<T> {
    if (typeof proxiedValue !== 'object' || !(proxiedValue as any)[isProxy]) { throw new Error('Given value is not proxied. Make sure you are referencing the value through the live data proxy.'); }
    return proxiedValue as any as ILiveDataProxyValue<T>;
}
type ArrayIterateMethod = 'forEach'|'every'|'some'|'filter'|'map';
type ArrayIndexOfMethod = 'indexOf'|'lastIndexOf'
type ArrayReduceMethod = 'reduce'|'reduceRight'
type ArrayFindMethod = 'find'|'findIndex'

/**
 * Provides functionality to work with ordered collections through a live data proxy. Eliminates
 * the need for arrays to handle ordered data by adding a 'sort' properties to child objects in a
 * collection, and provides functionality to sort and reorder items with a minimal amount of database
 * updates.
 */
export class OrderedCollectionProxy<T extends Record<string, any>> {
    constructor(
        private collection: ObjectCollection<T>,
        private orderProperty: string = 'order',
        private orderIncrement: number = 10,
    ) {
        if (typeof collection !== 'object' || !(collection as any)[isProxy]) { throw new Error('Collection is not proxied'); }
        if (collection.valueOf() instanceof Array) { throw new Error('Collection is an array, not an object collection'); }
        if (!Object.keys(collection).every(key => typeof collection[key] === 'object')) { throw new Error('Collection has non-object children'); }

        // Check if the collection has order properties. If not, assign them now
        const ok = Object.keys(collection).every(key => typeof (collection[key] as any)[orderProperty] === 'number');
        if (!ok) {
            // Assign order properties now. Database will be updated automatically
            const keys = Object.keys(collection);
            for (let i = 0; i < keys.length; i++) {
                const item:any = collection[keys[i]];
                item[orderProperty] = i * orderIncrement; // 0, 10, 20, 30 etc
            }
        }
    }

    /**
     * Gets an observable for the target object collection. Same as calling `collection.getObservable()`
     * @returns
     */
    getObservable(): IObservableLike<ObjectCollection<T>> {
        return proxyAccess(this.collection).getObservable();
    }

    /**
     * Gets an observable that emits a new ordered array representation of the object collection each time
     * the unlaying data is changed. Same as calling `getArray()` in a `getObservable().subscribe` callback
     * @returns
     */
    getArrayObservable(): IObservableLike<T[]> {
        const Observable = getObservable();
        return new Observable((subscriber => {
            const subscription = this.getObservable().subscribe((/*value*/) => {
                const newArray = this.getArray();
                subscriber.next(newArray);
            });
            return function unsubscribe() {
                subscription.unsubscribe();
            };
        }) as SubscribeFunction<T[]>);
    }

    /**
     * Gets an ordered array representation of the items in your object collection. The items in the array
     * are proxied values, changes will be in sync with the database. Note that the array itself
     * is not mutable: adding or removing items to it will NOT update the collection in the
     * the database and vice versa. Use `add`, `delete`, `sort` and `move` methods to make changes
     * that impact the collection's sorting order
     * @returns order array
     */
    getArray(): T[] {
        const arr = proxyAccess(this.collection).toArray((a, b) => a[this.orderProperty] - b[this.orderProperty]);
        // arr.push = (...items: T[]) => {
        //     items.forEach(item => this.add(item));
        //     return arr.length;
        // };
        return arr;
    }
    /**
     * Adds or moves an item to/within the object collection and takes care of the proper sorting order.
     * @param item Item to add or move
     * @param index Optional target index in the sorted representation, appends if not specified.
     * @param from If the item is being moved
     * @returns
     */
    add(item: T): { key: string, index: number };
    add(item: T, index: number): { key: string, index: number };
    add(item: T, index: number, from: number): { key: string, index: number };
    add(newItem: T, index?: number, from?: number) {
        const item: { [order: string]: number } = newItem;
        const arr = this.getArray() as { [order: string]: number }[];
        let minOrder: number = Number.POSITIVE_INFINITY,
            maxOrder: number = Number.NEGATIVE_INFINITY;
        for (let i = 0; i < arr.length; i++) {
            const order = arr[i][this.orderProperty];
            minOrder = Math.min(order, minOrder);
            maxOrder = Math.max(order, maxOrder);
        }
        let fromKey;
        if (typeof from === 'number') {
            // Moving existing item
            fromKey = Object.keys(this.collection).find(key => this.collection[key] === item);
            if (!fromKey) { throw new Error('item not found in collection'); }
            if (from === index) { return { key: fromKey, index }; }
            if (Math.abs(from - index) === 1) {
                // Position being swapped, swap their order property values
                const otherItem = arr[index];
                const otherOrder = otherItem[this.orderProperty];
                otherItem[this.orderProperty] = item[this.orderProperty];
                item[this.orderProperty] = otherOrder;
                return { key: fromKey, index };
            }
            else {
                // Remove from array, code below will add again
                arr.splice(from, 1);
            }
        }
        if (typeof index !== 'number' || index >= arr.length) {
            // append at the end
            index = arr.length;
            item[this.orderProperty] = arr.length == 0 ? 0 : maxOrder + this.orderIncrement;
        }
        else if (index === 0) {
            // insert before all others
            item[this.orderProperty] = arr.length == 0 ? 0 : minOrder - this.orderIncrement;
        }
        else {
            // insert between 2 others
            const orders:number[] = arr.map(item => item[this.orderProperty]);
            const gap = orders[index] - orders[index-1];
            if (gap > 1) {
                item[this.orderProperty] = orders[index] - Math.floor(gap / 2);
            }
            else {
                // TODO: Can this gap be enlarged by moving one of both orders?
                // For now, change all other orders
                arr.splice(index, 0, item);
                for (let i = 0; i < arr.length; i++) {
                    arr[i][this.orderProperty] = i * this.orderIncrement;
                }
            }
        }
        const key = typeof fromKey === 'string'
            ? fromKey // Moved item, don't add it
            : proxyAccess(this.collection).push(item);
        return { key, index };
    }

    /**
     * Deletes an item from the object collection using the their index in the sorted array representation
     * @param index
     * @returns the key of the collection's child that was deleted
     */
    delete(index: number) {
        const arr = this.getArray();
        const item = arr[index];
        if (!item) { throw new Error(`Item at index ${index} not found`); }
        const key = Object.keys(this.collection).find(key => this.collection[key] === item);
        if (!key) { throw new Error('Cannot find target object to delete'); }
        this.collection[key] = null; // Deletes it from db
        return { key, index };
    }

    /**
     * Moves an item in the object collection by reordering it
     * @param fromIndex Current index in the array (the ordered representation of the object collection)
     * @param toIndex Target index in the array
     * @returns
     */
    move(fromIndex: number, toIndex: number) {
        const arr = this.getArray();
        return this.add(arr[fromIndex], toIndex, fromIndex);
    }

    /**
     * Reorders the object collection using given sort function. Allows quick reordering of the collection which is persisted in the database
     * @param sortFn
     */
    sort(sortFn: (a: T, b: T) => number) {
        const arr = this.getArray();
        arr.sort(sortFn);
        for (let i = 0; i < arr.length; i++) {
            (arr[i] as { [order: string]: number })[this.orderProperty] = i * this.orderIncrement;
        }
    }
}
