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
    /** Whether to allow cached results */
    allow_cache?: boolean
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

export type ReflectionType = 'info'|'children';

class NotImplementedError extends Error {
    constructor(name: string) { super(`${name} is not implemented`); }
}

export interface IAceBaseSchemaInfo {
    path: string
    schema: Object|string
    text: string
}

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
    subscribe(path: string, event: string, callback: (err: Error, path: string, value: any, previous: any, eventContext: any) => void): void|Promise<void> { throw new NotImplementedError('subscribe'); }

    unsubscribe(path: string, event?: string, callback?: (err: Error, path: string, value: any, previous: any, eventContext: any) => void): void|Promise<void> { throw new NotImplementedError('unsubscribe'); }

    update(path: string, updates: any, options: any): Promise<void> { throw new NotImplementedError('update'); }

    set(path: string, value: any, options: any): Promise<void> { throw new NotImplementedError('set'); }

    get(path: string, options: any): Promise<any> { throw new NotImplementedError('get'); }

    transaction(path: string, callback: (val: any) => any, options: any): Promise<any> { throw new NotImplementedError('transaction'); }

    exists(path: string): Promise<boolean> { throw new NotImplementedError('exists'); }

    query(path: string, query: IApiQuery, options:IApiQueryOptions): Promise<{ path: string, val: any }[]|string[]> { throw new NotImplementedError('query'); }

    reflect(path: string, type: ReflectionType, args: any): Promise<any> { throw new NotImplementedError('reflect'); }

    export(path: string, stream: IStreamLike, options: any): Promise<void> { throw new NotImplementedError('export'); }

     /** Creates an index on key for all child nodes at path */
    createIndex(path: string, key: string, options: any): Promise<IDataIndex> { throw new NotImplementedError('createIndex'); }

    getIndexes(): Promise<IDataIndex[]> { throw new NotImplementedError('getIndexes'); }

    setSchema(path: string, schema:Object|string): Promise<void> { throw new NotImplementedError('setSchema'); }

    getSchema(path: string): Promise<IAceBaseSchemaInfo> { throw new NotImplementedError('getSchema'); }

    getSchemas(): Promise<IAceBaseSchemaInfo[]> { throw new NotImplementedError('getSchemas'); }

    validateSchema(path: string, value: any, isUpdate: boolean): Promise<{ ok: boolean, reason?: string }> { throw new NotImplementedError('validateSchema'); } 
}