import { DataReference } from './data-reference';
import { DataSnapshot } from './data-snapshot';
import { IObservableLike } from './optional-observable';
import type { Observable } from './optional-observable';
import type { ObjectCollection } from './object-collection';
import type { EventSubscription } from './subscription';
type ProxyObserveMutation = {
    snapshot: DataSnapshot;
    isRemote: boolean;
};
type ProxyObserveMutationsCallback = (mutationSnapshot: DataSnapshot, isRemoteChange: boolean) => any;
type ProxyObserveError = {
    source: string;
    message: string;
    details: Error;
};
type ProxyObserveErrorCallback = (error: ProxyObserveError) => any;
export interface ILiveDataProxy<T> {
    /**
     * The live value of the data wrapped in a Proxy
     */
    value: T;
    /**
     * Whether the loaded value exists in the database
     */
    readonly hasValue: boolean;
    /**
     * Reference to the proxied data path
     */
    readonly ref: DataReference;
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
    destroy(): void;
    /**
     * Releases used resources and stops monitoring changes. Equivalent to `proxy.destroy()` but sounds more civilized.
     */
    stop(): void;
    /**
     * Manually reloads current value. Is automatically done after server reconnects if no cursor is available (after sync_done event has fired)
     */
    reload(): Promise<void>;
    /**
     * @deprecated Use `.on('mutation', callback)`
     * Registers a callback function to call when the underlying data is being changed. This is optional.
     * @param callback function to invoke when data is changed
     * @see Also see onChanged event in {@link ILiveDataProxyValue<T>}
     */
    onMutation(callback: ProxyObserveMutationsCallback): void;
    /**
     * Registers a callback function to call when an error occurs behind the scenes
     * @deprecated Use `.on('error', callback)`
     * @param callback
     */
    onError(callback: ProxyObserveErrorCallback): void;
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
    off(event: 'cursor' | 'mutation' | 'error', callback: (event: any) => any): void;
}
export interface LiveDataProxyOptions<ValueType> {
    /**
     * Default value to use for the proxy if the database path does not exist yet. This value will also be written to the database.
     */
    defaultValue?: ValueType;
    /**
     * Cursor to use
     */
    cursor?: string;
}
export declare class LiveDataProxy {
    /**
     * Creates a live data proxy for the given reference. The data of the reference's path will be loaded, and kept in-sync
     * with live data by listening for 'mutations' events. Any changes made to the value by the client will be synced back
     * to the database.
     * @param ref DataReference to create proxy for.
     * @param options proxy initialization options
     * be written to the database.
     */
    static create<T>(ref: DataReference, options?: LiveDataProxyOptions<T>): Promise<ILiveDataProxy<T>>;
}
/**
 * Callback function used for creating an Observer
 */
export type SubscribeFunction<T> = (observer: {
    next: (val: T) => void;
}) => () => void;
/**
 * @param value Read-only copy of the new value.
 * @param previous Read-only copy of the previous value.
 * @param isRemote Whether the change was done outside of the current proxy.
 * @param context Context used by the code that causing this change.
 * @returns Return false if you want to stop monitoring changes
 */
export type DataProxyOnChangeCallback<T> = (value: T, previous: T, isRemote: boolean, context: any) => void | boolean;
export interface ILiveDataProxyTransaction {
    readonly status: 'started' | 'finished' | 'canceled';
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
    readonly mutations: {
        target: Array<string | number>;
        previous: any;
    }[];
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
export interface ILiveDataProxyValue<ValueType = Record<string, any>> {
    /**
     * Pushes a child value to an object collection
     * @param entry child to add
     * @returns returns the new child's key (property name)
     */
    push(entry: any): string;
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
    forEach(callback: (child: ValueType[keyof ValueType], key: string, index: number) => void | boolean): void;
    [Symbol.iterator]: IterableIterator<any>;
    /**
     * Gets an iterator that can be used in `for`...`of` loops
     */
    values(): IterableIterator<ValueType[keyof ValueType]>;
    /**
     * Gets an iterator for all keys in the object collection that can be used in `for`...`of` loops
     */
    keys(): IterableIterator<string>;
    /**
     * Gets an iterator for all key/value pairs in the object collection that can be used in `for`...`of` loops
     */
    entries(): IterableIterator<[string, ValueType[keyof ValueType]]>;
    /**
     * Creates an array from current object collection, and optionally sorts it with passed
     * sorting function. All entries in the array will remain proxied values, but the array
     * itself is not: changes to the array itself (adding/removing/ordering items) will NOT be
     * saved to the database!
     */
    toArray(sortFn?: (a: ValueType[keyof ValueType], b: ValueType[keyof ValueType]) => number): ValueType[keyof ValueType][];
    /**
     * Gets the value wrapped by this proxy. If the value is an object, it is still live but
     * READ-ONLY, meaning that it is still being updated with changes made in the database,
     * BUT any changes made to this object will NOT be saved to the database!
     * @deprecated Use .valueOf() instead
     */
    getTarget(): ValueType;
    /**
     * @param warn whether to log a warning message. Default is true
     */
    getTarget(warn: boolean): ValueType;
    /**
     * Gets the value wrapped by this proxy. Be careful, changes to the returned
     * object are not tracked and synchronized.
     */
    valueOf(): ValueType;
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
    onChanged(callback: DataProxyOnChangeCallback<ValueType>): EventSubscription;
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
    subscribe(): SubscribeFunction<ValueType>;
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
    getObservable(): Observable<ValueType>;
    getOrderedCollection<OrderKeyName extends string = 'order'>(): OrderedCollectionProxy<ValueType extends Record<string, any> ? ValueType[keyof ValueType] : any, OrderKeyName>;
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
export declare function proxyAccess<ValueType>(proxiedValue: ValueType): ILiveDataProxyValue<ValueType>;
/**
 * Provides functionality to work with ordered collections through a live data proxy. Eliminates
 * the need for arrays to handle ordered data by adding a 'sort' properties to child objects in a
 * collection, and provides functionality to sort and reorder items with a minimal amount of database
 * updates.
 */
export declare class OrderedCollectionProxy<ItemType extends {
    [KeyName in OrderKeyName]: number;
}, OrderKeyName extends string = 'order'> {
    private collection;
    private orderProperty;
    private orderIncrement;
    constructor(collection: ObjectCollection<ItemType & {
        [KeyName in OrderKeyName]: number;
    }>, orderProperty?: OrderKeyName, orderIncrement?: number);
    /**
     * Gets an observable for the target object collection. Same as calling `collection.getObservable()`
     * @returns
     */
    getObservable(): IObservableLike<ObjectCollection<ItemType>>;
    /**
     * Gets an observable that emits a new ordered array representation of the object collection each time
     * the unlaying data is changed. Same as calling `getArray()` in a `getObservable().subscribe` callback
     * @returns
     */
    getArrayObservable(): IObservableLike<ItemType[]>;
    /**
     * Gets an ordered array representation of the items in your object collection. The items in the array
     * are proxied values, changes will be in sync with the database. Note that the array itself
     * is not mutable: adding or removing items to it will NOT update the collection in the
     * the database and vice versa. Use `add`, `delete`, `sort` and `move` methods to make changes
     * that impact the collection's sorting order
     * @returns order array
     */
    getArray(): ItemType[];
    /**
     * Adds or moves an item to/within the object collection and takes care of the proper sorting order.
     * @param item Item to add or move
     * @param index Optional target index in the sorted representation, appends if not specified.
     * @param from If the item is being moved
     * @returns
     */
    add(item: ItemType, index?: number, from?: number): {
        key: string;
        index: number;
    };
    /**
     * Deletes an item from the object collection using the their index in the sorted array representation
     * @param index
     * @returns the key of the collection's child that was deleted
     */
    delete(index: number): {
        key: string;
        index: number;
    };
    /**
     * Moves an item in the object collection by reordering it
     * @param fromIndex Current index in the array (the ordered representation of the object collection)
     * @param toIndex Target index in the array
     * @returns
     */
    move(fromIndex: number, toIndex: number): {
        key: string;
        index: number;
    };
    /**
     * Reorders the object collection using given sort function. Allows quick reordering of the collection which is persisted in the database
     * @param sortFn
     */
    sort(sortFn: (a: ItemType, b: ItemType) => number): void;
}
export {};
//# sourceMappingURL=data-proxy.d.ts.map