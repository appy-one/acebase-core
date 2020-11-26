import { DataReference } from './data-reference';
import { DataSnapshot } from './data-snapshot';
import { EventSubscription } from './subscription';
import { Observable } from './optional-observable';

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
    onMutation(callback: (mutationSnapshot: DataSnapshot, isRemoteChange: boolean) => any)
    /**
     * Registers a callback function to call when an error occurs behind the scenes
     * @param callback 
     */
    onError(callback: (error: { source: string, message: string, details: Error }) => any)
}

export interface ILiveDataProxyValue<T> {
    /**
     * Pushes a child value to the object collection
     * @param entry child to add
     * @returns returns the new child's key (property name)
     */
    push(entry: any): string
    push<T>(entry: T): string
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
    remove(): void
    /**
     * Executes a callback for each child in the object collection. 
     * @param callback Callback function to run for each child. If the callback returns false, it will stop.
     */
    forEach(callback: (child: any, key: string, index: number) => void|boolean)
    forEach<T>(callback: (child: T, key: string, index: number) => void|boolean)
    /**
     * Creates an array from current object collection, and optionally sorts it with passed
     * sorting function. All entries in the array will remain proxied values, but the array 
     * itself is not: changes to the array itself (adding/removing/ordering items) will NOT be
     * saved to the database!
     */
    toArray(sortFn?: (a, b) => number): any[]
    toArray<T>(sortFn?: (a:T, b:T) => number): T[]
    /**
     * Gets the value wrapped by this proxy. If the value is an object, it is still live but 
     * READ-ONLY, meaning that it is still being updated with changes made in the database, 
     * BUT any changes made to this object will NOT be saved to the database!
     */
    getTarget(): T
    /**
     * @param warn whether to log a warning message. Default is true
     */
    getTarget(warn: boolean): T
    /**
     * Gets a reference to the target data
     */
    getRef(): DataReference
    /**
     * Starts a subscription that monitors the current value for changes.
     * @param callback Function that is called each time the value was updated in the database. 
     * The callback might be called before the local cache value is updated, so make sure to 
     * use the READ-ONLY values passed to your callback. If you make changes to the value being
     * monitored (the proxied version), make sure you are not creating an endless loop!
     * If your callback returns false, the subscription is stopped.
     * @returns Returns an EventSubscription, call .stop() on it to unsubscribe.
     */
    onChanged(callback: DataProxyOnChangeCallback<T>): EventSubscription
    /**
     * Returns a RxJS Observable with a READ-ONLY value each time a mutation takes place.
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
    getObservable(): Observable<T>
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
    startTransaction(): Promise<ILiveDataProxyTransaction>
}

export interface ILiveDataProxyTransaction {
    readonly status: 'started'|'finished'|'canceled'
    /**
     * Indicates if this transaction has completed, or still needs to be committed or rolled back
     */
    readonly completed: boolean
    /**
     * Commits the transaction by updating the database with all changes made to the proxied object while the transaction was active
     */
    commit(): Promise<void>
    /**
     * Rolls back any changes made to the proxied value while the transaction was active.
     */
    rollback(): void
}

/**
 * Convenience function to access ILiveDataProxyValue methods on a proxied value
 * @param proxiedValue The proxied value to get access to
 * @returns Returns the same object typecasted to an ILiveDataProxyValue
 * @example
 * // IChatMessages is an IObjectCollection<IChatMessage>
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
export function proxyAccess(proxiedValue: any): ILiveDataProxyValue<any>
export function proxyAccess<T>(proxiedValue: T): ILiveDataProxyValue<T>

/**
 * 
 * @callback DataProxyOnChangeCallback
 */
export interface DataProxyOnChangeCallback<T> { 
    /**
     * @param value Read-only copy of the new value.
     * @param previous Read-only copy of the previous value.
     * @param isRemote Whether the change was done outside of the current proxy.
     * @param context Context used by the code that causing this change.
     * @returns Return false if you want to stop monitoring changes
     */
    (value: T, previous: T, isRemote: boolean, context: any): void|boolean
}

/** 
 * Convenience interface for defining an object collection
 * @example
 * interface IChatMessage { 
 *    text: string, uid: string, sent: Date 
 * }
 * interface IChat {
 *    title: text
 *    messages: IObjectCollection<IChatMessage>
 * }
 */
export interface IObjectCollection<T> {
    [key: string]: T
}