/**
   ________________________________________________________________________________
   
      ___          ______                
     / _ \         | ___ \               
    / /_\ \ ___ ___| |_/ / __ _ ___  ___ 
    |  _  |/ __/ _ \ ___ \/ _` / __|/ _ \
    | | | | (_|  __/ |_/ / (_| \__ \  __/
    \_| |_/\___\___\____/ \__,_|___/\___|
                                     
   Copyright 2018-2020 Ewout Stortenbeker (me@appy.one)   
   Published under MIT license
   ________________________________________________________________________________
  
 */
const { SimpleEventEmitter } = require('./simple-event-emitter');
const { DataReference, DataReferenceQuery } = require('./data-reference');
const { TypeMappings } = require('./type-mappings');
const { setObservable } = require('./optional-observable');

class AceBaseSettings {
    constructor(options) {
        // if (typeof options.api !== 'object') {
        //     throw new Error(`No api passed to AceBaseSettings constructor`);
        // }
        this.logLevel = options.logLevel || "log";
        this.logPrefixing = typeof options.logPrefixing === 'boolean' ? options.logPrefixing : true;
        this.logColors = typeof options.logColors === 'boolean' ? options.logColors : true;
    }
}

class AceBaseBase extends SimpleEventEmitter {

    /**
     * 
     * @param {string} dbname | Name of the database to open or create
     * @param {AceBaseSettings} options | 
     */
    constructor(dbname, options) {
        super();

        if (!options) { options = {}; }

        // Not needed anymore now we're using SimpleEventEmitter:
        // this.setMaxListeners(50); // Prevent warning for >10 "ready" event listeners, increase to 50
        this.once("ready", () => {
            // console.log(`database "${dbname}" (${this.constructor.name}) is ready to use`);
            this._ready = true;
        });

        // Specific api given such as web api, or browser api etc
        // this.api = new options.api.class(dbname, options.api.settings, ready => {
        //     this.emit("ready");
        // });

        this.types = new TypeMappings(this);
    }

    /**
     * 
     * @param {()=>void} [callback] (optional) callback function that is called when ready. You can also use the returned promise
     * @returns {Promise<void>} returns a promise that resolves when ready
     */
    ready(callback = undefined) {
        if (this._ready === true) { 
            // ready event was emitted before
            callback && callback();
            return Promise.resolve();
        }
        else {
            // Wait for ready event
            let resolve;
            const promise = new Promise(res => resolve = res);
            this.on("ready", () => {
                resolve();
                callback && callback(); 
            });
            return promise;
        }
    }

    get isReady() {
        return this._ready === true;
    }

    /**
     * Allow specific observable implementation to be used
     * @param {Observable} Observable Implementation to use
     */
    setObservable(Observable) {
        setObservable(Observable);
    }

    /**
     * Creates a reference to a node
     * @param {string} path 
     * @returns {DataReference} reference to the requested node
     */
    ref(path) {
        return new DataReference(this, path);
    }

    /**
     * Get a reference to the root database node
     * @returns {DataReference} reference to root node
     */
    get root() {
        return this.ref("");
    }

    /**
     * Creates a query on the requested node
     * @param {string} path 
     * @returns {DataReferenceQuery} query for the requested node
     */
    query(path) {
        const ref = new DataReference(this, path);
        return new DataReferenceQuery(ref);
    }

    get indexes() {
        return {
            /**
             * Gets all indexes
             */
            get: () => {
                return this.api.getIndexes();
            },
            /**
             * Creates an index on "key" for all child nodes at "path". If the index already exists, nothing happens.
             * Example: creating an index on all "name" keys of child objects of path "system/users", 
             * will index "system/users/user1/name", "system/users/user2/name" etc.
             * You can also use wildcard paths to enable indexing and quering of fragmented data.
             * Example: path "users/*\/posts", key "title": will index all "title" keys in all posts of all users.
             * @param {string} path path to the container node
             * @param {string} key name of the key to index every container child node
             * @param {object} [options] any additional options
             * @param {string} [options.type] special index type, such as 'fulltext', or 'geo'
             * @param {string[]} [options.include] keys to include in the index. Speeds up sorting on these columns when the index is used (and dramatically increases query speed when .take(n) is used in addition)
             * @param {object} [options.config] additional index-specific configuration settings 
             */
            create: (path, key, options) => {
                return this.api.createIndex(path, key, options);
            }
        };
    }

}

module.exports = { AceBaseBase, AceBaseSettings };