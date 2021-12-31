import { AceBaseBase } from './acebase-base';
import { DataSnapshot } from './data-snapshot';
import { ILiveDataProxy } from './data-proxy';
import { EventStream } from './subscription';
import { Observable } from './optional-observable';

type ValueEvent = 'value'|'child_added'|'child_changed'|'child_removed'|'mutated'|'mutations'
type NotifyEvent = 'notify_value'|'notify_child_added'|'notify_child_changed'|'notify_child_removed'|'notify_mutated'|'notify_mutations'
interface EventSettings { 
    /** Specifies whether to skip callbacks for current value (applies to `"value"` and `"child_added"` events) */
    newOnly?: boolean, 
    /** 
     * Enables you to implement custom sync logic if synchronization between client and server can't be de done 
     * automatically for this event. For example, this callback will be executed for a `"child_changed"` event that 
     * was added while offline and only fired for local cache changes until the server got connected; if no `"value"`
     * event subscription is active on the same path, you should manually update your local state by loading fresh 
     * data from the server. Setting this property to `"reload"` will automatically do that.
     */
    syncFallback?: 'reload'|(() => any|Promise<any>)
}
export class DataReference
{
    constructor(db: AceBaseBase, path: string);

    /**
    * The path this instance was created with
    */
    path: string;

    /**
     * The key or index of this node
     */
    key: string;

    /**
     * Returns a new reference to this node's parent
     */
    parent: DataReference;

    /**
     * Contains values of the variables/wildcards used in a subscription path if this reference was 
     * created by an event ("value", "child_added" etc), or in a type mapping path when serializing / instantiating typed objects
     */
    readonly vars: { [name: string]: string|number|Array<string|number>, wildcards?: Array<string|number> }

    /**
     * Adds contextual info for database updates through this reference. 
     * This allows you to identify the event source (and/or reason) of 
     * data change events being triggered. You can use this for example 
     * to track if data updates were performed by the local client, a 
     * remote client, or the server. And, why it was changed, and by whom.
     * @param context context to set
     * @param merge whether to merge given context object with the previously set context. Default is false
     * @returns returns this instance
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
    context(context:any, merge?: boolean): DataReference
    /**
     * Gets a previously set context on this reference. If the reference is returned
     * by a data event callback, it contains the context used in the reference used 
     * for updating the data 
     * @returns returns the previously set context
     */
    context(): any

    /**
     * Returns a new reference to a child node
     * @param {string} childPath Child key, index or path
     * @returns {DataReference} reference to the child
     */
    child(childPath: string|number): DataReference

    /**
     * Sets or overwrites the stored value
     * @param {any} value value to store in database
     * @returns {Promise<DataReference>} promise that resolves with this reference when completed
     */
    set(value: any): Promise<DataReference>
    /**
     * Sets or overwrites the stored value
     * @param {any} value value to store in database
     * @param {(err: Error, ref: DataReference) => void} onComplete completion callback
     * @returns {void} undefined
     */
    set(value: any, onComplete: (err: Error, ref: DataReference) => void): void

    /**
     * Updates properties of the referenced node
     * @param {object} updates object containing the properties to update
     * @return {Promise<DataReference>} returns promise that resolves with this reference once completed
     */
    update(updates: object): Promise<DataReference>
    /**
     * Updates properties of the referenced node
     * @param {object} updates - object containing the properties to update
     * @param {(err: Error, ref: DataReference) => void} onComplete completion callback
     * @return {void} undefined
     */
    update(updates: object, onComplete: (err: Error, ref: DataReference) => void): void

    /**
     * Sets the value a node using a transaction: it runs your callback function with the current value, uses its return value as the new value to store.
     * The transaction is canceled if your callback returns undefined, or throws an error. If your callback returns null, the target node will be removed. 
     * @param {(currentValue: DataSnapshot) => any} callback - callback function that performs the transaction on the node's current value. It must return the new value to store (or promise with new value), undefined to cancel the transaction, or null to remove the node.
     * @returns {Promise<DataReference>} returns a promise that resolves with the DataReference once the transaction has been processed
     */
    transaction(callback: (currentValue: DataSnapshot) => any): Promise<DataReference>

    /**
     * Subscribes to an event. Supported events are "value", "child_added", "child_changed", "child_removed", "mutated" and "mutations",
     * which will run the callback with a snapshot of the data. If you only wish to receive notifications of the 
     * event (without the data), use the "notify_value", "notify_child_added", "notify_child_changed", 
     * "notify_child_removed" etc events instead, which will run the callback with a DataReference to the changed 
     * data. This enables you to manually retrieve data upon changes (eg if you want to exclude certain child 
     * data from loading)
     * @param event - Name of the event to subscribe to
     * @param callback - Callback function. Optional, you can also use the returned EventStream.
     * @param cancelCallback Function to call when the subscription is not allowed, or denied access later on
     * @param fireForCurrentValue Whether or not to run callbacks on current values when using "value" or "child_added" events
     * @param options Advanced options
     * @returns returns an EventStream
     */
    on(event: ValueEvent): EventStream<DataSnapshot>
    on(event: ValueEvent, callback: ((snapshot:DataSnapshot) => void)): EventStream<DataSnapshot>
    on(event: ValueEvent, callback: ((snapshot:DataSnapshot) => void), cancelCallback: (error: string) => void): EventStream<DataSnapshot>
    on(event: ValueEvent, fireForCurrentValue: boolean, cancelCallback?: (error: string) => void): EventStream<DataSnapshot>
    on(event: ValueEvent, options: EventSettings): EventStream<DataSnapshot>
    on(event: NotifyEvent): EventStream<DataReference>
    on(event: NotifyEvent, callback: ((reference:DataReference) => void)): EventStream<DataReference>
    on(event: NotifyEvent, callback: ((reference:DataReference) => void), cancelCallback: (error: string) => void): EventStream<DataReference>
    on(event: NotifyEvent, fireForCurrentValue: boolean, cancelCallback?: (error: string) => void): EventStream<DataReference>
    on(event: NotifyEvent, options: EventSettings): EventStream<DataReference>

    /**
     * Unsubscribes from a previously added event
     * @param {string} event | Name of the event
     * @param callback | callback function to remove
     */
    off(event?:ValueEvent, callback?: ((snapshot:DataSnapshot) => void))
    off(event?:NotifyEvent, callback?: ((reference:DataReference) => void))

    // /**
    //  * Gets a snapshot of the stored value. Shorthand method for .once("value")
    //  * @param {((snapshot:DataSnapshot) => void)|DataRetrievalOptions} callbackOrOptions - (optional) callback or data retrieval options
    //  * @param {DataRetrievalOptions?} options - (optional) data retrieval options to include or exclude specific child keys.
    //  * @returns {Promise<DataSnapshot>} returns a promise that resolves with a snapshot of the data
    //  */
    // get(callbackOrOptions?:((snapshot:DataSnapshot) => void)|DataRetrievalOptions, options?: DataRetrievalOptions): Promise<DataSnapshot>

    /**
     * Gets a snapshot of the stored value
     * @returns {Promise<DataSnapshot>} returns a promise that resolves with a snapshot of the data
     */
    get(): Promise<DataSnapshot>
    /**
     * Gets a snapshot of the stored value, with/without specific child data
     * @param {DataRetrievalOptions} options data retrieval options to include or exclude specific child keys.
     * @returns {Promise<DataSnapshot>} returns a promise that resolves with a snapshot of the data
     */
    get(options:DataRetrievalOptions): Promise<DataSnapshot>
    /**
     * Gets a snapshot of the stored value. Shorthand method for .once("value", callback)
     * @param callback callback function to run with a snapshot of the data instead of returning a promise
     * @returns {void} returns nothing because a callback is used
     */
    get(callback:(snapshot:DataSnapshot) => void): void
    /**
     * Gets a snapshot of the stored value, with/without specific child data
     * @param {DataRetrievalOptions} options data retrieval options to include or exclude specific child keys.
     * @param callback callback function to run with a snapshot of the data instead of returning a promise
     * @returns {void} returns nothing because a callback is used
     */
    get(options:DataRetrievalOptions, callback:(snapshot:DataSnapshot) => void): void

    /**
     * Waits for an event to occur
     * @param {string} event - Name of the event, eg "value", "child_added", "child_changed", "child_removed"
     * @param {DataRetrievalOptions} options - data retrieval options, to include or exclude specific child keys
     * @returns {Promise<DataSnapshot>} - returns promise that resolves with a snapshot of the data
     */
    once(event:string, options?: DataRetrievalOptions): Promise<DataSnapshot>

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
    push(value: any, onComplete?: (err: Error, ref: DataReference) => void): Promise<DataReference>;
    push(): DataReference;

    /**
     * Removes this node and all children
     */
    remove(): Promise<DataReference>
    
    /**
     * Quickly checks if this reference has a value in the database, without returning its data
     * @returns {Promise<boolean>} | returns a promise that resolves with a boolean value
     */
    exists(): Promise<boolean>

    /**
     * Creates a query object for current node
     */
    query(): DataReferenceQuery

    /**
     * Gets the number of children this node has, uses reflection
     */
    count(): Promise<number>

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
        child_count?: boolean, 
        /**
         * Max number of children to enumerate
         * @default 50
         */
        child_limit?: number, 
        /**
         * Number of children to skip when enumerating
         * @default 0
         */
        child_skip?: number,
        /**
         * Skip children before AND given key when enumerating
         */
        child_from?: string
    }) : Promise<IReflectionNodeInfo>
    
    /**
     * @returns Returns promise that resolves with the node children reflection info
     */
    reflect(type: 'children', args: { 
        /**
         * Max number of children to enumerate
         * @default 50
         */
        limit?: number,
        /**
         * Number of children to skip when enumerating
         * @default 0
         */ 
        skip?: number,
        /**
         * Skip children before AND given key when enumerating
         */
        from?: string
    }) : Promise<IReflectionChildrenInfo>

    /**
     * Exports the value of this node and all children
     * @param write Function that writes data to your stream
     * @param options Only supported format currently is json
     * @returns returns a promise that resolves once all data is exported
     */
    export(write: StreamWriteFunction, options?: { format?: 'json', type_safe?: boolean }): Promise<void>
    /**
     * @deprecated use method signature with stream writer function argument instead
     */
    export(stream: IStreamLike, options?: { format?: 'json', type_safe?: boolean }): Promise<void>

    /**
     * Imports the value of this node and all children
     * @param read Function that reads data from your stream
     * @param options Only supported format currently is json
     * @returns returns a promise that resolves once all data is imported
     */
    import(read: StreamReadFunction, options?: { format?: 'json', suppress_events?: boolean }): Promise<void>

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
    observe(): Observable<any>
    observe<T>(): Observable<T>
    /**
     * @param options optional initial data retrieval options. 
     * Not recommended to use yet - given includes/excludes are not applied to received mutations,
     * or sync actions when using an AceBaseClient with cache db.
     */
    observe(options?: DataRetrievalOptions): Observable<any>

    /**
     * Creates a live data proxy for the given reference. The data of the referenced path will be loaded, and kept in-sync
     * with live data by listening for 'mutations' events. Any change made to the value by the client will be automatically
     * be synced back to the database. This allows you to forget about data storage, and code as if you are only handling
     * in-memory objects. Also works offline when a cache database is used. Synchronization never was this easy!
     * @param defaultValue Default value to use for the proxy if the database path does not exist yet. This value will also
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
    proxy(defaultValue?: any): Promise<ILiveDataProxy<any>>
    proxy<T>(defaultValue?: any): Promise<ILiveDataProxy<T>>

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
    forEach(callback: ForEachIteratorCallback): Promise<ForEachIteratorResult>
    /**
     * @param options specify what data to load for each child. Eg `{ include: ['title', 'description'] }` 
     * will only load each child's title and description properties
     */
    forEach(options: DataRetrievalOptions, callback: ForEachIteratorCallback): Promise<ForEachIteratorResult>

    /**
     * Gets mutations to the referenced path and its children using a previously acquired cursor.
     * @param cursor cursor to use. When not given all available mutations in the transaction log will be returned.
     */
    getMutations(cursor?: string|null): Promise<{ used_cursor: string, new_cursor: string, mutations: ValueMutation[] }>
    /**
     * Gets mutations to the referenced path and its children since a specific date.
     * @param since Date/time to use. When not given all available mutations in the transaction log will be returned.
     */
    getMutations(since?: Date): Promise<{ used_cursor: string, new_cursor: string, mutations: ValueMutation[] }>
    /**
     * Gets changes to the referenced path and its children using a previously acquired cursor.
     * @param cursor cursor to use. When not given all available changes in the transaction log will be returned.
     */
    getChanges(cursor?: string|null): Promise<{ used_cursor: string, new_cursor: string, changes: ValueChange[] }>
    /**
     * Gets changes to the referenced path and its children since a specific date.
     * @param since Date/time to use. When not given all available changes in the transaction log will be returned.
     */
    getChanges(since?: Date): Promise<{ used_cursor: string, new_cursor: string, changes: ValueChange[] }>
}

/**
 * Uncompressed mutation: a single database operation of `type` `"set"` (overwrite) or `"update"` (merge) on `mutations.path` 
 * caused the value of `path` to be mutated to `value`
 */
type ValueMutation = {
    /** path the mutation had effect on */
    path: string,
    /** database operation used */
    type: 'set'|'update',
    /** new effective value of the node at current `path` */
    value: any,
    /** context used when database operation executed */
    context: any,
    /** id (cursor) of the transaction log item */ 
    id: string,
    /** timestamp of the mutation */
    timestamp: number,
    /** actual changes caused by the database operation of `type` on `mutations.path` at the time of execution */
    changes: {
        /** path the database operation was executed on, used as root of all changes in `list` */
        path: string,
        /** list of all changed values relative to `path` */
        list: Array<{
            /** keys trail to mutated path, relative to `path` */
            target: Array<string|number>,
            /** new value stored at target */
            val: any
            /** prev value stored at target */
            prev: any
        }>
    }
};
/**
 * Compressed mutation: one or more database operations caused the value of the node at `path` to effectively be mutated 
 * from `previous` to `value` using database operation logic of `type` `"set"` (overwrite) or `"update"` (merge)
 */
type ValueChange = { path: string, type: 'set'|'update', previous: any, value: any, context: any }
// type MutationsResult<T> = { used_cursor: string, new_cursor: string, mutations: T[] };

type ForEachIteratorCallback = (childSnapshot: DataSnapshot) => boolean|void|Promise<boolean|void>;
interface ForEachIteratorResult {
    canceled: boolean, 
    total: number,
    processed: number
}

export interface IStreamLike {
    /**
     * Method that writes exported data to your stream
     * @param str string data to append
     * @returns Returns void or a Promise that resolves once writing to your stream is done. When returning a Promise, streaming will wait until it has resolved, so you can wait for eg a filestream to "drain".
     */
    write(str: string): void | Promise<void>;
}
/**
 * Function that writes exported data to your stream
 * @param str string data to append
 * @returns Returns void or a Promise that resolves once writing to your stream is done. When returning a Promise, streaming will wait until it has resolved, so you can wait for eg a filestream to "drain".
 */
export type StreamWriteFunction = (str: string) => void | Promise<void>
/**
 * Function that reads data from your stream
 * @param length suggested number of bytes to read, reading more or less is allowed.
 * @returns Returns a string, typed array, or promise thereof
 */
export type StreamReadFunction = (length: number) => string | ArrayBufferView | Promise<string|ArrayBufferView>;

export interface IReflectionNodeInfo {
    key: string
    exists: boolean
    type: 'object'|'array'|'number'|'boolean'|'string'|'datetime'|'binary'|'reference',
    /** only present for small values (number, boolean, datetime), small strings & binaries, and empty objects and arrays */
    value?: any
    /** Physical storage location in AceBase binary database, only present when AceBase default binary storage is used  */
    address?: { pageNr: number, recordNr: number }
    children?: {
        count?: 0
        more: boolean
        list: IReflectionNodeInfo[]
    }
}
export interface IReflectionChildrenInfo {
    more: boolean
    list: IReflectionNodeInfo[]
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

// TODO: Move to data-reference-query.d.ts
export class DataReferenceQuery {

    /**
     * Creates a query on a reference
     * @param {DataReference} ref 
     */
    constructor(ref: DataReference)

    /**
     * Applies a filter to the children of the refence being queried. 
     * If there is an index on the property key being queried, it will be used 
     * to speed up the query
     * @param {string|number} key | property to test value of
     * @param {QueryOperator} op | operator to use
     * @param {any} compare | value to compare with
     * @returns {DataReferenceQuery}
     */
    filter(key: string|number, op: QueryOperator, compare?: any): DataReferenceQuery

    /**
     * Limits the number of query results to n
     * @param {number} n 
     * @returns {DataReferenceQuery}
     */
    take(n: number): DataReferenceQuery

    /**
     * Skips the first n query results
     * @param {number} n 
     * @returns {DataReferenceQuery}
     */
    skip(n: number): DataReferenceQuery

    /**
     * Sorts the query results
     * @param {string} key 
     * @param {boolean} [ascending=true]
     * @returns {DataReferenceQuery}
     */
    sort(key:string|number) : DataReferenceQuery  
    /**
     * @param {boolean} [ascending=true] whether to sort ascending (default) or descending
     */
    sort(key:string|number, ascending: boolean) : DataReferenceQuery  
    
    /**
     * Executes the query
     * @returns {Promise<DataSnapshotsArray>} returns an Promise that resolves with an array of DataSnapshots
     */
    get() : Promise<DataSnapshotsArray>
    /**
     * EXecutes the query with additional options
     * @param options data retrieval options to include or exclude specific child data, and whether to return snapshots (default) or references only
     * @returns {Promise<DataSnapshotsArray>|Promise<DataReferencesArray>} returns an Promise that resolves with an array of DataReferences or DataSnapshots
     */
    get(options: QueryDataRetrievalOptions) : Promise<DataSnapshotsArray|DataReferencesArray>
    /**
     * @param {(snapshots:DataSnapshotsArray) => void} callback callback to use instead of returning a promise
     * @returns {void} returns nothing because a callback is being used
     */
    get(callback: (snapshots:DataSnapshotsArray) => void) : void
    /**
     * @returns {void} returns nothing because a callback is being used
     */
    get(options: QueryDataRetrievalOptions, callback: (snapshotsOrReferences:DataSnapshotsArray|DataReferencesArray) => void) : void

    /**
     * Executes the query and returns references. Short for .get({ snapshots: false })
     * @returns {Promise<DataReferencesArray>} returns an Promise that resolves with an array of DataReferences
     * @deprecated Use `.find()` instead
     */
    getRefs() : Promise<DataReferencesArray>
    /**
     * @param {(references: DataReferencesArray) => void} callback callback to use instead of returning a promise
     * @returns {void} returns nothing because a callback is being used
     * @deprecated Use `.find()` instead
     */
    getRefs(callback: (references: DataReferencesArray) => void) : void

    /**
     * Executes the query and returns an array of references. Short for `.get({ snapshots: false })`
     */
    find(): Promise<DataReferencesArray>

    /**
     * Executes the query and returns the number of results
     */
    count(): Promise<number>

    /**
     * Executes the query and returns if there are any results
     */
    exists(): Promise<boolean>

    /**
     * Executes the query, removes all matches from the database
     * @returns returns an Promise that resolves once all matches have been removed
     */
    remove() : Promise<QueryRemoveResult[]>
    /**
     * @param {() => void} callback callback to use instead of returning a promise
     */
    remove(callback: (results: QueryRemoveResult[]) => void) : void

    /**
     * Subscribes to an event. Supported events are:
     *  "stats": receive information about query performance.
     *  "hints": receive query or index optimization hints
     *  "add", "change", "remove": receive real-time query result changes
     * @param event Name of the event to subscribe to
     * @param callback Callback function
     * @returns returns reference to this query
     */
    on(event: string, callback?: RealtimeQueryEventCallback): DataReferenceQuery

    /**
     * Unsubscribes from a previously added event(s)
     * @param event Name of the event
     * @param callback callback function to remove
     * @returns returns reference to this query
     */
    off(event?:string, callback?: (event:object) => void): DataReferenceQuery

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
     forEach(callback: ForEachIteratorCallback): Promise<ForEachIteratorResult>
     /**
      * @param options specify what data to load for each child. Eg `{ include: ['title', 'description'] }` 
      * will only load each child's title and description properties
      */
     forEach(options: DataRetrievalOptions, callback: ForEachIteratorCallback): Promise<ForEachIteratorResult>
}

export class DataSnapshotsArray extends Array<DataSnapshot> {
    static from(snaps: DataSnapshot[]): DataSnapshotsArray
    getValues(): any[]
}

export class DataReferencesArray extends Array<DataReference> {
    static from(refs: DataReference[]): DataReferencesArray
    getPaths(): string[]
}

export interface DataRetrievalOptions {
    /** child keys to include (will exclude other keys), can include wildcards (eg "messages/*\/title") */
    include?: Array<string|number>
    /** child keys to exclude (will include other keys), can include wildcards (eg "messages/*\/replies") */
    exclude?: Array<string|number>
    /** whether or not to include any child objects, default is true */
    child_objects?: boolean
    /**
     * If a cached value is allowed to be served. A cached value will be used if the client is offline, if cache priority setting is true, or if the cached value is available and the server value takes too long to load (>1s). If the requested value is not filtered, the cache will be updated with the received server value, triggering any event listeners set on the path. Default is `true`.  
     * @deprecated Use `cache_mode: "allow"` instead
     */
    allow_cache?: boolean
    /** 
     * Use a cursor to update the local cache with mutations from the server, then load and serve the entire 
     * value from cache. Only works in combination with `cache_mode: "allow"` (default).
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
}

export interface QueryDataRetrievalOptions extends DataRetrievalOptions {
    /** whether to return snapshots of matched nodes (include data), or references only (no data). Default is true */
    snapshots?: boolean
}
