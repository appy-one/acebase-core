import { DataSnapshot } from './data-snapshot';
import { EventStream } from './subscription';
import { ILiveDataProxy, LiveDataProxyOptions } from './data-proxy';
import type { Observable } from './optional-observable';
import type { AceBaseBase } from './acebase-base';
import type { StreamReadFunction, StreamWriteFunction, ValueMutation, ValueChange, IStreamLike, IReflectionNodeInfo, IReflectionChildrenInfo } from './api';
export type ValueEvent = 'value' | 'child_added' | 'child_changed' | 'child_removed' | 'mutated' | 'mutations';
export type NotifyEvent = 'notify_value' | 'notify_child_added' | 'notify_child_changed' | 'notify_child_removed' | 'notify_mutated' | 'notify_mutations';
export interface EventSettings {
    /**
     * Specifies whether to skip callbacks for current value (applies to `"value"` and `"child_added"` events)
     */
    newOnly?: boolean;
    /**
     * Enables you to implement custom sync logic if synchronization between client and server can't be de done
     * automatically for this event. For example, this callback will be executed for a `"child_changed"` event that
     * was added while offline and only fired for local cache changes until the server got connected; if no `"value"`
     * event subscription is active on the same path, you should manually update your local state by loading fresh
     * data from the server. Setting this property to `"reload"` will automatically do that.
     */
    syncFallback?: 'reload' | (() => any | Promise<any>);
}
export declare class DataRetrievalOptions {
    /**
     * child keys to include (will exclude other keys), can include wildcards (eg "messages/*\/title")
     */
    include?: Array<string | number>;
    /**
     * child keys to exclude (will include other keys), can include wildcards (eg "messages/*\/replies")
     */
    exclude?: Array<string | number>;
    /**
     * whether or not to include any child objects, default is true
     */
    child_objects?: boolean;
    /**
     * If a cached value is allowed to be served. A cached value will be used if the client is offline, if cache priority setting is true, or if the cached value is available and the server value takes too long to load (>1s). If the requested value is not filtered, the cache will be updated with the received server value, triggering any event listeners set on the path. Default is `true`.
     * @deprecated Use `cache_mode: "allow"` instead
     * @default true
     */
    allow_cache?: boolean;
    /**
     * Use a cursor to update the local cache with mutations from the server, then load and serve the entire
     * value from cache. Only works in combination with `cache_mode: "allow"`
     *
     * Requires an `AceBaseClient` with cache db
     */
    cache_cursor?: string;
    /**
     * Determines if the value is allowed to be loaded from cache:
     * - `"allow"`: (default) a cached value will be used if the client is offline, if cache `priority` setting is `"cache"`, or if the cached value is available and the server value takes too long to load (>1s). If the requested value is not filtered, the cache will be updated with the received server value, triggering any event listeners set on the path.
     * - `"bypass"`: Value will be loaded from the server. If the requested value is not filtered, the cache will be updated with the received server value, triggering any event listeners set on the path
     * - `"force"`: Forces the value to be loaded from cache only
     *
     * A returned snapshot's context will reflect where the data was loaded from: `snap.context().acebase_origin` will be set to `"cache"`, `"server"`, or `"hybrid"` if a `cache_cursor` was used.
     *
     * Requires an `AceBaseClient` with cache db
     * @default "allow"
     */
    cache_mode?: 'allow' | 'bypass' | 'force';
    /**
     * Options for data retrieval, allows selective loading of object properties
     */
    constructor(options: DataRetrievalOptions);
}
export declare class QueryDataRetrievalOptions extends DataRetrievalOptions {
    /**
     * Whether to return snapshots of matched nodes (include data), or references only (no data). Default is `true`
     * @default true
     */
    snapshots?: boolean;
    /**
     * @param options Options for data retrieval, allows selective loading of object properties
     */
    constructor(options: QueryDataRetrievalOptions);
}
type PathVariables = {
    [index: number]: string | number;
    [variable: string]: string | number;
};
type EventCallback<T = DataSnapshot | DataReference> = ((snapshotOrReference: T) => void);
declare const _private: unique symbol;
export declare class DataReference<T = any> {
    readonly db: AceBaseBase;
    private [_private];
    /**
     * Creates a reference to a node
     */
    constructor(db: AceBaseBase, path: string, vars?: PathVariables);
    /**
     * Adds contextual info for database updates through this reference.
     * This allows you to identify the event source (and/or reason) of
     * data change events being triggered. You can use this for example
     * to track if data updates were performed by the local client, a
     * remote client, or the server. And, why it was changed, and by whom.
     * @param context Context to set for this reference.
     * @param merge whether to merge given context object with the previously set context. Default is false
     * @returns returns this instance, or the previously set context when calling context()
     * @example
     * // Somewhere in your backend code:
     * db.ref('accounts/123/balance')
     *  .context({ action: 'withdraw', description: 'ATM withdrawal of €50' })
     *  .transaction(snap => {
     *      let balance = snap.val();
     *      return balance - 50;
     *  });
     *
     * // And, somewhere in your frontend code:
     * db.ref('accounts/123/balance')
     *  .on('value', snap => {
     *      // Account balance changed, check used context
     *      const newBalance = snap.val();
     *      const updateContext = snap.context(); // not snap.ref.context()
     *      switch (updateContext.action) {
     *          case 'payment': alert('Your payment was processed!'); break;
     *          case 'deposit': alert('Money was added to your account'); break;
     *          case 'withdraw': alert('You just withdrew money from your account'); break;
     *      }
     * });
     */
    context(context: any, merge?: boolean): DataReference;
    /**
     * Gets a previously set context on this reference. If the reference is returned
     * by a data event callback, it contains the context used in the reference used
     * for updating the data
     * @returns returns the previously set context
     */
    context(): any;
    /**
     * Contains the last received cursor for this referenced path (if the connected database has transaction logging enabled).
     * If you want to be notified if this value changes, add a handler with `ref.onCursor(callback)`
     */
    get cursor(): string;
    private set cursor(value);
    /**
     * Attach a callback function to get notified of cursor changes for this reference. The cursor is updated in these occasions:
     * - After any of the following events have fired: `value`, `child_changed`, `child_added`, `child_removed`, `mutations`, `mutated`
     * - After any of these methods finished saving a value to the database `set`, `update`, `transaction`. If you are connected to
     * a remote server, the cursor is updated once the server value has been updated.
     */
    onCursor: (cursor: string) => any;
    /**
    * The path this instance was created with
    */
    get path(): string;
    /**
     * The key or index of this node
     */
    get key(): string;
    /**
     * If the "key" is a number, it is an index!
     */
    get index(): number;
    /**
     * Returns a new reference to this node's parent
     */
    get parent(): DataReference;
    /**
     * Contains values of the variables/wildcards used in a subscription path if this reference was
     * created by an event ("value", "child_added" etc), or in a type mapping path when serializing / instantiating typed objects
     */
    get vars(): PathVariables;
    /**
     * Returns a new reference to a child node
     * @param childPath Child key, index or path
     * @returns reference to the child
     */
    child<Child = any>(childPath: string | number): DataReference<Child>;
    /**
     * Sets or overwrites the stored value
     * @param value value to store in database
     * @param onComplete optional completion callback to use instead of returning promise
     * @returns promise that resolves with this reference when completed
     */
    set(value: T, onComplete?: (err: Error, ref: DataReference) => void): Promise<this>;
    /**
     * Updates properties of the referenced node
     * @param updates containing the properties to update
     * @param onComplete optional completion callback to use instead of returning promise
     * @return returns promise that resolves with this reference once completed
     */
    update(updates: Partial<T>, onComplete?: (err: Error, ref: DataReference) => void): Promise<this>;
    /**
     * Sets the value a node using a transaction: it runs your callback function with the current value, uses its return value as the new value to store.
     * The transaction is canceled if your callback returns undefined, or throws an error. If your callback returns null, the target node will be removed.
     * @param callback - callback function that performs the transaction on the node's current value. It must return the new value to store (or promise with new value), undefined to cancel the transaction, or null to remove the node.
     * @returns returns a promise that resolves with the DataReference once the transaction has been processed
     */
    transaction<Value = T>(callback: (currentValue: DataSnapshot<Value>) => any): Promise<this>;
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
     * @param fireForCurrentValue Whether or not to run callbacks on current values when using "value" or "child_added" events
     * @param options Advanced options
     * @returns returns an EventStream
     */
    on<Val = T>(event: ValueEvent): EventStream<DataSnapshot<Val>>;
    on<Val = T>(event: ValueEvent, callback: ((snapshot: DataSnapshot<Val>) => void)): EventStream<DataSnapshot<Val>>;
    on<Val = T>(event: ValueEvent, callback: ((snapshot: DataSnapshot<Val>) => void), cancelCallback: (error: string) => void): EventStream<DataSnapshot<Val>>;
    on<Val = T>(event: ValueEvent, options: EventSettings): EventStream<DataSnapshot<Val>>;
    on<Val = T>(event: NotifyEvent): EventStream<DataReference<Val>>;
    on<Val = T>(event: NotifyEvent, callback: ((reference: DataReference<Val>) => void)): EventStream<DataReference<Val>>;
    on<Val = T>(event: NotifyEvent, callback: ((reference: DataReference<Val>) => void), cancelCallback: (error: string) => void): EventStream<DataReference<Val>>;
    on<Val = T>(event: NotifyEvent, options: EventSettings): EventStream<DataReference<Val>>;
    /** @deprecated Use `on(event, { newOnly: boolean })` signature instead */
    on<Val = T>(event: ValueEvent, fireForCurrentValue: boolean, cancelCallback?: (error: string) => void): EventStream<DataSnapshot<Val>>;
    /** @deprecated Use `on(event, { newOnly: boolean })` signature instead */
    on<Val = T>(event: NotifyEvent, fireForCurrentValue: boolean, cancelCallback?: (error: string) => void): EventStream<DataReference<Val>>;
    /**
     * Unsubscribes from a previously added event
     * @param event Name of the event
     * @param callback callback function to remove
     * @returns returns this `DataReference` instance
     */
    off(event?: ValueEvent, callback?: EventCallback<DataSnapshot>): this;
    off(event?: NotifyEvent, callback?: EventCallback<DataReference>): this;
    /**
     * Gets a snapshot of the stored value
     * @returns returns a promise that resolves with a snapshot of the data
     */
    get<Value = T>(): Promise<DataSnapshot<Value>>;
    /**
      * Gets a snapshot of the stored value, with/without specific child data
      * @param options data retrieval options to include or exclude specific child keys.
      * @returns returns a promise that resolves with a snapshot of the data
      */
    get<Value = T>(options: DataRetrievalOptions): Promise<DataSnapshot<Value>>;
    /**
      * Gets a snapshot of the stored value. Shorthand method for .once("value", callback)
      * @param callback callback function to run with a snapshot of the data instead of returning a promise
      * @returns returns nothing because a callback is used
      */
    get<Value = T>(callback: EventCallback<DataSnapshot<Value>>): void;
    /**
      * Gets a snapshot of the stored value, with/without specific child data
      * @param {DataRetrievalOptions} options data retrieval options to include or exclude specific child keys.
      * @param callback callback function to run with a snapshot of the data instead of returning a promise
      * @returns returns nothing because a callback is used
      */
    get<Value = T>(options: DataRetrievalOptions, callback: EventCallback<DataSnapshot<Value>>): void;
    get<Value = T>(optionsOrCallback?: DataRetrievalOptions | EventCallback<DataSnapshot<Value>>, callback?: EventCallback<DataSnapshot<Value>>): Promise<DataSnapshot<Value>> | void;
    /**
     * Waits for an event to occur
     * @param event Name of the event, eg "value", "child_added", "child_changed", "child_removed"
     * @param options data retrieval options, to include or exclude specific child keys
     * @returns returns promise that resolves with a snapshot of the data
     */
    once(event: ValueEvent | NotifyEvent, options?: DataRetrievalOptions): Promise<DataSnapshot<T> | void>;
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
     * const ref = await db.ref("game_users")
     *   .push({ name: "Betty Boop", points: 0 });
     * // ref is a new reference to the newly created object,
     * // eg to: "game_users/7dpJMeLbhY0tluMyuUBK27"
     * @example
     * // Create a new child reference with a generated key,
     * // but don't store it yet
     * let userRef = db.ref("users").push();
     * // ... to store it later:
     * await userRef.set({ name: "Popeye the Sailor" });
     */
    push<Value = any>(value: Value, onComplete?: (err: Error, ref: DataReference) => void): Promise<DataReference<Value>>;
    /**
     * @returns returns a reference to the new child
     */
    push(): DataReference;
    /**
     * Removes this node and all children
     */
    remove(): Promise<this>;
    /**
     * Quickly checks if this reference has a value in the database, without returning its data
     * @returns returns a promise that resolves with a boolean value
     */
    exists(): Promise<boolean>;
    get isWildcardPath(): boolean;
    /**
     * Creates a query object for current node
     */
    query(): DataReferenceQuery;
    /**
     * Gets the number of children this node has, uses reflection
     */
    count(): Promise<number>;
    /**
     * Gets info about a node and/or its children without retrieving any child object values
     * @param type reflection type
     * @returns Returns promise that resolves with the node reflection info
     */
    reflect(type: 'info', args: {
        /**
         * Whether to get a count of the number of children, instead of enumerating the children
         * @default false
         */
        child_count?: boolean;
        /**
         * Max number of children to enumerate
         * @default 50
         */
        child_limit?: number;
        /**
         * Number of children to skip when enumerating
         * @default 0
         */
        child_skip?: number;
        /**
         * Skip children before AND given key when enumerating
         */
        child_from?: string;
    }): Promise<IReflectionNodeInfo>;
    /**
     * @returns Returns promise that resolves with the node children reflection info
     */
    reflect(type: 'children', args: {
        /**
         * Max number of children to enumerate
         * @default 50
         */
        limit?: number;
        /**
         * Number of children to skip when enumerating
         * @default 0
         */
        skip?: number;
        /**
         * Skip children before AND given key when enumerating
         */
        from?: string;
    }): Promise<IReflectionChildrenInfo>;
    /**
     * Exports the value of this node and all children
     * @param write Function that writes data to your stream
     * @param options Only supported format currently is json
     * @returns returns a promise that resolves once all data is exported
     */
    export(write: StreamWriteFunction, options?: {
        format?: 'json';
        type_safe?: boolean;
    }): Promise<void>;
    /**
     * @deprecated use method signature with stream writer function argument instead
     */
    export(stream: IStreamLike, options?: {
        format?: 'json';
        type_safe?: boolean;
    }): Promise<void>;
    /**
     * Imports the value of this node and all children
     * @param read Function that reads data from your stream
     * @param options Only supported format currently is json
     * @returns returns a promise that resolves once all data is imported
     */
    import(read: StreamReadFunction, options?: {
        format: string;
        suppress_events: boolean;
    }): Promise<void>;
    /**
     * Creates a live data proxy for the given reference. The data of the referenced path will be loaded, and kept in-sync
     * with live data by listening for 'mutations' events. Any change made to the value by the client will be automatically
     * be synced back to the database. This allows you to forget about data storage, and code as if you are only handling
     * in-memory objects. Also works offline when a cache database is used. Synchronization never was this easy!
     * @param options Initialization options or the proxy, such as the default value
     * be written to the database.
     * @example
     * const ref = db.ref('chats/chat1');
     * const proxy = await ref.proxy();
     * const chat = proxy.value;
     * console.log(`Got chat "${chat.title}":`, chat);
     * // chat: { message: 'This is an example chat', members: ['Ewout'], messages: { message1: { from: 'Ewout', text: 'Welcome to the proxy chat example' } } }
     *
     * // Change title:
     * chat.title = 'Changing the title in the database too!';
     *
     * // Add participants to the members array:
     * chat.members.push('John', 'Jack', 'Pete');
     *
     * // Add a message to the messages collection (NOTE: automatically generates an ID)
     * chat.messages.push({ from: 'Ewout', message: 'I am changing the database without programming against it!' });
     */
    proxy<T = any>(options?: LiveDataProxyOptions<T>): Promise<ILiveDataProxy<T>>;
    /** @deprecated Use options argument instead */
    proxy<T = any>(defaultValue: T): Promise<ILiveDataProxy<T>>;
    /**
     * Returns a RxJS Observable that can be used to observe
     * updates to this node and its children. It does not return snapshots, so
     * you can bind the observable straight to a view. The value being observed
     * is updated internally using the new "mutated" event. All mutations are
     * applied to the original value, and kept in-memory.
     * @example
     * <!-- In your Angular view template: -->
     * <ng-container *ngIf="liveChat | async as chat">
     *    <Message *ngFor="let item of chat.messages | keyvalue" [message]="item.value"></Message>
     * </ng-container>
     *
     * // In your code:
     * ngOnInit() {
     *    this.liveChat = db.ref('chats/chat_id').observe();
     * }
     *
     * // Or, if you want to monitor updates yourself:
     * ngOnInit() {
     *    this.observer = db.ref('chats/chat_id').observe().subscribe(chat => {
     *       this.chat = chat;
     *    });
     * }
     * ngOnDestroy() {
     *    // DON'T forget to unsubscribe!
     *    this.observer.unsubscribe();
     * }
     */
    observe<T = any>(): Observable<T>;
    /**
     * Iterate through each child in the referenced collection by streaming them one at a time.
     * @param callback function to call with a `DataSnapshot` of each child. If your function
     * returns a `Promise`, iteration will wait until it resolves before loading the next child.
     * Iterating stops if callback returns (or resolves with) `false`
     * @returns Returns a Promise that resolves with an iteration summary.
     * @example
     * ```js
     * const result = await db.ref('books').forEach(bookSnapshot => {
     *   const book = bookSnapshot.val();
     *   console.log(`Got book "${book.title}": "${book.description}"`);
     * });
     *
     * // In above example we're only using 'title' and 'description'
     * // of each book. Let's only load those to increase performance:
     * const result = await db.ref('books').forEach(
     *    { include: ['title', 'description'] },
     *    bookSnapshot => {
     *       const book = bookSnapshot.val();
     *       console.log(`Got book "${book.title}": "${book.description}"`);
     *    }
     * );
     * ```
     */
    forEach<Child = any>(callback: ForEachIteratorCallback<Child>): Promise<ForEachIteratorResult>;
    /**
     * @param options specify what data to load for each child. Eg `{ include: ['title', 'description'] }`
     * will only load each child's title and description properties
     */
    forEach<Child = any>(options: DataRetrievalOptions, callback: ForEachIteratorCallback<Child>): Promise<ForEachIteratorResult>;
    /**
     * Gets mutations to the referenced path and its children using a previously acquired cursor.
     * @param cursor cursor to use. When not given all available mutations in the transaction log will be returned.
     */
    getMutations(cursor?: string | null): Promise<{
        used_cursor: string;
        new_cursor: string;
        mutations: ValueMutation[];
    }>;
    /**
     * Gets mutations to the referenced path and its children since a specific date.
     * @param since Date/time to use. When not given all available mutations in the transaction log will be returned.
     */
    getMutations(since?: Date): Promise<{
        used_cursor: string;
        new_cursor: string;
        mutations: ValueMutation[];
    }>;
    /**
     * Gets changes to the referenced path and its children using a previously acquired cursor.
     * @param cursor cursor to use. When not given all available changes in the transaction log will be returned.
     */
    getChanges(cursor?: string | null): Promise<{
        used_cursor: string;
        new_cursor: string;
        changes: ValueChange[];
    }>;
    /**
     * Gets changes to the referenced path and its children since a specific date.
     * @param since Date/time to use. When not given all available changes in the transaction log will be returned.
     */
    getChanges(since?: Date): Promise<{
        used_cursor: string;
        new_cursor: string;
        changes: ValueChange[];
    }>;
}
type ForEachIteratorCallback<T = any> = (childSnapshot: DataSnapshot<T>) => boolean | void | Promise<boolean | void>;
interface ForEachIteratorResult {
    canceled: boolean;
    total: number;
    processed: number;
}
export interface RealtimeQueryEvent {
    name: string;
    snapshot?: DataSnapshot;
    ref?: DataReference;
}
export type RealtimeQueryEventCallback = (event: RealtimeQueryEvent) => void;
export type QueryHintsEventCallback = (event: {
    name: 'hints';
    type: string;
    source: string;
    hints: {
        type: string;
        value: any;
        description: string;
    }[];
}) => void;
export type IndexQueryStats = {
    type: string;
    args: any;
    started: number;
    stopped: number;
    steps: IndexQueryStats[];
    result: number;
    duration: number;
};
export type QueryStatsEventCallback = (event: {
    name: 'stats';
    type: string;
    source: string;
    stats: IndexQueryStats[];
}) => void;
export interface QueryRemoveResult {
    success: boolean;
    error?: Error;
    ref: DataReference;
}
export type StandardQueryOperator = '<' | '<=' | '==' | '!=' | '>' | '>=' | 'exists' | '!exists' | 'between' | '!between' | 'like' | '!like' | 'matches' | '!matches' | 'in' | '!in' | 'has' | '!has' | 'contains' | '!contains';
export type FullTextQueryOperator = 'fulltext:contains' | 'fulltext:!contains';
export type GeoQueryOperator = 'geo:nearby';
export type QueryOperator = StandardQueryOperator | FullTextQueryOperator | GeoQueryOperator;
export declare class DataReferenceQuery {
    private [_private];
    ref: DataReference;
    /**
     * Creates a query on a reference
     */
    constructor(ref: DataReference);
    /**
     * Applies a filter to the children of the refence being queried.
     * If there is an index on the property key being queried, it will be used
     * to speed up the query
     * @param key property to test value of
     * @param op operator to use
     * @param compare value to compare with
     */
    filter(key: string | number, op: QueryOperator, compare?: any): DataReferenceQuery;
    /**
     * @deprecated use `.filter` instead
     */
    where(key: string | number, op: QueryOperator, compare?: any): DataReferenceQuery;
    /**
     * Limits the number of query results
     */
    take(n: number): DataReferenceQuery;
    /**
     * Skips the first n query results
     */
    skip(n: number): DataReferenceQuery;
    /**
     * Sorts the query results
     * @param key key to sort on
     */
    sort(key: string): DataReferenceQuery;
    /**
     * @param ascending whether to sort ascending (default) or descending
     */
    sort(key: string, ascending: boolean): DataReferenceQuery;
    /**
     * @deprecated use `.sort` instead
     */
    order(key: string, ascending?: boolean): DataReferenceQuery;
    /**
     * Executes the query
     * @returns returns a Promise that resolves with an array of DataSnapshots
     */
    get<T = any>(): Promise<DataSnapshotsArray<T>>;
    /**
     * Executes the query with additional options
     * @param options data retrieval options to include or exclude specific child data, and whether to return snapshots (default) or references only
     * @returns returns a Promise that resolves with an array of DataReferences
     */
    get<T = any>(options: QueryDataRetrievalOptions & {
        snapshots: false;
    }): Promise<DataReferencesArray<T>>;
    /**
     * @returns returns a Promise that resolves with an array of DataSnapshots
     */
    get<T = any>(options: QueryDataRetrievalOptions & {
        snapshots?: true;
    }): Promise<DataSnapshotsArray<T>>;
    /**
     * @returns returns a Promise that resolves with an array of DataReferences or DataSnapshots
     */
    get<T = any>(options: QueryDataRetrievalOptions): Promise<DataReferencesArray<T> | DataSnapshotsArray<T>>;
    /**
     * @param callback callback to use instead of returning a promise
     * @returns returns nothing because a callback is being used
     */
    get<T = any>(callback: (snapshots: DataSnapshotsArray<T>) => void): void;
    /**
     * @returns returns nothing because a callback is being used
     */
    get<T = any>(options: QueryDataRetrievalOptions, callback: (snapshotsOrReferences: DataSnapshotsArray<T> | DataReferencesArray<T>) => void): void;
    get<T = any>(optionsOrCallback?: QueryDataRetrievalOptions | ((results: DataSnapshotsArray<T> | DataReferencesArray<T>) => void), callback?: (results: DataSnapshotsArray<T> | DataReferencesArray<T>) => void): Promise<DataSnapshotsArray<T> | DataReferencesArray<T>> | void;
    /**
     * Stops a realtime query, no more notifications will be received.
     */
    stop(): Promise<void>;
    /**
     * Executes the query and returns references. Short for `.get({ snapshots: false })`
     * @param callback callback to use instead of returning a promise
     * @returns returns an Promise that resolves with an array of DataReferences, or void when using a callback
     * @deprecated Use `find` instead
     */
    getRefs<T = any>(callback?: (references: DataReferencesArray) => void): Promise<DataReferencesArray<T>> | void;
    /**
     * Executes the query and returns an array of references. Short for `.get({ snapshots: false })`
     */
    find<T = any>(): Promise<DataReferencesArray<T>>;
    /**
     * Executes the query and returns the number of results
     */
    count(): Promise<number>;
    /**
     * Executes the query and returns if there are any results
     */
    exists(): Promise<boolean>;
    /**
     * Executes the query, removes all matches from the database
     * @returns returns a Promise that resolves once all matches have been removed
     */
    remove(callback?: (results: QueryRemoveResult[]) => void): Promise<QueryRemoveResult[]>;
    /**
     * Subscribes to an event. Supported events are:
     *  "stats": receive information about query performance.
     *  "hints": receive query or index optimization hints
     *  "add", "change", "remove": receive real-time query result changes
     * @param event Name of the event to subscribe to
     * @param callback Callback function
     * @returns returns reference to this query
     */
    on(event: 'add' | 'change' | 'remove', callback: RealtimeQueryEventCallback): DataReferenceQuery;
    on(event: 'hints', callback: QueryHintsEventCallback): DataReferenceQuery;
    on(event: 'stats', callback: QueryStatsEventCallback): DataReferenceQuery;
    /**
     * Unsubscribes from (a) previously added event(s)
     * @param event Name of the event
     * @param callback callback function to remove
     * @returns returns reference to this query
     */
    off(event?: 'stats' | 'hints' | 'add' | 'change' | 'remove', callback?: RealtimeQueryEventCallback): DataReferenceQuery;
    /**
     * Executes the query and iterates through each result by streaming them one at a time.
     * @param callback function to call with a `DataSnapshot` of each child. If your function
     * returns a `Promise`, iteration will wait until it resolves before loading the next child.
     * Iterating stops if callback returns (or resolves with) `false`
     * @returns Returns a Promise that resolves with an iteration summary.
     * @example
     * ```js
     * const result = await db.query('books')
     *  .filter('category', '==', 'cooking')
     *  .forEach(bookSnapshot => {
     *     const book = bookSnapshot.val();
     *     console.log(`Found cooking book "${book.title}": "${book.description}"`);
     *  });
     *
     * // In above example we're only using 'title' and 'description'
     * // of each book. Let's only load those to increase performance:
     * const result = await db.query('books')
     *  .filter('category', '==', 'cooking')
     *  .forEach(
     *    { include: ['title', 'description'] },
     *    bookSnapshot => {
     *       const book = bookSnapshot.val();
     *       console.log(`Found cooking book "${book.title}": "${book.description}"`);
     *    }
     * );
     * ```
     */
    forEach<T = any>(callback: ForEachIteratorCallback<T>): Promise<ForEachIteratorResult>;
    /**
     * @param options specify what data to load for each child. Eg `{ include: ['title', 'description'] }`
     * will only load each child's title and description properties
     */
    forEach<T = any>(options: DataRetrievalOptions, callback: ForEachIteratorCallback<T>): Promise<ForEachIteratorResult>;
}
export declare class DataSnapshotsArray<T = any> extends Array<DataSnapshot<T>> {
    static from<T = any>(snaps: DataSnapshot<T>[]): DataSnapshotsArray<T>;
    getValues(): T[];
}
export declare class DataReferencesArray<T = any> extends Array<DataReference<T>> {
    static from<T = any>(refs: DataReference<T>[]): DataReferencesArray<T>;
    getPaths(): string[];
}
export {};
//# sourceMappingURL=data-reference.d.ts.map