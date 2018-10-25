const { Api } = require('./api');
const { AceBase } = require('./acebase');
const { Storage } = require('./storage');
//const { Record, VALUE_TYPES } = require('./record');
const { Node } = require('./node');

class LocalApi extends Api {
    // All api methods for local database instance
    
    /**
     * 
     * @param {AceBase} db | reference to the database
     * @param {Storage} storage | reference to the used Storage
     */
    constructor(db, storage) {
        super();
        this.db = db;
        this.storage = storage;
    }

    stats(options) {
        return Promise.resolve(this.storage.stats);
    }

    subscribe(ref, event, callback) {
        this.storage.subscriptions.add(ref.path, event, callback);
    }

    unsubscribe(ref, event = undefined, callback = undefined) {
        this.storage.subscriptions.remove(ref.path, event, callback);
    }

    set(ref, value, flags = undefined) {
        return Node.update(this.storage, ref.path, value, { merge: false });
    }

    update(ref, updates, flags = undefined) {
        return Node.update(this.storage, ref.path, updates, { merge: true });
    }

    get(ref, options) {
        return Node.getValue(this.storage, ref.path, options);
    }

    transaction(ref, callback) {
        return Node.transaction(this.storage, ref.path, callback);
    }

    exists(ref) {
        return Node.exists(this.storage, ref.path);
    }

    query(ref, query, options = { snapshots: false, include: undefined, exclude: undefined, child_objects: undefined }) {
        if (typeof options !== "object") { options = {}; }
        if (typeof options.snapshots === "undefined") { options.snapshots = false; }

        let isWildcardPath = ref.path.indexOf('*') >= 0;

        const availableIndexes = this.storage.indexes.get(ref.path);
        const indexDescriptions = availableIndexes.map(index => index.description).join(', ');
        console.log(`Available indexes for query: ${indexDescriptions}`);
        const tableScanFilters = query.filters.filter(filter => availableIndexes.findIndex(index => index.key === filter.key) < 0);

        // Check if the available indexes are sufficient for this wildcard query
        if (isWildcardPath && tableScanFilters.length > 0) {
            // There are unprocessed filters, which means the fields aren't indexed. 
            // We're not going to get all data of a wildcard path to query manually. 
            // Indexes must be created
            const keys =  tableScanFilters.reduce((keys, f) => { 
                if (keys.indexOf(f.key) < 0) { keys.push(f.key); }
                return keys;
            }, []).map(key => `"${key}"`);
            throw new Error(`This wildcard path query on "/${ref.path}" requires index(es) on key(s): ${keys.join(", ")}. Create the index(es) and retry`);
        }

        const indexScanPromises = [];
        availableIndexes.forEach(index => {
            const filters = query.filters.filter(f => f.key === index.key);
            filters.forEach(filter => {
                const promise = index.query(filter.op, filter.compare);
                indexScanPromises.push(promise);
            });
        });

        return Promise.all(indexScanPromises)
        .then(indexResults => {
            //console.log(indexResults);
            
            if (isWildcardPath || tableScanFilters.length === 0) {
                // Merge all paths in indexResults, get all distinct records
                let paths = [];
                if (indexResults.length === 1) {
                    paths = indexResults[0].map(match => match.path);
                }
                else if (indexResults.length > 1) {
                    indexResults.sort((a,b) => a.length < b.length ? -1 : 1); // Sort results, shortest result set first
                    const shortestSet = indexResults[0];
                    const otherSets = indexResults.slice(1);
                    paths = shortestSet.reduce((paths, match) => {
                        // Check if the key is present in the other result sets
                        const path = match.path;
                        const matchedInAllSets = otherSets.every(set => set.findIndex(match => match.path === path) >= 0);
                        if (matchedInAllSets) { paths.push(path); }
                        return paths;
                    }, []);
                }

                const promises = paths.map(path => { 
                    if (options.snapshots) {
                        const childOptions = {
                            include: options.include,
                            exclude: options.exclude,
                            child_objects: options.child_objects
                        };
                        return Node.getValue(this.storage, path, childOptions)
                        .then(val => {
                            if (val === null) { 
                                // Record was deleted, but index isn't updated yet?
                                console.warn(`Indexed result "/${path}" does not have a record!`)
                                return null; 
                            }
                            return { path, val };
                        });
                    }
                    else if (query.order.length > 0) {
                        const include = query.order.map(order => order.key);
                        return Node.getValue(this.storage, path, { include })
                        .then(val => {
                            return { path, val };
                        });
                    }
                    else {
                        return Promise.resolve(path);
                    }
                });
                
                return Promise.all(promises)
                .then(results => {
                    return results.filter(result => result !== null);
                });
            }

            // If we get here, this is a query on a regular path (no wildcards) with additional non-indexed filters left, 
            // we can get child records from a single parent. Merge index results by key
            let indexKeyFilter;
            if (indexResults.length === 1) {
                indexKeyFilter = indexResults[0].map(match => match.key);
            }
            else if (indexResults.length > 1) {
                indexResults.sort((a,b) => a.length < b.length ? -1 : 1); // Sort results, shortest result set first
                const shortestSet = indexResults[0];
                const otherSets = indexResults.slice(1);
                indexKeyFilter = shortestSet.reduce((keys, match) => {
                    // Check if the key is present in the other result sets
                    const key = match.key;
                    const matchedInAllSets = otherSets.every(set => set.findIndex(match => match.key === key) >= 0);
                    if (matchedInAllSets) { keys.push(key); }
                    return keys;
                }, []);
            }

            const promises = [];
            return Node.getChildren(this.storage, ref.path, indexKeyFilter)
            .next(child => {
                if (child.type === Node.VALUE_TYPES.OBJECT) { // if (child.valueType === VALUE_TYPES.OBJECT) {
                    if (!child.address) {
                        // Currently only happens if object has no properties 
                        // ({}, stored as a tiny_value in parent record). In that case, 
                        // should it be matched in any query? -- That answer could be YES, when testing a property for !exists
                        return;
                    }
                    const p = Node.matches(this.storage, child.address.path, tableScanFilters)
                    .then(isMatch => {
                        if (isMatch) {
                            const childPath = child.address.path;
                            if (options.snapshots) {
                                const childOptions = {
                                    include: options.include,
                                    exclude: options.exclude,
                                    child_objects: options.child_objects
                                };
                                return Node.getValue(this.storage, childPath, childOptions).then(val => {
                                    return { path: childPath, val };
                                });
                            }
                            else if (query.order.length > 0) {
                                const include = query.order.map(order => order.key);
                                return Node.getValue(this.storage, childPath, { include }).then(val => {
                                    return { path: childPath, val };
                                });
                            }
                            else {
                                return childPath;
                            }
                        }
                        return null;
                    })
                    promises.push(p);
                }
            })
            .catch(reason => {
                // No record?
                console.warn(`Error getting child stream: ${reason}`);
                return [];
            })
            .then(() => {
                // Done iterating all children
                return Promise.all(promises);
            });
        })
        .then(matches => {
            // All records have been processed, ones that didn't match will have resolved with null
            matches = matches.filter(m => m !== null); // Only keep real records

            // Order the results
            if (query.order.length > 0) {
                matches = matches.sort((a,b) => {
                    const compare = (i) => {
                        const o = query.order[i];
                        const left = a.val[o.key];
                        const right = b.val[o.key];
                        if (typeof left !== typeof right) {
                            // Wow. Using 2 different types in your data, AND sorting on it. 
                            // compare the types instead of their values ;-)
                            left = typeof left;
                            right = typeof right;
                        }
                        if (left === right) {
                            if (i < query.order.length - 1) { return compare(i+1); }
                            else { return 0; }
                        }
                        else if (left < right) {
                            return o.ascending ? -1 : 1;
                        }
                        else if (left > right) {
                            return o.ascending ? 1 : -1;
                        }
                    };
                    return compare(0);
                });
                if (!options.snapshots) {
                    // Remove the loaded values from the results, because they were not requested (and aren't complete, we only have data of the sorted keys)
                    matches = matches.map(match => match.path);
                }
            }

            // Limit result set
            if (query.skip > 0) {
                matches = matches.slice(query.skip);
            }
            if (query.take > 0) {
                matches = matches.slice(0, query.take);
            }

            return matches;
        });
    }

    /**
     * Creates an index on key for all child nodes at path
     * @param {string} path
     * @param {string} key
     */
    createIndex(path, key) {
        return this.storage.indexes.create(path, key);
    }

    /**
     * Gets all indexes
     */
    getIndexes() {
        return Promise.resolve(this.storage.indexes.list());
    }
}

module.exports = { LocalApi };