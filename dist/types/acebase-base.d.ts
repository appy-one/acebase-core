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
import type { Api } from './api';
import { DebugLogger, LoggingLevel } from './debug';
export declare class AceBaseBaseSettings {
    /**
     * What level to use for console logging.
     * @default 'log'
     */
    logLevel: LoggingLevel;
    /**
     * Whether to use colors in the console logs output
     * @default true
     */
    logColors: boolean;
    /**
     * @internal (for internal use)
     */
    info: string;
    /**
     * You can turn this on if you are a sponsor. See https://github.com/appy-one/acebase/discussions/100 for more info
     */
    sponsor: boolean;
    constructor(options: Partial<AceBaseBaseSettings>);
}
export declare abstract class AceBaseBase extends SimpleEventEmitter {
    protected _ready: boolean;
    /**
     * @internal (for internal use)
     */
    api: Api;
    /**
     * @internal (for internal use)
     */
    debug: DebugLogger;
    /**
     * Type mappings
     */
    types: TypeMappings;
    readonly name: string;
    /**
     * @param dbname Name of the database to open or create
     */
    constructor(dbname: string, options?: Partial<AceBaseBaseSettings>);
    /**
     * Waits for the database to be ready before running your callback.
     * @param callback (optional) callback function that is called when the database is ready to be used. You can also use the returned promise.
     * @returns returns a promise that resolves when ready
     */
    ready(callback?: () => void): Promise<void>;
    get isReady(): boolean;
    /**
     * Allow specific observable implementation to be used
     * @param ObservableImpl Implementation to use
     */
    setObservable(ObservableImpl: any): void;
    /**
     * Creates a reference to a node
     * @param path
     * @returns reference to the requested node
     */
    ref(path: string): DataReference;
    /**
     * Get a reference to the root database node
     * @returns reference to root node
     */
    get root(): DataReference;
    /**
     * Creates a query on the requested node
     * @param path
     * @returns query for the requested node
     */
    query(path: string): DataReferenceQuery;
    get indexes(): {
        /**
         * Gets all indexes
         */
        get: () => Promise<import("./api").IDataIndex[]>;
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
        create: (path: string, key: string, options?: {
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
        }) => Promise<import("./api").IDataIndex>;
        /**
         * Deletes an existing index from the database
         */
        delete: (filePath: string) => Promise<void>;
    };
    get schema(): {
        get: (path: string) => Promise<import("./api").IAceBaseSchemaInfo>;
        set: (path: string, schema: Record<string, unknown> | string) => Promise<void>;
        all: () => Promise<import("./api").IAceBaseSchemaInfo[]>;
        check: (path: string, value: unknown, isUpdate: boolean) => Promise<{
            ok: boolean;
            reason?: string;
        }>;
    };
}
//# sourceMappingURL=acebase-base.d.ts.map