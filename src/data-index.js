const { Storage } = require('./storage');
const { Node } = require('./node');
const { BPlusTreeBuilder, BinaryBPlusTree } = require('./btree');
const { getPathInfo, getPathKeys, getChildPath, compareValues, getChildValues } = require('./utils');
const { ID } = require('./id');
const debug = require('./debug');
const fs = require('fs');

const FILL_FACTOR = 50;

function _createRecordPointer(wildcards, key) { //, address) {
    // layout:
    // record_pointer   = wildcards_info, key_info, DEPRECATED: record_location
    // wildcards_info   = wildcards_length, wildcards
    // wildcards_length = 1 byte (nr of wildcard values)
    // wildcards        = wilcard[wildcards_length]
    // wildcard         = wilcard_length, wilcard_bytes
    // wildcard_length  = 1 byte
    // wildcard_value   = byte[wildcard_length] (ASCII char codes)
    // key_info         = key_length, key_bytes
    // key_length       = 1 byte
    // key_bytes        = byte[key_length] (ASCII char codes)
    // NOT USED, DEPRECATED:
    // record_location  = page_nr, record_nr
    // page_nr          = 4 byte number
    // record_nr        = 2 byte number

    let recordPointer = [wildcards.length]; // wildcards_length
    for (let i = 0; i < wildcards.length; i++) {
        const wildcard = wildcards[i];
        recordPointer.push(wildcard.length); // wildcard_length
        // wildcard_bytes:
        for (let j = 0; j < wildcard.length; j++) {
            recordPointer.push(wildcard.charCodeAt(j));
        }
    }
    
    recordPointer.push(key.length); // key_length
    // key_bytes:
    for (let i = 0; i < key.length; i++) {
        recordPointer.push(key.charCodeAt(i));
    }
    // // page_nr:
    // recordPointer.push((address.pageNr >> 24) & 0xff);
    // recordPointer.push((address.pageNr >> 16) & 0xff);
    // recordPointer.push((address.pageNr >> 8) & 0xff);
    // recordPointer.push(address.pageNr & 0xff);
    // // record_nr:
    // recordPointer.push((address.recordNr >> 8) & 0xff);
    // recordPointer.push(address.recordNr & 0xff);
    return recordPointer;
};

function _parseRecordPointer(path, recordPointer) {
    if (recordPointer.length === 0) {
        throw new Error(`Invalid record pointer length`);
    }
    const wildcardsLength = recordPointer[0];
    let wildcards = [];
    let index = 1;
    for (let i = 0; i < wildcardsLength; i++) {
        let wildcard = "";
        let length = recordPointer[index];
        for (let j = 0; j < length; j++) {
            wildcard += String.fromCharCode(recordPointer[index+j+1]);
        }
        wildcards.push(wildcard);
        index += length + 1;
    }
    const keyLength = recordPointer[index];
    let key = "";
    for(let i = 0; i < keyLength; i++) {
        key += String.fromCharCode(recordPointer[index+i+1]);
    }
    index += keyLength + 1;
    // const pageNr = recordPointer[index] << 24 | recordPointer[index+1] << 16 | recordPointer[index+2] << 8 | recordPointer[index+3];
    // index += 4;
    // const recordNr = recordPointer[index] << 8 | recordPointer[index+1];
    if (wildcards.length > 0) {
        let i = 0;
        path = path.replace(/\*/g, () => {
            const wildcard = wildcards[i];
            i++;
            return wildcard;
        });
    }
    // return { key, pageNr, recordNr, address: new NodeAddress(`${path}/${key}`, pageNr, recordNr) };
    return { key, path: `${path}/${key}` };
}

class DataIndex {
    /**
     * Creates a new index
     * @param {Storage} storage
     * @param {string} path 
     * @param {string} key 
     */
    constructor(storage, path, key) {
        this.storage = storage;
        this.path = path.replace(/\/\*$/, ""); // Remove optional trailing "/*"
        this.key = key;
    }

    /**
     * 
     * @param {string} path 
     * @param {any} oldValue 
     * @param {any} newValue 
     */
    handleRecordUpdate(path, oldValue, newValue) {

        const keyValues = getChildValues(this.key, oldValue, newValue);
        const canBeIndexed = ['number','boolean','string'].indexOf(typeof keyValues.newValue) >= 0 || keyValues.newValue instanceof Date;

        // Is comparing needed? Already been done, right?
        if (compareValues(keyValues.oldValue, keyValues.newValue) === 'identical') {
            return;
        }

        const startTime = Date.now();
        const updatedKey = getPathInfo(path).key;
        const pathKeys = getPathKeys(path);
        const indexKeys = getPathKeys(this.path);
        const wilcardKeys = indexKeys.reduce((wildcards, key, i) => {
            if (key === '*') { wildcards.push(pathKeys[i]); }
            return wildcards;
        }, []);
        const recordPointer = _createRecordPointer(wilcardKeys, updatedKey);

        // debug.log(`Requesting update lock on index ${this.description}`.blue);
        let lock;
        return this._lock(true, `index.handleRecordUpdate "/${path}"`)
        .then(l => {
            // debug.log(`Got update lock on index ${this.description}`.blue, l);
            lock = l;
            return this._getTree();
        })
        .then(idx => {
            /**
             * @type BinaryBPlusTree
             */
            const tree = idx.tree;
            // const oldEntry = tree.find(keyValues.oldValue);
            const ops = [];
            if (keyValues.oldValue !== null) {
                ops.push({ type: 'remove', key: keyValues.oldValue, value: recordPointer })
            }
            if (keyValues.newValue !== null && canBeIndexed) {
                ops.push({ type: 'add', key: keyValues.newValue, value: recordPointer })
            }
            return tree.transaction(ops)
            .then(() => {
                // Index updated
                idx.close();
                return false; // not rebuilt
            })
            .catch(err => {
                // Could not update index --> leaf full?
                debug.log(`Could not update index ${this.description}: ${err.message}`.yellow);

                // Rebuild it by getting current content
                return tree.toTreeBuilder(FILL_FACTOR) 
                .then(builder => {
                    idx.close();

                    // Reprocess the changes
                    if (keyValues.oldValue !== null) {
                        builder.remove(keyValues.oldValue, recordPointer);
                    }
                    if (keyValues.newValue !== null && canBeIndexed) {
                        builder.add(keyValues.newValue, recordPointer);
                    }
                    return Uint8Array.from(builder.create().toBinary(true));
                })
                .then(binary => {
                    // overwrite the file
                    return new Promise((resolve, reject) => {
                        fs.writeFile(this.fileName, Buffer.from(binary.buffer), (err) => {
                            if (err) {
                                debug.error(err);
                                reject(err);
                            }
                            else {
                                resolve();
                            }
                        });
                    });        
                })
                .then(() => {
                    return true; // rebuilt
                });
            })
            .then(rebuilt => {
                const doneTime = Date.now();
                const duration = Math.round((doneTime - startTime) / 1000);
                debug.log(`Index ${this.description} was ${rebuilt ? 'rebuilt' : 'updated'} successfully for "/${path}", took ${duration} seconds`.green);
            });
        })
        .then(() => {
            // debug.log(`Released update lock on index ${this.description}`.blue);
            lock.release();
        });
    }

    _lock(forWriting, comment) {
        const tid = ID.generate(); // forWriting ? "write-index" : "read-index";
        let lockPath = `__index__/${this.path.replace(/\*/g, '__')}/__/${this.key}`;
        return IndexLock.lock(lockPath, tid, forWriting, comment, { noTimeout: true });
    }

    get fileName() {
        return `${this.storage.name}-${this.path.replace(/\//g, '-').replace(/\*/g, '#')}-${this.key}.idx`;        
    }

    get description() {
        return `"/${this.path}/*/${this.key}"`;
    }

    /**
     * 
     * @param {string} op 
     * @param {any} val 
     */
    query(op, val) {
        var lock;
        // debug.log(`Requesting query lock on index ${this.description}`.blue);
        return this._lock(false, `index.query "${op}", ${val}`)
        .then(l => {
            // debug.log(`Got query lock on index ${this.description}`.blue, l);
            lock = l;
            return this._getTree();
        })
        .then(idx => {
            /**
             * @type BinaryBPlusTree
             */
            const tree = idx.tree;
            return tree.search(op, val)
            .then(entries => {
                // We now have record pointers
                // debug.log(`Released query lock on index ${this.description}`.blue);
                lock.release();
                idx.close();

                const results = [];
                entries.forEach(entry => {
                    const value = entry.key;
                    entry.values.forEach(data => {
                        const recordPointer = _parseRecordPointer(this.path, data);
                        // results.push({ key: recordPointer.key, value, address: recordPointer.address });
                        results.push({ key: recordPointer.key, value, path: recordPointer.path });
                    })
                });
                return results;
            });
        });
    }
    
    build() {
        const path = this.path;
        const hasWildcards = path.indexOf('*') >= 0;
        const nrOfWildcards = hasWildcards ? /\*/g.exec(this.path).length : 0;
        const wildcardsPattern = '^' + path.replace(/\*/g, "([a-z0-9\-_$]+)") + '/';
        const wildcardRE = new RegExp(wildcardsPattern, 'i');
        const tree = new BPlusTreeBuilder(false, FILL_FACTOR); //(30, false);
        const tid = ID.generate();
        const keys = getPathKeys(path);
        
        const getAll = (currentPath, keyIndex) => {
            // "users/*/posts" 
            // --> Get all children of "users", 
            // --> get their "posts" children,
            // --> get their children to index

            let path = currentPath;
            while (keys[keyIndex] && keys[keyIndex] !== '*') {
                path = getChildPath(path, keys[keyIndex]); // += keys[keyIndex];
                keyIndex++;
            }
            const isTargetNode = keyIndex === keys.length;
            
            const getChildren = () => {
                let children = [];

                return Node.getChildren(this.storage, path)
                .next(child => {
                    let keyOrIndex = typeof child.key === 'string' ? child.key : child.index;
                    if (!child.address || child.type !== Node.VALUE_TYPES.OBJECT) { //if (child.storageType !== "record" || child.valueType !== VALUE_TYPES.OBJECT) {
                        return; // This child cannot be indexed because it is not an object with properties
                    }
                    else {
                        children.push(keyOrIndex);
                    }
                })
                .catch(reason => {
                    // Record doesn't exist? No biggy
                    debug.warn(`Could not load record "/${path}": ${reason.message}`);
                })
                .then(() => {

                    // Iterate through the children in batches of max n nodes
                    // should be determined by amount of * wildcards - If there are 0, 100 are ok, if there is 1, 10 (sqrt of 100), if there are 2, 3.somethign 
                    // Algebra refresh:
                    // a = Math.pow(b, c)
                    // c = Math.log(a) / Math.log(b)
                    // b = Math.pow(a, Math.pow(0.5, c))
                    // a is our max batch size, we'll use 100
                    // c is our depth (nrOfWildcards) so we know this
                    // b is our unknown start number
                    const maxBatchSize = Math.round(Math.pow(500, Math.pow(0.5, nrOfWildcards))); 
                    let batches = [];
                    while (children.length > 0) {
                        let batchChildren = children.splice(0, maxBatchSize);
                        batches.push(batchChildren);
                    }
                    
                    const nextBatch = () => {
                        const batch = batches.shift();
                        return Promise.all(batch.map(childKey => {
                            const childPath = getChildPath(path, childKey);
                            // do it
                            if (!isTargetNode) {
                                // Go deeper
                                return getAll(childPath, keyIndex+1);
                            }
                            else {
                                // We have to index this child, get the property to index
                                return Node.getChildInfo(this.storage, childPath, this.key)
                                .then(childInfo => {
                                    // What can be indexed? 
                                    // strings, numbers, booleans, dates
                                    if (childInfo.exists && [Node.VALUE_TYPES.STRING, Node.VALUE_TYPES.NUMBER, Node.VALUE_TYPES.BOOLEAN, Node.VALUE_TYPES.DATETIME].indexOf(childInfo.valueType) >= 0) {
                                        // Index this value
                                        if (childInfo.address) {
                                            return Node.getValue(this.storage, childInfo.address.path, { tid })
                                        }
                                        else {
                                            return childInfo.value;
                                        }
                                    }
                                    else {
                                        return null;
                                    }
                                })
                                .then(value => {
                                    if (value !== null) {
                                        // Add it to the index, using value as the index key, a record pointer as the value
                                        // Create record pointer
                                        let wildcards = [];
                                        if (hasWildcards) {
                                            const match = wildcardRE.exec(childPath);
                                            wildcards = match.slice(1);
                                        }
                                        const recordPointer = _createRecordPointer(wildcards, childKey); //, child.address);
                                        // Add it to the index
                                        debug.log(`Indexed "/${childPath}/${this.key}" value: '${value}' (${typeof value})`.cyan);
                                        tree.add(value, recordPointer);
                                    }
                                });
                            }
                        }))
                        .then(() => {
                            if (batches.length > 0) { 
                                return nextBatch(); 
                            }
                        })
                    }; // nextBatch

                    if (batches.length > 0) {
                        return nextBatch();
                    }
                });
            };

            return getChildren();            
        };

        const startTime = Date.now();
        let lock;
        return this._lock(true, `index.build ${this.description}`)
        .then(l => {
            lock = l;
            return getAll("", 0);
        })
        .then(() => {
            // All child objects have been indexed. save the index
            const t = tree.create();
            const binary = new Uint8Array(t.toBinary(true));
            return new Promise((resolve, reject) => {
                fs.writeFile(this.fileName, Buffer.from(binary.buffer), (err) => {
                    if (err) {
                        debug.error(err);
                        reject(err);
                    }
                    else {
                        const doneTime = Date.now();
                        const duration = Math.round((doneTime - startTime) / 1000 / 60);
                        debug.log(`Index ${this.description} was built successfully, took ${duration} minutes`.green);
                        resolve();
                    }
                });
            });
        })
        .catch(err => {
            debug.error(`Error building index ${this.description}: ${err.message}`);
        })
        .then(() => {
            lock.release(); // release index lock
            return this;    
        });
    }

    _getTree () {
        return new Promise((resolve, reject) => {
            fs.open(this.fileName, "r+", (err, fd) => {
                if (err) {
                    return reject(err);
                }
                const reader = (index, length) => {
                    const binary = new Uint8Array(length);
                    const buffer = Buffer.from(binary.buffer);
                    return new Promise((resolve, reject) => {
                        fs.read(fd, buffer, 0, length, index, (err, bytesRead) => {
                            if (err) {
                                reject(err);
                            }
                            // Convert Uint8Array to byte array
                            let bytes = Array.from(binary);
                            resolve(bytes);
                        });
                    });
                };
                const writer = (data, index) => {
                    const binary = Uint8Array.from(data);
                    const buffer = Buffer.from(binary.buffer);
                    return new Promise((resolve, reject) => {
                        fs.write(fd, buffer, 0, data.length, index, (err, bytesRead) => {
                            if (err) {
                                reject(err);
                            }
                            resolve();
                        });
                    });
                };
                const tree = new BinaryBPlusTree(reader, 512, writer);
                resolve({ 
                    tree,
                    close: () => {
                        fs.close(fd, err => {
                            if (err) {
                                debug.warn(`Could not close index file ${this.fileName}:`, err);
                            }
                        });
                    }
                });
            });
        });
    }
}

class IndexLock {

    static get LOCK_STATE() {
        return {
            PENDING: 'pending',
            LOCKED: 'locked',
            EXPIRED: 'expired',
            DONE: 'done'
        };
    };

    /**
     * Constructor for a record lock
     * @param {Storage} storage 
     * @param {string} path 
     * @param {string} tid 
     * @param {boolean} forWriting 
     * @param {boolean} priority
     */
    constructor(storage, path, tid, forWriting, priority = false) {
        this.tid = tid;
        this.path = path;
        this.forWriting = forWriting;
        this.priority = priority;
        this.state = IndexLock.LOCK_STATE.PENDING;
        this.storage = storage;
        this.requested = Date.now();
        this.granted = undefined;
        this.expires = undefined;
        this.comment = "";
        this.waitingFor = null;
    }

    release(comment) {
        return IndexLock.unlock(this, comment || this.comment);
    }

    /**
     * Locks a path for writing. While the lock is in place, it's value cannot be changed by other transactions.
     * @param {string} path path being locked
     * @param {string} tid a unique value to identify your transaction
     * @param {boolean} forWriting if the record will be written to. Multiple read locks can be granted access at the same time if there is no write lock. Once a write lock is granted, no others can read from or write to it.
     * @returns {Promise<IndexLock>} returns a promise with the lock object once it is granted. It's .release method can be used as a shortcut to .unlock(path, tid) to release the lock
     */
    static lock(path, tid, forWriting = true, comment = '', options = { withPriority: false, noTimeout: false }) {
        let lock, proceed;
        if (path instanceof IndexLock) {
            lock = path;
            lock.comment = `(retry: ${lock.comment})`;
            proceed = true;
        }
        else {
            lock = new IndexLock(this, path, tid, forWriting, options.withPriority === true);
            lock.comment = comment;
            _locks.push(lock);
            const check = _allowLock(path, tid, forWriting);
            lock.waitingFor = check.conflict || null;
            proceed = check.allow;
        }

        if (proceed) {
            lock.state = IndexLock.LOCK_STATE.LOCKED;
            lock.granted = Date.now();
            return Promise.resolve(lock);
        }
        else {
            // Keep pending until clashing lock(s) is/are removed
            console.assert(lock.state === IndexLock.LOCK_STATE.PENDING);
            const p = new Promise((resolve, reject) => {
                lock.resolve = resolve;
                lock.reject = reject;
            });
            return p;
        }
    }

    static unlock(lock, comment, processQueue = true) {// (path, tid, comment) {
        const i = _locks.indexOf(lock); //_locks.findIndex(lock => lock.tid === tid && lock.path === path);
        if (i < 0) {
            const msg = `lock on "/${lock.path}" for tid ${lock.tid} wasn't found; ${comment}`;
            debug.error(`unlock :: ${msg}`);
            return Promise.reject(new Error(msg));
        }
        lock.state = IndexLock.LOCK_STATE.DONE;
        clearTimeout(lock.timeout);
        _locks.splice(i, 1);
        processQueue && _processLockQueue();
        return Promise.resolve(lock);
    }

}

/**
 * @type {IndexLock[]}
 */
const _locks = [];

function _allowLock(path, tid, forWriting) {
    // Can this lock be granted now or do we have to wait?
    const conflict = _locks
        .filter(otherLock => otherLock.tid !== tid && otherLock.state === IndexLock.LOCK_STATE.LOCKED)
        .find(otherLock => {
            return (
                // Other lock clashes with requested lock, if:
                // One (or both) of them is for writing
                (forWriting || otherLock.forWriting)

                // and requested lock is on the path
                && path === otherLock.path
            );
        });

    const clashes = typeof conflict !== 'undefined';
    return { allow: !clashes, conflict };
}

function _processLockQueue() {
    const pending = _locks
        .filter(lock => 
            lock.state === IndexLock.LOCK_STATE.PENDING
            && (lock.waitingFor === null || lock.waitingFor.state !== IndexLock.LOCK_STATE.LOCKED)
        )
        .sort((a,b) => {
            if (a.priority && !b.priority) { return -1; }
            else if (!a.priority && b.priority) { return 1; }
            return a.requested < b.requested;
        });
    pending.forEach(lock => {
        const check = _allowLock(lock.path, lock.tid, lock.forWriting);
        lock.waitingFor = check.conflict || null;
        if (check.allow) {
            IndexLock.lock(lock)
            .then(lock.resolve)
            .catch(lock.reject);
        }
    });
}


module.exports = { 
    DataIndex
};