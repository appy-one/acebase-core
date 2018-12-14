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
        ref(path: string): DataReference
        root: DataReference
    }

    interface DataReference
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
         * @param {(currentValue: any) => any} callback - callback function(currentValue) => newValue: is called with a snapshot of the current value, must return a new value to store in the database
         * @returns {Promise<DataReference>} returns a promise that resolves with the DataReference once the transaction has been processed
         */
        transaction(callback: (currentValue: any) => any): Promise<DataReference>

        /**
         * Subscribes to an event. Supported events are "value", "child_added", "child_changed", "child_removed", 
         * which will run the callback with a snapshot of the data. If you only wish to receive notifications of the 
         * event (without the data), use the "notify_value", "notify_child_added", "notify_child_changed", 
         * "notify_child_removed" events instead, which will run the callback with a DataReference to the changed 
         * data. This enables you to manually retreive data upon changes (eg if you want to exclude certain child 
         * data from loading)
         * @param {string} event - Name of the event to subscribe to
         * @param {((snapshotOrReference:DataSnapshot|DataReference) => void)|boolean} callback - Callback function(snapshot) or whether or not to run callbacks on current values when using "value" or "child_added" events
         * @returns {EventStream} returns an EventStream
         */
        on(event: string, callback?: ((snapshotOrReference:DataSnapshot|DataReference) => void)|boolean, cancelCallbackOrContext?, context?): EventStream

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
         * @param options data retrieval options to include or exclude specific child keys.
         * @returns {Promise<DataSnapshot>} returns a promise that resolves with a snapshot of the data
         */
        get(options:DataRetrievalOptions): Promise<DataSnapshot>
        /**
         * Gets a snapshot of the stored value. Shorthand method for .once("value", callback)
         * @param callback callback function that runs with a snapshot of the data
         * @returns {Promise<DataSnapshot>} returns a promise that resolves with a snapshot of the data
         */
        get(callback:((snapshot:DataSnapshot) => void)): Promise<DataSnapshot>

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

    // TODO
    class DataReferenceQuery {}


    class DataSnapshot {
        ref:DataReference
        val(): any
        exists:boolean
        key:string|number
        child(path)
        hasChild(path) 
        hasChildren()
        numChildren()
        forEach(action)
    }
    class DataRetrievalOptions {
        include?:Array<string|number>
        exclude?: Array<string|number>
        child_objects?: boolean
        constructor(options: { include?: Array<string|number>, exclude?: Array<string|number>, child_objects?: boolean })
    }
    class EventStream {
        /**
         * Subscribe to new value events in the stream
         * @param {function} callback | function(val) to run once a new value is published
         * @param {(activated: boolean, cancelReason?: string) => void} activationCallback callback that notifies activation or cancelation of the subscription by the publisher. 
         * @returns {EventSubscription} returns a subscription to the requested event
         */        
        subscribe(callback: (val: any) => void, activationCallback?: (activated: boolean, cancelReason?: string) => void)

        /**
         * Stops monitoring new value events
         * @param {function} callback | (optional) specific callback to remove. Will remove all callbacks when omitted
         */        
        unsubscribe(callback?: (val: any) => void)
    }

}

export = acebasecore;