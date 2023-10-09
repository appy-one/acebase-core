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
import { SimpleEventEmitter } from './simple-event-emitter';
import { DataReference, DataReferenceQuery } from './data-reference';
import { TypeMappings } from './type-mappings';
import { setObservable } from './optional-observable';
import type { Api } from './api';
import { DebugLogger, LoggingLevel } from './debug';
import { ColorStyle, SetColorsEnabled } from './simple-colors';
import { LoggerPlugin } from './logger';

export class AceBaseBaseSettings {
    /**
     * What level to use for console logging.
     * @default 'log'
     */
    logLevel: LoggingLevel = 'log';

    /**
     * Whether to use colors in the console logs output
     * @default true
     */
    logColors = true;

    /**
     * Custom logging library to use. Note that when using a custom logger, the `logLevel` and `logColors` settings will be ignored
     */
    logger?: LoggerPlugin;

    /**
     * @internal (for internal use)
     */
    info = 'realtime database';

    /**
     * You can turn this on if you are a sponsor. See https://github.com/appy-one/acebase/discussions/100 for more info
     */
    sponsor = false;

    constructor(options: Partial<AceBaseBaseSettings>) {
        if (typeof options !== 'object') { options = {}; }
        if (typeof options.logger === 'object') { this.logger = options.logger; }
        if (typeof options.logLevel === 'string') { this.logLevel = options.logLevel; }
        if (typeof options.logColors === 'boolean') { this.logColors = options.logColors; }
        if (typeof options.info === 'string') { this.info = options.info; }
        if (typeof options.sponsor === 'boolean') { this.sponsor = options.sponsor; }
    }
}

export abstract class AceBaseBase extends SimpleEventEmitter {
    protected _ready = false;

    /**
     * @internal (for internal use)
     */
    api: Api;

    /**
     * @internal (for internal use)
     * @deprecated use `logger` instead
     */
    debug: DebugLogger;

    /**
     * Logger plugin to use
     */
    logger: LoggerPlugin;

    /**
     * Type mappings
     */
    types: TypeMappings;

    readonly name: string;

    /**
     * @param dbname Name of the database to open or create
     */
    constructor(dbname: string, options: Partial<AceBaseBaseSettings> = {}) {
        super();
        options = new AceBaseBaseSettings(options);

        this.name = dbname;

        // Setup console logging
        const legacyLogger = new DebugLogger(options.logLevel, `[${dbname}]`);
        this.debug = legacyLogger; // For backward compatibility
        this.logger = options.logger ?? legacyLogger;

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

        if (!options.sponsor) {
            // if you are a sponsor, you can switch off the "AceBase banner ad"
            legacyLogger.write(logo.colorize(logoStyle));
            info && legacyLogger.write(info.colorize(ColorStyle.magenta));
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
    async ready(callback?: () => void) {
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
    setObservable(ObservableImpl: any): void {
        setObservable(ObservableImpl);
    }

    /**
     * Creates a reference to a node
     * @param path
     * @returns reference to the requested node
     */
    ref<T = any>(path: string): DataReference<T> {
        return new DataReference(this, path);
    }

    /**
     * Get a reference to the root database node
     * @returns reference to root node
     */
    get root(): DataReference {
        return this.ref('');
    }

    /**
     * Creates a query on the requested node
     * @param path
     * @returns query for the requested node
     */
    query(path: string): DataReferenceQuery {
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
            create: (
                path: string,
                key: string,
                options?: {
                    /** type of index to create, such as `fulltext`, `geo`, `array` or `normal` (default) */
                    type?: string;
                    /** whether to rebuild the index if it exists already */
                    rebuild?: boolean;
                    /** keys to include in the index. Speeds up sorting on these columns when the index is used (and dramatically increases query speed when .take(n) is used in addition) */
                    include?: string[];
                    /** If the indexed values are strings, which default locale to use */
                    textLocale?: string;
                    /** additional index-specific configuration settings */
                    config?: any;
                }) => {
                return this.api.createIndex(path, key, options);
            },
            /**
             * Deletes an existing index from the database
             */
            delete: async (filePath: string) => {
                return this.api.deleteIndex(filePath);
            },
        };
    }

    get schema() {
        return {
            get: (path: string) => {
                return this.api.getSchema(path);
            },
            set: (path: string, schema: Record<string, unknown>|string, warnOnly = false) => {
                return this.api.setSchema(path, schema, warnOnly);
            },
            all: () => {
                return this.api.getSchemas();
            },
            check: (path: string, value: unknown, isUpdate: boolean) => {
                return this.api.validateSchema(path, value, isUpdate);
            },
        };
    }
}
