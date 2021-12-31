"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Api = void 0;
class NotImplementedError extends Error {
    constructor(name) { super(`${name} is not implemented`); }
}
class Api {
    constructor(dbname, settings, readyCallback) { }
    /**
     * Provides statistics
     * @param options
     */
    stats(options) { throw new NotImplementedError('stats'); }
    /**
     * @param path
     * @param event event to subscribe to ("value", "child_added" etc)
     * @param callback callback function
     */
    subscribe(path, event, callback, settings) { throw new NotImplementedError('subscribe'); }
    unsubscribe(path, event, callback) { throw new NotImplementedError('unsubscribe'); }
    update(path, updates, options) { throw new NotImplementedError('update'); }
    set(path, value, options) { throw new NotImplementedError('set'); }
    get(path, options) { throw new NotImplementedError('get'); }
    transaction(path, callback, options) { throw new NotImplementedError('transaction'); }
    exists(path) { throw new NotImplementedError('exists'); }
    query(path, query, options) { throw new NotImplementedError('query'); }
    reflect(path, type, args) { throw new NotImplementedError('reflect'); }
    export(path, arg, options) { throw new NotImplementedError('export'); }
    import(path, stream, options) { throw new NotImplementedError('import'); }
    /** Creates an index on key for all child nodes at path */
    createIndex(path, key, options) { throw new NotImplementedError('createIndex'); }
    getIndexes() { throw new NotImplementedError('getIndexes'); }
    setSchema(path, schema) { throw new NotImplementedError('setSchema'); }
    getSchema(path) { throw new NotImplementedError('getSchema'); }
    getSchemas() { throw new NotImplementedError('getSchemas'); }
    validateSchema(path, value, isUpdate) { throw new NotImplementedError('validateSchema'); }
    getMutations(filter) { throw new NotImplementedError('getMutations'); }
    getChanges(filter) { throw new NotImplementedError('getChanges'); }
}
exports.Api = Api;
//# sourceMappingURL=api.js.map