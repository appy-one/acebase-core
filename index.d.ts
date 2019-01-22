declare namespace acebasecore {
    class AceBaseBase {
        /**
         * @param {string} dbname | Name of the database to open or create
         * @param {AceBaseSettings} options | 
         */
        constructor(dbname, options)

        /**
         * Creates a reference to a node
         * @param {string} path 
         * @returns {DataReference} reference to the requested node
         */
        ref(path: string) : DataReference
        root: DataReference
        query(path: string) : DataReferenceQuery
        types: TypeMappings
        on(event: string, callback: (...args: any[]) => void)

        /**
         * Waits for the database to be ready before running your callback. Do this before performing any other actions on your database
         * @param {()=>void} [callback] (optional) callback function that is called when ready. You can also use the returned promise
         * @returns {Promise<void>} returns a promise that resolves when ready
         */
        ready(callback?: () => void): Promise<void>;        
    }

    class TypeMappings {
        /**
         * Maps objects that are stored in a specific path to a constructor method, 
         * so they can automatically be serialized/deserialized when stored/loaded to/from
         * the database
         * @param {string} path path to an object container, eg "users" or "users/*\/posts"
         * @param {new (obj: any) => object} constructor constructor function (class name) to instantiate objects with
         * @param {TypeMappingOptions} [options] instantiate: boolean that specifies if the 
         * constructor method should be called using the "new" keyword, or just execute the 
         * function. serializer: function that can serialize your object for storing, if 
         * your class requires custom serialization, but does not implement a .serialize() method
         */
        bind(path: string, constructor: new (obj: any) => object, options?: TypeMappingOptions)
        /**
        * @param {(obj: any) => object} deserializer deserializer function to create objects with, eg static function MyClass.create
        */
        bind(path: string, deserializer: (obj: any) => object, options?: TypeMappingOptions)
    }

    interface TypeMappingOptions {
        /**
         * Whether the constructor function of the TypeMapping must be called with the 
         * "new" keyword or not. Default is true. Set this to false if your deserializer 
         * function is not a constructor.
         * @example
         * class User {
         *      constructor(name: string, email: string) {
         *          // ...
         *      }
         *      static from(obj) {
         *          return new User(obj.name, obj.email);
         *      }
         * }
         * // Binding with instantiate: false
         * db.types.bind('users', User.from, { instantiate: false });
         */
        instantiate: boolean
        /**
         * Serializer function to use when storing an object of your class
         */
        serializer: () => any
        // exclude: Array<string|number>
        // include: Array<string|number>
    }

    class DataReference
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
         * created by an event ("value", "child_added" etc)
         */
        readonly vars: object

        /**
         * Returns a new reference to a child node
         * @param {string} childPath Child key or path
         * @returns {DataReference} reference to the child
         */
        child(childPath: string): DataReference

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
         * Sets the value a node using a transaction: it runs you callback function with the current value, uses its return value as the new value to store.
         * @param {(currentValue: DataSnapshot) => any} callback - callback function(currentValue) => newValue: is called with a snapshot of the current value, must return a new value to store in the database
         * @returns {Promise<DataReference>} returns a promise that resolves with the DataReference once the transaction has been processed
         */
        transaction(callback: (currentValue: DataSnapshot) => any): Promise<DataReference>

        /**
         * Subscribes to an event. Supported events are "value", "child_added", "child_changed", "child_removed", 
         * which will run the callback with a snapshot of the data. If you only wish to receive notifications of the 
         * event (without the data), use the "notify_value", "notify_child_added", "notify_child_changed", 
         * "notify_child_removed" events instead, which will run the callback with a DataReference to the changed 
         * data. This enables you to manually retreive data upon changes (eg if you want to exclude certain child 
         * data from loading)
         * @param {string} event - Name of the event to subscribe to
         * @param {((snapshotOrReference:DataSnapshot|DataReference) => void)|boolean} callback - Callback function(snapshot) or whether or not to run callbacks on current values when using "value" or "child_added" events
         * @returns {EventStream<DataSnapshot|DataReference>} returns an EventStream
         */
        on(event: string, callback?: ((snapshotOrReference:DataSnapshot|DataReference) => void)|boolean, cancelCallbackOrContext?, context?): EventStream<DataSnapshot|DataReference>

        /**
         * Unsubscribes from a previously added event
         * @param {string} event | Name of the event
         * @param {Function} callback | callback function to remove
         */
        off(event?:string, callback?: () => any)

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
        push(value: any, onComplete?: () => void): Promise<DataReference>;
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

        query(): DataReferenceQuery

        reflect(type: string, args)
    }

    class DataReferenceQuery {

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
         * @param {string} op | operator to use
         * @param {any} compare | value to compare with
         * @returns {DataReferenceQuery}
         */                
        filter(key: string|number, op: string, compare: any): DataReferenceQuery

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
        get(options: QueryDataRetrievalOptions) : Promise<DataReferencesArray|DataSnapshotsArray>
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
         */
        getRefs() : Promise<DataReferencesArray>
        /**
         * @param {(references: DataReferencesArray) => void} callback callback to use instead of returning a promise
         * @returns {void} returns nothing because a callback is being used
         */
        getRefs(callback: (references: DataReferencesArray) => void) : void

        /**
         * Executes the query, removes all matches from the database
         * @returns {Promise<void>} | returns an Promise that resolves once all matches have been removed
         */
        remove() : Promise<void>
        /**
         * @param {() => void} callback callback to use instead of returning a promise
         */
        remove(callback: () => void) : void
    }


    class DataSnapshot {
        ref:DataReference
        val(): any
        exists(): boolean
        key: string|number
        child(path: string): DataSnapshot
        hasChild(path: string): boolean
        hasChildren(): boolean
        numChildren(): number
        forEach(action: (child: DataSnapshot) => boolean): void
    }
    
    class DataSnapshotsArray extends Array<DataSnapshot> {
        static from(snaps: DataSnapshot[]): DataSnapshotsArray
        getValues(): any[]
    }

    class DataReferencesArray extends Array<DataReference> {
        static from(refs: DataReference[]): DataReferencesArray
        getPaths(): string[]
    }

    interface DataRetrievalOptions {
        include?: Array<string|number>
        exclude?: Array<string|number>
        child_objects?: boolean
        // constructor(options: { include?: Array<string|number>, exclude?: Array<string|number>, child_objects?: boolean })
    }

    interface QueryDataRetrievalOptions extends DataRetrievalOptions {
        snapshots?: boolean
    }

    class EventStream<T> {
        /**
         * Subscribe to new value events in the stream
         * @param callback function to run once a new value is published
         * @param activationCallback callback that notifies activation or cancelation of the subscription by the publisher. 
         * @returns returns a subscription to the requested event
         */        
        subscribe(callback: (val: T) => void, activationCallback?: (activated: boolean, cancelReason?: string) => void): EventSubscription

        /**
         * Stops monitoring new value events
         * @param callback (optional) specific callback to remove. Will remove all callbacks when omitted
         */        
        unsubscribe(callback?: (val: T) => void): void
    }

    class EventSubscription {
        /**
         * Stops the subscription from receiving future events
         */
        stop(): void
        /**
         * Notifies when subscription is activated or canceled
         * @param callback optional callback to run each time activation state changes
         */
        activated(): Promise<void>
        /**
         * @param callback callback to run each time activation state changes
         */
        activated(callback: (activated: boolean, cancelReason?: string) => void): void
    }

    class PathInfo {
        static get(path: string): PathInfo
        static getChildPath(path: string, childKey:string|number): string
        static getPathKeys(path: string): Array<string|number>
        static extractVariables(varPath: string, fullPath: string): Array<{name?:string, value:string|number}>
        static fillVariables(varPath: string, fullPath: string) : string
        constructor(path: string)
        readonly key: string|number
        readonly parentPath: string|number
        childPath(childKey: string|number): string
        readonly pathKeys: Array<string|number>
        isAncestorOf(otherPath: string): boolean
        isDescendantOf(otherPath: string): boolean
        isChildOf(otherPath: string): boolean
        isParentOf(otherPath: string): boolean
    }

    class PathReference {
        path: string
        /**
         * Creates a reference to a path that can be stored in the database. Use this to create cross-references to other data in your database
         * @param {string} path
         */
        constructor(path: string)
    }

    class Utils {
        static cloneObject(original: object): object
    }
}

export = acebasecore;