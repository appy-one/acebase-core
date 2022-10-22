/**
   ________________________________________________________________________________

      ___          ______
     / _ \         | ___ \
    / /_\ \ ___ ___| |_/ / __ _ ___  ___
    |  _  |/ __/ _ \ ___ \/ _` / __|/ _ \
    | | | | (_|  __/ |_/ / (_| \__ \  __/
    \_| |_/\___\___\____/ \__,_|___/\___|
                        realtime database

   Copyright 2018-2022 by Ewout Stortenbeker (me@appy.one)
   Published under MIT license

   See docs at https://github.com/appy-one/acebase
   ________________________________________________________________________________

*/
import { SimpleEventEmitter } from './simple-event-emitter.js';
import { DataReference, DataReferenceQuery } from './data-reference.js';
import { TypeMappings } from './type-mappings.js';
import { setObservable } from './optional-observable.js';
import { DebugLogger } from './debug.js';
import { ColorStyle, SetColorsEnabled } from './simple-colors.js';
export class AceBaseBaseSettings {
    constructor(options) {
        /**
         * What level to use for console logging.
         * @default 'log'
         */
        this.logLevel = 'log';
        /**
         * Whether to use colors in the console logs output
         * @default true
         */
        this.logColors = true;
        /**
         * @internal (for internal use)
         */
        this.info = 'realtime database';
        /**
         * You can turn this on if you are a sponsor. See https://github.com/appy-one/acebase/discussions/100 for more info
         */
        this.sponsor = false;
        if (typeof options !== 'object') {
            options = {};
        }
        if (typeof options.logLevel === 'string') {
            this.logLevel = options.logLevel;
        }
        if (typeof options.logColors === 'boolean') {
            this.logColors = options.logColors;
        }
        if (typeof options.info === 'string') {
            this.info = options.info;
        }
        if (typeof options.sponsor === 'boolean') {
            this.sponsor = options.sponsor;
        }
    }
}
export class AceBaseBase extends SimpleEventEmitter {
    /**
     * @param dbname Name of the database to open or create
     */
    constructor(dbname, options = {}) {
        super();
        this._ready = false;
        options = new AceBaseBaseSettings(options);
        this.name = dbname;
        // Setup console logging
        this.debug = new DebugLogger(options.logLevel, `[${dbname}]`);
        // Enable/disable logging with colors
        SetColorsEnabled(options.logColors);
        // ASCI art: http://patorjk.com/software/taag/#p=display&f=Doom&t=AceBase
        const logoStyle = [ColorStyle.magenta, ColorStyle.bold];
        const logo = '     ___          ______                ' + '\n' +
            '    / _ \\         | ___ \\               ' + '\n' +
            '   / /_\\ \\ ___ ___| |_/ / __ _ ___  ___ ' + '\n' +
            '   |  _  |/ __/ _ \\ ___ \\/ _` / __|/ _ \\' + '\n' +
            '   | | | | (_|  __/ |_/ / (_| \\__ \\  __/' + '\n' +
            '   \\_| |_/\\___\\___\\____/ \\__,_|___/\\___|';
        const info = (options.info ? ''.padStart(40 - options.info.length, ' ') + options.info + '\n' : '');
        if (!options.sponsor) {
            // if you are a sponsor, you can switch off the "AceBase banner ad"
            this.debug.write(logo.colorize(logoStyle));
            info && this.debug.write(info.colorize(ColorStyle.magenta));
        }
        // Setup type mapping functionality
        this.types = new TypeMappings(this);
        this.once('ready', () => {
            // console.log(`database "${dbname}" (${this.constructor.name}) is ready to use`);
            this._ready = true;
        });
    }
    /**
     * Waits for the database to be ready before running your callback.
     * @param callback (optional) callback function that is called when the database is ready to be used. You can also use the returned promise.
     * @returns returns a promise that resolves when ready
     */
    async ready(callback) {
        if (!this._ready) {
            // Wait for ready event
            await new Promise(resolve => this.on('ready', resolve));
        }
        callback?.();
    }
    get isReady() {
        return this._ready;
    }
    /**
     * Allow specific observable implementation to be used
     * @param ObservableImpl Implementation to use
     */
    setObservable(ObservableImpl) {
        setObservable(ObservableImpl);
    }
    /**
     * Creates a reference to a node
     * @param path
     * @returns reference to the requested node
     */
    ref(path) {
        return new DataReference(this, path);
    }
    /**
     * Get a reference to the root database node
     * @returns reference to root node
     */
    get root() {
        return this.ref('');
    }
    /**
     * Creates a query on the requested node
     * @param path
     * @returns query for the requested node
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
             * @param path path to the container node
             * @param key name of the key to index every container child node
             * @param options any additional options
             */
            create: (path, key, options) => {
                return this.api.createIndex(path, key, options);
            },
            /**
             * Deletes an existing index from the database
             */
            delete: async (filePath) => {
                return this.api.deleteIndex(filePath);
            },
        };
    }
    get schema() {
        return {
            get: (path) => {
                return this.api.getSchema(path);
            },
            set: (path, schema) => {
                return this.api.setSchema(path, schema);
            },
            all: () => {
                return this.api.getSchemas();
            },
            check: (path, value, isUpdate) => {
                return this.api.validateSchema(path, value, isUpdate);
            },
        };
    }
}
//# sourceMappingURL=acebase-base.js.map