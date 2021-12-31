export interface IDataIndex {
    // TODO
}

export interface IApiQuery {
    filters: Array<{ key: string|number, op: string, compare: any }>
    /** number of results to skip, useful for paging */
    skip: number
    /** number max number of results to return */
    take: number
    order: Array<{ key: string|number, ascending: boolean }>
}

export interface IApiQueryOptions {
    /** whether to return matching data, or paths to matching nodes only */
    snapshots?: boolean
    /** when using snapshots, keys or relative paths to include in result data */
    include?: (string|number)[]
    /** when using snapshots, keys or relative paths to exclude from result data */
    exclude?: (string|number)[]
    /** when using snapshots, whether to include child objects in result data */
    child_objects?: boolean
    /** 
     * Whether to allow cached results 
     * @deprecated Use `cache_mode` instead */
    allow_cache?: boolean
    /** How to handle results from cache */
    cache_mode?: 'allow'|'bypass'|'force'
    /** Event callback */
    eventHandler?: (event: { name: string, [key: string]: any }) => void
    /** monitor changes */
    monitor?: {
        /** monitor new matches (either because they were added, or changed and now match the query) */
        add?: boolean
        /** monitor changed children that still match this query */
        change?: boolean
        /** monitor children that don't match this query anymore */
        remove?: boolean
    }
}

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
export type StreamReadFunction = (length: number) => string | ArrayBufferView | Promise<string|ArrayBufferView>;

export type ReflectionType = 'info'|'children';

class NotImplementedError extends Error {
    constructor(name: string) { super(`${name} is not implemented`); }
}

export interface IAceBaseSchemaInfo {
    path: string
    schema: Object|string
    text: string
}

export type EventSubscriptionCallback = (err: Error, path: string, value: any, previous: any, eventContext: any) => void
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
    value: any,
    /** context used when database operation executed */
    context: any,
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
            val: any
            /** prev value stored at target */
            prev: any
        }>
    }
};
/**
 * Compressed mutation: one or more database operations caused the value of the node at `path` to effectively be mutated 
 * from `previous` to `value` using database operation logic of `type` `"set"` (overwrite) or `"update"` (merge)
 */
export type ValueChange = { path: string, type: 'set'|'update', previous: any, value: any, context: any }

export abstract class Api {
    constructor(dbname: string, settings: any, readyCallback: () => void) {}

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
    subscribe(path: string, event: string, callback: EventSubscriptionCallback, settings: EventSubscriptionSettings): void|Promise<void> { throw new NotImplementedError('subscribe'); }

    unsubscribe(path: string, event?: string, callback?: EventSubscriptionCallback): void|Promise<void> { throw new NotImplementedError('unsubscribe'); }

    update(path: string, updates: any, options: any): Promise<void> { throw new NotImplementedError('update'); }

    set(path: string, value: any, options: any): Promise<void> { throw new NotImplementedError('set'); }

    get(path: string, options: any): Promise<{ value: any, context: any }> { throw new NotImplementedError('get'); }

    transaction(path: string, callback: (val: any) => any, options: any): Promise<any> { throw new NotImplementedError('transaction'); }

    exists(path: string): Promise<boolean> { throw new NotImplementedError('exists'); }

    query(path: string, query: IApiQuery, options:IApiQueryOptions): Promise<{ results: { path: string, val: any }[]|string[], context: any }> { throw new NotImplementedError('query'); }

    reflect(path: string, type: ReflectionType, args: any): Promise<any> { throw new NotImplementedError('reflect'); }

    export(path: string, write: StreamWriteFunction, options: any): Promise<void>
    export(path: string, stream: IStreamLike, options: any): Promise<void>
    export(path: string, arg: any, options: any): Promise<void> { throw new NotImplementedError('export'); }

    import(path: string, stream: StreamReadFunction, options: any): Promise<void> { throw new NotImplementedError('import'); }

    /** Creates an index on key for all child nodes at path */
    createIndex(path: string, key: string, options: any): Promise<IDataIndex> { throw new NotImplementedError('createIndex'); }

    getIndexes(): Promise<IDataIndex[]> { throw new NotImplementedError('getIndexes'); }

    setSchema(path: string, schema:Object|string): Promise<void> { throw new NotImplementedError('setSchema'); }

    getSchema(path: string): Promise<IAceBaseSchemaInfo> { throw new NotImplementedError('getSchema'); }

    getSchemas(): Promise<IAceBaseSchemaInfo[]> { throw new NotImplementedError('getSchemas'); }

    validateSchema(path: string, value: any, isUpdate: boolean): Promise<{ ok: boolean, reason?: string }> { throw new NotImplementedError('validateSchema'); } 

    getMutations(filter: ({ cursor: string } | { timestamp: number }) & { path?:string, for?: Array<{ path: string, events: string[] }> }): Promise<{ used_cursor: string, new_cursor: string, mutations: ValueMutation[] }> { throw new NotImplementedError('getMutations'); } 

    getChanges(filter: ({ cursor: string } | { timestamp: number }) & { path?:string, for?: Array<{ path: string, events: string[] }> }): Promise<{ used_cursor: string, new_cursor: string, changes: ValueChange[] }> { throw new NotImplementedError('getChanges'); } 
}