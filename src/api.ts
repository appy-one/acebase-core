/* eslint-disable @typescript-eslint/no-unused-vars */
import { SimpleEventEmitter } from './simple-event-emitter';
import type { TypedArrayLike } from './utils';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IDataIndex {
    /**
     * Path of the indexed collection
     */
    path: string;

    /**
     * key (property) of the indexed items in the collection
     */
    key: string;

    /**
     * Whether the values are indexed with case sensitivity or not (applies to string values only)
     */
    caseSensitive: boolean;

    /**
     * Locale of the indexed string values
     */
    textLocale: string;

    /**
     * Key (property) that contains the locale of an indexed item, overrides the default in textLocale
     */
    textLocaleKey?: string;

    /**
     * keys (properties) whose values are included in the index
     */
    includeKeys: string[];

    /**
     * Any additional info that is being stored with the items. Eg for fulltext indexes, it contains the word count and location
     */
    indexMetadataKeys: string[];

    /**
     * Type of index, eg 'normal', 'fulltext', 'array' or 'geo'
     */
    type: string;

    /**
     * name of the index file on disk
     */
    fileName: string;

    /**
     * description of the index
     */
    description: string;
 }

export interface QueryFilter {
    key: string | number;
    op: string;
    compare: any;
}

export interface QueryOrder {
    key: string;
    ascending: boolean
}

export interface Query {
    filters: QueryFilter[];

    /**
     * number of results to skip, useful for paging
     */
    skip: number;

    /**
     * max number of results to return
     */
    take: number;

    /**
     * sort order
     */
    order: QueryOrder[];
}

export interface QueryOptions {
    /**
     * whether to return matching data, or paths to matching nodes only
     * @default false
     */
    snapshots?: boolean;

    /**
     * when using snapshots, keys or relative paths to include in result data
     */
    include?: (string | number)[];

    /**
     * when using snapshots, keys or relative paths to exclude from result data
     */
    exclude?: (string | number)[];

    /**
     * when using snapshots, whether to include child objects in result data
     * @default true
     */
    child_objects?: boolean;

    /**
     * Whether to allow cached results
     * @deprecated Use `cache_mode` instead */
    allow_cache?: boolean

    /** How to handle results from cache */
    cache_mode?: 'allow'|'bypass'|'force'

    /**
     * callback function for events
     */
    eventHandler?: (event: { name: 'add' | 'change' | 'remove'; path: string; value: any; } | { name: string;  [key: string]: any }) => boolean|void;

    /**
     * monitor changes
     * @default false
     */
    monitor?: boolean | {
        /**
         * monitor new matches (either because they were added, or changed and now match the query)
         */
        add?: boolean;

        /**
         * monitor changed children that still match this query
         */
        change?: boolean;

        /**
         * monitor children that don't match this query anymore
         */
        remove?: boolean;
    }
}

/**
 * For backward compatiblity
 * @deprecated Use `Query`
 */
export type IApiQuery = Query;
/**
 * For backward compatiblity
 * @deprecated Use `QueryOptions`
 */
export type IApiQueryOptions = QueryOptions;


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
export type StreamReadFunction = (length: number) => string | TypedArrayLike | Promise<string | TypedArrayLike>;

export type ReflectionType = 'info' | 'children';
export interface IReflectionNodeInfo {
    key: string | number;
    exists: boolean;
    type: 'unknown' | 'object' | 'array' | 'number' | 'boolean' | 'string' | 'date' | 'bigint' | 'binary' | 'reference'; // future: |'document'
    /** only present for small values (number, boolean, date), small strings & binaries, and empty objects and arrays */
    value?: any;
    /** Physical storage location details used by the target database type */
    address?: any;
    /** children are included for the target path of the reflection request */
    children?: { count: number } | {
        more: boolean;
        list: Pick<IReflectionNodeInfo, 'key' | 'type' | 'value' | 'address' | 'access'>[];
    };
    /** access rights if impersonation is used in reflection request */
    access?: {
        read: boolean;
        write: boolean;
    };
}

export interface IReflectionChildrenInfo {
    more: boolean;
    list: Pick<IReflectionNodeInfo, 'key' | 'type' | 'value' | 'address'>[];
}


class NotImplementedError extends Error {
    constructor(name: string) { super(`${name} is not implemented`); }
}

export interface IAceBaseSchemaInfo {
    path: string
    schema: Record<string, any>|string
    text: string
}

export type EventSubscriptionCallback = (err: Error | null, path: string, value: any, previous?: any, eventContext?: any) => void
export type EventSubscriptionSettings = { newOnly: boolean, cancelCallback: (err: Error) => void, syncFallback: 'reload'|(() => any|Promise<any>) }

// export type GetMutationsResult = {
//     used_cursor: string, new_cursor: string,
//     mutations: Array<{ path: string, type: 'set'|'update', previous: any, value: any, context: any }> };

/**
 * Uncompressed mutation: a single database operation of `type` `"set"` (overwrite) or `"update"` (merge) on `mutations.path`
 * caused the value of `path` to be mutated to `value`
 */
export type ValueMutation = {
    /** path the mutation had effect on */
    path: string,
    /** database operation used */
    type: 'set'|'update',
    /** new effective value of the node at current `path` */
    value: unknown,
    /** context used when database operation executed */
    context: unknown,
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
            val: unknown
            /** prev value stored at target */
            prev: unknown
        }>
    }
};
/**
 * Compressed mutation: one or more database operations caused the value of the node at `path` to effectively be mutated
 * from `previous` to `value` using database operation logic of `type` `"set"` (overwrite) or `"update"` (merge)
 */
export type ValueChange = { path: string, type: 'set'|'update', previous: any, value: any, context: any }

export type TransactionLogFilter = ({
    /**
     * cursor to use
     */
    cursor: string
} | {
    /**
     * timestamp to use
     */
    timestamp: number
}) & {
    /**
     * path to get all mutations for, only used if `for` property isn't used
     */
    path?: string;
    /**
     * paths and events to get relevant mutations for
     */
    for?: Array<{ path: string, events: string[] }>;
};

/**
 * Refactor to type/interface once acebase and acebase-client have been ported to TS
 */
export abstract class Api extends SimpleEventEmitter {
    constructor() {
        super();
    }

    /**
     * Provides statistics
     * @param options
     */
    stats(options?: any): Promise<any> { throw new NotImplementedError('stats'); }

    /**
     * @param path
     * @param event event to subscribe to ("value", "child_added" etc)
     * @param callback callback function
     */
    subscribe(path: string, event: string, callback: EventSubscriptionCallback, settings?: EventSubscriptionSettings): void|Promise<void> { throw new NotImplementedError('subscribe'); }

    unsubscribe(path: string, event?: string, callback?: EventSubscriptionCallback): void|Promise<void> { throw new NotImplementedError('unsubscribe'); }

    update(path: string, updates: any, options?: any): Promise<{ cursor?: string }> { throw new NotImplementedError('update'); }

    set(path: string, value: any, options?: any): Promise<{ cursor?: string }> { throw new NotImplementedError('set'); }

    get(path: string, options?: any): Promise<{ value: any, context: any, cursor?: string }> { throw new NotImplementedError('get'); }

    transaction(path: string, callback: (val: any) => any, options?: any): Promise<{ cursor?: string }> { throw new NotImplementedError('transaction'); }

    exists(path: string): Promise<boolean> { throw new NotImplementedError('exists'); }

    query(path: string, query: Query, options?: QueryOptions): Promise<{
        results: Array<{ path: string, val: any }> | string[];
        context: any;
        stop(): Promise<void>;
    }> { throw new NotImplementedError('query'); }

    reflect(path: string, type: 'children', args: any): Promise<IReflectionChildrenInfo>;
    reflect(path: string, type: 'info', args: any): Promise<IReflectionNodeInfo>;
    reflect(path: string, type: ReflectionType, args: any): Promise<any>;
    reflect(path: string, type: ReflectionType, args: any): Promise<any> { throw new NotImplementedError('reflect'); }

    export(path: string, write: StreamWriteFunction, options: any): Promise<void> { throw new NotImplementedError('export'); }

    import(path: string, read: StreamReadFunction, options: any): Promise<void> { throw new NotImplementedError('import'); }

    /** Creates an index on key for all child nodes at path */
    createIndex(path: string, key: string, options: any): Promise<IDataIndex> { throw new NotImplementedError('createIndex'); }

    getIndexes(): Promise<IDataIndex[]> { throw new NotImplementedError('getIndexes'); }

    deleteIndex(filePath: string): Promise<void> { throw new NotImplementedError('deleteIndex'); }

    setSchema(path: string, schema: Record<string, any> | string, warnOnly?: boolean): Promise<void> { throw new NotImplementedError('setSchema'); }

    getSchema(path: string): Promise<IAceBaseSchemaInfo> { throw new NotImplementedError('getSchema'); }

    getSchemas(): Promise<IAceBaseSchemaInfo[]> { throw new NotImplementedError('getSchemas'); }

    validateSchema(path: string, value: any, isUpdate: boolean): Promise<{ ok: boolean, reason?: string, warning?: string }> { throw new NotImplementedError('validateSchema'); }

    getMutations(filter: ({ cursor: string } | { timestamp: number }) & { path?:string, for?: Array<{ path: string, events: string[] }> }): Promise<{ used_cursor: string | null, new_cursor: string, mutations: ValueMutation[] }> { throw new NotImplementedError('getMutations'); }

    getChanges(filter: ({ cursor: string } | { timestamp: number }) & { path?:string, for?: Array<{ path: string, events: string[] }> }): Promise<{ used_cursor: string | null, new_cursor: string, changes: ValueChange[] }> { throw new NotImplementedError('getChanges'); }
}
