/**
   ________________________________________________________________________________
   
      ___          ______                
     / _ \         | ___ \               
    / /_\ \ ___ ___| |_/ / __ _ ___  ___ 
    |  _  |/ __/ _ \ ___ \/ _` / __|/ _ \
    | | | | (_|  __/ |_/ / (_| \__ \  __/
    \_| |_/\___\___\____/ \__,_|___/\___|
                        realtime database
                                     
   Copyright 2018 by Ewout Stortenbeker (me@appy.one)   
   Published under MIT license

   See docs at https://www.npmjs.com/package/acebase
   ________________________________________________________________________________
  
*/
import { SimpleEventEmitter } from './simple-event-emitter';
import { DataReference, DataReferenceQuery } from './data-reference';
import { TypeMappings } from './type-mappings';
import { setObservable } from './optional-observable';
import { Api } from './api';
import { DebugLogger } from './debug';
import { ColorStyle, SetColorsEnabled } from './simple-colors';

export class AceBaseBaseSettings {
    logLevel?: 'verbose'|'log'|'warn'|'error';
    logColors?: boolean;
    info?: string;

    constructor(options: any) {
        if (typeof options !== 'object') { options = {}; }
        this.logLevel = options.logLevel || 'log';
        this.logColors = typeof options.logColors === 'boolean' ? options.logColors : true;
        this.info = typeof options.info === 'string' ? options.info : undefined;
    }
}

export abstract class AceBaseBase extends SimpleEventEmitter {
    protected _ready: boolean;
    
    api: Api;
    debug: DebugLogger;
    types: TypeMappings;
    readonly name: string

    /**
     * @param dbname Name of the database to open or create
     */
    constructor(dbname: string, options: AceBaseBaseSettings) {
        super();
        options = new AceBaseBaseSettings(options || {});

        this.name = dbname;

        // Setup console logging
        this.debug = new DebugLogger(options.logLevel, `[${dbname}]`);

        // Enable/disable logging with colors
        SetColorsEnabled(options.logColors);

        // ASCI art: http://patorjk.com/software/taag/#p=display&f=Doom&t=AceBase
        const logoStyle = [ColorStyle.magenta, ColorStyle.bold];
        const logo =
            '     ___          ______                ' + '\n' +
            '    / _ \\         | ___ \\               ' + '\n' +
            '   / /_\\ \\ ___ ___| |_/ / __ _ ___  ___ ' + '\n' +
            '   |  _  |/ __/ _ \\ ___ \\/ _` / __|/ _ \\' + '\n' +
            '   | | | | (_|  __/ |_/ / (_| \\__ \\  __/' + '\n' +
            '   \\_| |_/\\___\\___\\____/ \\__,_|___/\\___|';
        
        const info = (options.info ? ''.padStart(40 - options.info.length, ' ') + options.info + '\n' : '');

        this.debug.write(logo.colorize(logoStyle));
        info && this.debug.write(info.colorize(ColorStyle.magenta));

        // Setup type mapping functionality
        this.types = new TypeMappings(this);

        this.once("ready", () => {
            // console.log(`database "${dbname}" (${this.constructor.name}) is ready to use`);
            this._ready = true;
        });
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

    get schema() {
        return { 
            get: (path: string) => {
                return this.api.getSchema(path);
            }, 
            set: (path: string, schema: Object|string) => {
                return this.api.setSchema(path, schema);
            }, 
            all: () => {
                return this.api.getSchemas();
            },
            check: (path: string, value: any, isUpdate: boolean) => {
                return this.api.validateSchema(path, value, isUpdate);
            }
        };
    }

}