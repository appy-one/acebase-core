
class Api {
    // interface for local and web api's
    stats(options = undefined) {}

    /**
     * 
     * @param {string} path | reference
     * @param {string} event | event to subscribe to ("value", "child_added" etc)
     * @param {function} callback | callback function(err, path, value)
     */
    subscribe(path, event, callback) {}

    // TODO: add jsdoc comments

    unsubscribe(path, event, callback) {}
    update(path, updates) {}
    set(path, value) {}
    get(path, options) {}
    exists(path) {}
    query(path, query, options) {}
    createIndex(path, key) {}
    getIndexes() {}
}

module.exports = { Api };