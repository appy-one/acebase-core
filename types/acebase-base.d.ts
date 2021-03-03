import { DataReference, DataReferenceQuery } from './data-reference';
import { TypeMappings } from './type-mappings';
import { DebugLogger } from './debug';
import { Api } from '../src/api';

export abstract class AceBaseBaseSettings {
    /**
     * What level to use for console logging.
     * @default 'log'
     */
    logLevel?: 'verbose'|'log'|'warn'|'error'
    /** Whether to use colors in the console logs output */
    logColors?: boolean
    constructor(options: any)
}

export abstract class AceBaseBase {
    protected _ready: boolean;
    protected api: Api;
    protected debug: DebugLogger;
    types: TypeMappings;
    readonly name: string

    /**
     * @param dbname name of the database to open or create
     */
    constructor(dbname: string, options: AceBaseBaseSettings)

    /**
     * Creates a reference to a node
     * @param path 
     * @returns reference to the requested node
     */
    ref(path: string) : DataReference
    root: DataReference
    query(path: string) : DataReferenceQuery
    on(event: string, callback: (...args: any[]) => void)
    once(event: string, callback: (...args: any[]) => void)
    off(event: string, callback: (...args: any[]) => void)

    /**
     * Waits for the database to be ready before running your callback. Do this before performing any other actions on your database
     * @param callback (optional) callback function that is called when ready. You can also use the returned promise
     * @returns returns a promise that resolves when ready
     */
    ready(callback?: () => void): Promise<void>
    readonly isReady: boolean
    readonly indexes: AceBaseIndexes

    /**
     * Allow specific observable implementation to be used
     * @param Observable Observable implementation to use
     */
    setObservable(Observable: any): void;
}

export class AceBaseIndexes {
    get(): Promise<DataIndex[]>

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
     * @returns {Promise<DataIndex>}
     */        
    create(path: string, key: string, options?: { type?: string, include?: string[], config?: object }): Promise<DataIndex>
}

export class DataIndex {
    readonly path: string
    readonly key: string
    readonly caseSensitive: boolean
    readonly textLocale: string
    readonly includeKeys: string[]
    
    /**
     * Any additional info that is being stored with the items. Eg for fulltext indexes, it contains the word count and location
     */
    readonly indexMetadataKeys: string[]
    readonly type: "normal" | "array" | "fulltext" | "geo"
    readonly fileName: string
    readonly description: string
}