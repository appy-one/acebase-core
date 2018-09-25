const promiseTimeout = require('./promise-timeout');
const { Storage } = require('./storage');
const { PathReference } = require('./path-reference');
//const { DataReference } = require('./data-reference');
const { bytesToNumber, numberToBytes, concatTypedArrays, getPathKeys, getPathInfo, cloneObject } = require('./utils');
const { TextEncoder, TextDecoder } = require('text-encoding');
const uuid62 = require('uuid62');
const { BPlusTree, BinaryBPlusTree } = require('./btree');
const debug = require('./debug');

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const VALUE_TYPES = {
    // Native types:
    OBJECT: 1,
    ARRAY: 2,
    NUMBER: 3,
    BOOLEAN: 4,
    STRING: 5,
    // Custom types:
    DATETIME: 6,
    //ID: 7
    BINARY: 8,
    REFERENCE: 9
};

const UNCHANGED = { unchanged: "this data did not change" };
const FLAG_WRITE_LOCK = 0x10;
const FLAG_READ_LOCK = 0x20;
const FLAG_KEY_TREE = 0x40;
const FLAG_VALUE_TYPE = 0xf;

class RecordAddress {
    constructor(path, pageNr = -1, recordNr = -1) {
        this.path = path.replace(/^\/|\/$/g, "");
        this.pageNr = pageNr;
        this.recordNr = recordNr;
    }
}

class RecordNotFoundError extends Error {}
class TruncatedDataError extends Error {}

class RecordReference {
    /**
     * RecordReference constructor, are used to reference subrecords when their parent is being updated. 
     * This prevents rewriting whole trees when child data remained the same.
     * @param {number} valueType - One of the VALUE_TYPE constants
     * @param {RecordAddress} address - Address of the referenced record
     */
    constructor(valueType, address) {
        this.type = valueType;
        this.address = address;
    }
}

class RecordTransaction {

    constructor(path, callback) {
        this.path = path;
        this.callback = callback;
        //this.tid = "tx-" + path + "-" + uuid62.v1(); // Generate a transaction id
        this.tid = uuid62.v1(); // Generate a transaction id

        // Following should be set by client code
        this.record = null; 
        this.oldValue = null;
        this.newValue = undefined;
        this.result = null;
        this.dataMoved = false;

        let doneResolve, failReject;
        this.wait = () => {
            return new Promise((resolve, reject) => {
                doneResolve = resolve;
                failReject = reject;
            });
        };
        this.done = () => {
            const result = this.result || "success";
            debug.log(`transaction ${this.tid} on path "/${this.path}" ${result}`);
            doneResolve(result);
        };
        this.fail = (reason) => {
            debug.error(`transaction ${this.tid} on path "/${this.path}" FAILED`, reason);
            failReject(reason);
        }
    }
}

class RecordLock {
    /**
     * Constructor for a record lock
     * @param {Storage} storage 
     * @param {string} path 
     * @param {string} tid 
     * @param {boolean} forWriting 
     */
    constructor(storage, path, tid, forWriting) {
        this.tid = tid;
        this.path = path;
        this.forWriting = forWriting;
        this.state = RecordLock.LOCK_STATE.PENDING;
        this.storage = storage;
        this.requested = Date.now();
        this.granted = undefined;
        this.expires = undefined;
        this.comment = "";
    }
    release(comment) {
        //return this.storage.unlock(this.path, this.tid, comment);
        return this.storage.unlock(this, comment || this.comment);
    }

    moveToParent() {
        return this.storage.moveLockToParent(this);
    }

    static get LOCK_STATE() {
        return {
            PENDING: 'pending',
            LOCKED: 'locked',
            EXPIRED: 'expired',
            DONE: 'done'
        };
    };
}

class Record {
    /** Constructor for a Record object. For internal use only.
     * @param {Storage} storage - reference to the used storage engine
     * @param {Uint8Array|Buffer} data - the raw uncut byte data that is stored in the record
     * @param {RecordAddress} address - which page/recordNr/path the record resides
     */
    constructor(storage, address = null) {
        this.storage = storage;
        this.address = address;
        this.allocation = [];
        this.headerLength = -1;
        this.totalBytes = -1;
        this.fileIndex = -1;
        this.valueType = -1;
        this.hasKeyTree = false;
        this.startData = null;
    }

    // _indexChildren() {
    //     let children = this._children = [];
    //     Record.getChildStream(this.storage, this.address, { bytes: this.data, valueType: this.valueType })
    //     .next(child => {
    //         children.push(child);
    //     });
    // }

    static exists(storage, path, options = { tid: undefined }) {
        if (path === "") {
            // Root always exists
            return Promise.resolve(true);
        }

        // Refactored to use resolve, which now uses child streams
        return Record.resolve(storage, path, options)
        .then(address => {
            return !!address;
        });
    }

    /**
     * 
     * @param {Storage} storage 
     * @param {string} path 
     * @param {{ tid?: string }}} options 
     */
    static getValue(storage, path, options = { tid: undefined }) {
        const pathInfo = getPathInfo(path);
        const tid = options.tid || uuid62.v1();
        var lock;
        return storage.lock(path, tid, false, `Record.getValue "/${path}"`)
        .then(l => {
            lock = l;
            return Record.get(storage, { path }, { tid })
        })
        .then(record => {
            if (!record) {
                return storage.moveLockToParent(lock)
                .then((l) => {
                    lock = l;
                    return Record.get(storage, { path: lock.path }, { tid });
                })
                .then(record => ({ parent: record }));
            }
            return { record };
        })
        .then(result => {
            if (!result.record && !result.parent) {
                return null;
            }
            if (result.parent) {

                return result.parent.getChildInfo(pathInfo.key, { tid })
                .then(info => info.exists ? info.value : null); // If the value is an object, it doesn't have any properties (otherwise it would have been stored in a separate record). Therefore, any include/exclude/child_objects options set can be ignored here
            }
            // if (!options) { options = {}; }
            // else { options = cloneObject(options); }
            // options.tid = tid;
            return result.record.getValue(options);
        })
        .catch(reason => {
            debug.error(`Failed to get value for "/${path}", `, reason);
            return null;
        })
        .then(value => {
            lock.release();
            return value;
        });
    }


    /**
     * Reads all data from this record. Only do this when a stream won't do (eg if you need all data because the record contains a string)
     */
    getAllData(options = { tid: undefined }) {
        let allData = new Uint8Array(this.totalBytes);
        let index = 0;
        return this.getDataStream(options)
        .next(({ data }) => {
            allData.set(data, index);
            index += data.length;
        })
        .then(() => {
            return allData;
        });
    }

    /**
     * Gets the value stored in this record by parsing the binary data in this and any sub records
     * @param {options} - options: when omitted retrieves all nested data. If include is set to an array of keys it will only return those children. If exclude is set to an array of keys, those values will not be included
     * @returns {Promise<any>} - returns the stored object, array or string
     */
    getValue(options = { include: undefined, exclude: undefined, child_objects: true, tid: undefined }) {
        if (!options) { options = {}; }
        if (typeof options.include !== "undefined" && !(options.include instanceof Array)) {
            throw new TypeError(`options.include must be an array of key names`);
        }
        if (typeof options.exclude !== "undefined" && !(options.exclude instanceof Array)) {
            throw new TypeError(`options.exclude must be an array of key names`);
        }
        if (["undefined","boolean"].indexOf(typeof options.child_objects) < 0) {
            throw new TypeError(`options.child_objects must be a boolean`);
        }
        const tid = options.tid || uuid62.v1();

        return new Promise((resolve, reject) => {
            switch (this.valueType) {
                case VALUE_TYPES.STRING: {
                    this.getAllData({ tid })
                    .then(binary => {
                        let str = textDecoder.decode(binary.buffer);
                        resolve(str);
                    });
                    break;
                }
                case VALUE_TYPES.REFERENCE: {
                    this.getAllData({ tid })
                    .then(binary => {
                        let path = textDecoder.decode(binary.buffer);
                        resolve(new PathReference(path));
                    });
                    break;
                }
                case VALUE_TYPES.BINARY: {
                    this.getAllData({ tid })
                    .then(binary => {
                        resolve(binary.buffer);
                    });
                    break;
                }
                case VALUE_TYPES.ARRAY:
                case VALUE_TYPES.OBJECT: {
                    // We need ALL data, including from child sub records
                    const isArray = this.valueType === VALUE_TYPES.ARRAY;
                    const promises = [];
                    const obj = isArray ? [] : {};
                    const streamOptions = { tid };
                    if (options.include && options.include.length > 0) {
                        const keyFilter = options.include.filter(key => key.indexOf('/') < 0);
                        if (keyFilter.length > 0) { 
                            streamOptions.keyFilter = keyFilter;
                        }
                    }
                    this.storage.lock(this.address.path, tid, false, `record.getValue "/${this.address.path}"`)
                    .then(lock => {
                        return this.getChildStream(streamOptions)
                        .next((child, index) => {
                            if (options.child_objects === false && [VALUE_TYPES.OBJECT, VALUE_TYPES.ARRAY].indexOf(child.type) >= 0) {
                                // Options specify not to include any child objects
                                return;
                            }
                            if (options.include && options.include.length > 0 && options.include.indexOf(child.key) < 0) { 
                                // This particular child is not in the include list
                                return; 
                            }
                            if (options.exclude && options.exclude.length > 0 && options.exclude.indexOf(child.key) >= 0) {
                                // This particular child is on the exclude list
                                return; 
                            }
                            if (child.address) {
                                //let address = new RecordAddress(`${this.address.path}/${child.key}`, child.address.pageNr, child.address.recordNr);
                                let promise = Record.get(this.storage, child.address, { tid }).then(record => {
                                    // Get recursive on it
                                    // Are there any relevant nested includes / excludes?
                                    let childOptions = { tid };
                                    if (options.include) {
                                        const include = options.include
                                            .filter((path) => path.startsWith("*/") || path.startsWith(`${child.key}/`))
                                            .map(path => path.substr(path.indexOf('/') + 1));
                                        if (include.length > 0) { childOptions.include = include; }
                                    }
                                    if (options.exclude) {
                                        const exclude = options.exclude
                                            .filter((path) => path.startsWith("*/") || path.startsWith(`${child.key}/`))
                                            .map(path => path.substr(path.indexOf('/') + 1));

                                        if (exclude.length > 0) { childOptions.exclude = exclude; }
                                    }
                                    return record.getValue(childOptions).then(val => { //{ use_mapping: options.use_mapping }
                                        obj[isArray ? index : child.key] = val;
                                        return record;
                                    });
                                });
                                promises.push(promise);
                            }
                            else if (typeof child.value !== "undefined") {
                                obj[isArray ? index : child.key] = child.value;
                            }
                            else {
                                if (isArray) {
                                    throw `Value for index ${index} has not been set yet, find out why. Path: ${this.address.path}`;
                                }
                                else {
                                    throw `Value for key ${child.key} has not been set yet, find out why. Path: ${this.address.path}`;
                                }
                            }
                        })
                        .then(() => {
                            // We're done reading child info, we can release the lock
                            lock.release(`record.getValue`);
                            lock = null;
                            return Promise.all(promises); // Wait for any child reads to complete
                        })
                        .then(() => {
                            resolve(obj);
                        })                        
                        .catch(err => {
                            if (lock) {
                                lock.release(`record.getValue error`);
                            }
                            debug.error(err);
                            reject(err);
                        });
                    });

                    break;
                }
                default: {
                    throw "Unsupported record value type";
                }
            }
        });
    }

    /**
     * Updates a record
     * @param {Object} updates - Object containing the desired changes to perform
     * @param {{ trackChanges?: boolean, transaction?: RecordTransaction, tid?: string }} options - Options
     * @returns {Promise<Record>} - Returns a promise that resolves with the updated record
     */
    update(updates, options = { trackChanges: true, transaction: undefined, tid: undefined }) {

        if (typeof updates !== "object") {
            throw new TypeError(`updates parameter must be an object`);
        }
        if (typeof options.trackChanges === "undefined") {
            options.trackChanges = true;
        }

        const combined = {};
        const discardedRecords = [];
        const updatedKeys = Object.keys(updates);
        const addedKeys = [];
        const previous = {
            loaded: false,
            value: undefined
        };

        const tid = options.tid || uuid62.v1();
        let lock;
        return this.storage.lock(this.address.path, tid, true, `record.update "/${this.address.path}"`)
        .then(l => {
            lock = l;

            return this.getChildStream({ tid })
            .next(child => {
                if (updatedKeys.indexOf(child.key) >= 0) {
                    // Existing child is being updated, do not copy current value
                    if (child.address && !(updates[child.key] instanceof RecordReference)) {
                        // Current child value resides in a separate record,
                        // it's value is being changed, so we can free the old space
                        discardedRecords.push(child.address);
                        this.storage.addressCache.invalidatePath(child.address.path); // Have all cached addresses for path and children removed
                    }
                }
                else if (child.address) {
                    combined[child.key] = new RecordReference(child.type, child.address);
                }
                else {
                    combined[child.key] = child.value;
                }
            });
        })
        .then(() => {
            updatedKeys.forEach(key => {
                if (updates[key] !== null) {
                    if (!(key in combined)) {
                        addedKeys.push(key);
                    }
                    combined[key] = updates[key];
                }
            });

            // Remove added keys from updated array
            addedKeys.forEach(key => {
                updatedKeys.splice(updatedKeys.indexOf(key), 1);
            });

            let transactionPromise;
            if (options.transaction instanceof RecordTransaction) {
                previous.loaded = true;
                previous.value = options.transaction.oldValue;
            }
            else if (options.trackChanges === true) {
                if (updatedKeys.length > 0) {
                    // Get the old values for updated properties
                    transactionPromise = this.getValue({ include: updatedKeys, tid })
                    .then(current => {
                        Object.keys(combined).forEach(key => {
                            if (updatedKeys.indexOf(key) < 0 && typeof current[key] === "undefined") {
                                current[key] = UNCHANGED; // Mark as unchanged so change tracker in subscription functionality knows it
                            }
                        });
                        previous.loaded = true;
                        previous.value = current;
                        //return current;
                    });
                }
                else {
                    // There are only new keys. Set all existing properties to unchanged
                    let current = {};
                    Object.keys(combined).forEach(key => {
                        if (addedKeys.indexOf(key) < 0) {
                            current[key] = UNCHANGED; // Mark as unchanged so change tracker in subscription functionality knows it
                        }
                    });
                    previous.loaded = true;
                    previous.value = current;
                }
            }

            return transactionPromise;
        })
        .then(() => {
            return Record.create(this.storage, this.address.path, combined, { tid, allocation: this.allocation });
        })
        .then(record => {
            debug.log(`Updated "/${this.address.path}", ${Object.keys(combined).length} keys (${updatedKeys.length} updated, ${addedKeys.length} added)`);

            //debug.log(`Record "/${this.address.path}" updated`);
            let addressChanged = record.address.pageNr !== this.address.pageNr || record.address.recordNr !== this.address.recordNr;

            // Update this record object with the new record data
            this.fileIndex = record.fileIndex;
            this.headerLength = record.headerLength;
            this.totalBytes = record.totalBytes;
            this.startData = record.startData;
            this.valueType = record.valueType;
            this.address = record.address;
            this.allocation = record.allocation;
            this.hasKeyTree = record.hasKeyTree;
            this.timestamp = record.timestamp;
            
            if (addressChanged && options.transaction instanceof RecordTransaction) {
                options.transaction.dataMoved = true;
            }

            // Free all previously allocated records that moved or were deleted
            const discard = (record) => {
                record.address.path = record.address.path.replace(/^removed:/, "");
                debug.log(`Releasing (OLD) record allocation for "/${record.address.path}"`);
                // Done already by Record.create: this.storage.addressCache.invalidate(record.address);
                this.storage.FST.release(record.allocation);
                const promises = [];
                return record.getChildStream({ tid })
                .next(child => {
                    if (child.address) {
                        child.address.path = `removed:${child.address.path}`; // Prevents locking on removed record path
                        let p = Record.get(this.storage, child.address, { tid }).then(discard); //, { lock: options.lock }
                        promises.push(p);
                    }
                })
                .then(() => {
                    return Promise.all(promises);
                });
            };

            //const promises = [];
            discardedRecords.forEach(address => {
                address.path = `removed:${address.path}`; // Prevents locking on removed record path
                //const p = 
                Record.get(this.storage, address, { tid }).then(discard);
                //promises.push(p);
            });

            if (addressChanged && this.address.path.length > 0) {
                // Update parent record, so it references this new record instead of the old one..
                // Of course, skip if this is the root record that moved. (has no parent..)

                const pathInfo = getPathInfo(this.address.path);
                return this.storage.moveLockToParent(lock).then((l) => {
                    lock = l;
                    return Record.update(
                        this.storage, 
                        pathInfo.parent,
                        { [pathInfo.key]: new RecordReference(record.valueType, record.address) }, 
                        { trackChanges: false, tid }
                    );
                });
            }
        })
        .then(() => {
            // Release the lock, so others can read from/write to it
            lock.release(`record.update record updated`);

            if (previous.loaded) {
                this.storage.subscriptions.trigger("update", this.address.path, previous.value, updates, combined);
            }

            return this;
        })
        .catch(err => {
            if (lock) {
                // If lock was still there, remove it
                lock.release(`record.update error`);
            }
            debug.error(err);
            throw err;
        });
    }
    
    /**
     * Creates a new record in the database with given data.
     * @param {Storage} storage - reference to Storage engine object
     * @param {string} path - path of the the record's address, eg users/ewout/posts/post1
     * @param {any} value  - value (object,array,string,ArrayBuffer) to store in the record
     * @param {{tid: string, allocation: Array<{ pageNr: number, recordNr: number, length: number }>}} options lock: previously achieved lock; allocation: previous record allocation to re-use (overwrite)
     * @returns {Promise<Record>} - Returns a promise that resolves with the created record
     */
    static create(storage, path, value, options = { tid: undefined, allocation: null }) {

        if (typeof options.allocation === "undefined") {
            options.allocation = null;
        }
        
        const re = /(^\/)|(\/$)/g;
        path = path.replace(re, "");

        debug.log(`About to save a(n) ${typeof value} to "/${path}"`);

        const _write = (type, bytes, debugValue, hasKeyTree) => {
            // First record has a CT (Chunk Table), all following records contain pure DATA only
            // 
            // record           := record_header, record_data
            // record_header    := record_info, value_type, chunk_table, last_record_len
            // record_info      := 4 bits = [0, FLAG_KEY_TREE, FLAG_READ_LOCK, FLAG_WRITE_LOCK]
            // value_type       := 4 bits number
            // chunk_table      := chunk_entry, [chunk_entry, [chunk_entry...]]
            // chunk_entry      := ct_entry_type, [ct_entry_data]
            // ct_entry_type    := 1 byte number, 
            //                      0 = end of table, no entry data
            //                      1 = number of contigious following records (if first range with multiple records, start is current record)
            //                      2 = following range (start address, nr of contigious following record)
            //
            // ct_entry_data    := ct_entry_type?
            //                      1: nr_records
            //                      2: start_page_nr, start_record_nr, nr_records
            //
            // nr_records       := 2 byte number, (actual nr - 1)
            // start_page_nr    := 4 byte number
            // start_record_nr  := 2 byte number
            // last_record_len  := 2 byte number
            // record_data      := value_type?
            //                      OBJECT: FLAG_TREE?
            //                          0: object_property, [object_property, [object_property...]]
            //                          1: object_tree
            //                      ARRAY: array_entry, [array_entry, [array_entry...]]
            //                      STRING: binary_data
            //                      BINARY: binary_data
            //
            // object_property  := key_info, child_info
            // object_tree      := bplus_tree_binary<key_index_or_name, child_info>
            // array_entry      := child_value_type, tiny_value, value_info, [value_data]
            // key_info         := key_indexed, key_index_or_name
            // key_indexed      := 1 bit
            // key_index_or_name:= key_indexed?
            //                      0: key_length, key_name
            //                      1: key_index
            //
            // key_length       := 7 bits (actual length - 1)
            // key_index        := 15 bits
            // key_name         := [key_length] byte string (ASCII)
            // child_info       := child_value_type, tiny_value, value_info, [value_data]
            // child_value_type := 4 bits number
            // tiny_value       := child_value_type?
            //                      BOOLEAN: [0000] or [0001]
            //                      NUMBER: [0000] to [1111] (positive number between 0 and 15)
            //                      (other): (empty string, object, array)
            //
            // value_info       := value_location, inline_length
            // value_location   := 2 bits,
            //                      [00] = DELETED (not implemented yet)
            //                      [01] = TINY
            //                      [10] = INLINE
            //                      [11] = RECORD
            //
            // inline_length    := 6 bits number (actual length - 1)
            // value_data       := value_location?
            //                      INLINE: [inline_length] byte value
            //                      RECORD: value_page_nr, value_record_nr
            //
            // value_page_nr    := 4 byte number
            // value_record_nr  := 2 byte number
            //

            const bytesPerRecord = storage.settings.recordSize;
            //let headerBytes = 7; // Minimum length: 1 byte record_info and value_type, 4 byte CT (1 byte for entry_type 1, 2 bytes for length, 1 byte for entry_type 0 (end)), 2 bytes last_chunk_length
            // let headerBytes = 4; // Minimum length: 1 byte record_info and value_type, 1 byte CT (1 byte for entry_type 0), 2 bytes last_chunk_length
            // let totalBytes = (bytes.length + headerBytes);
            // let requiredRecords = Math.ceil(totalBytes / bytesPerRecord);
            // let lastChunkSize = bytes.length; //totalBytes % bytesPerRecord;
            let headerBytes, totalBytes, requiredRecords, lastChunkSize;

            const calculateStorageNeeds = (nrOfChunks) => {
                // Calculate amount of bytes and records needed
                headerBytes = 4; // Minimum length: 1 byte record_info and value_type, 1 byte CT (ct_entry_type 0), 2 bytes last_chunk_length
                totalBytes = (bytes.length + headerBytes);
                requiredRecords = Math.ceil(totalBytes / bytesPerRecord);
                if (requiredRecords > 1) {
                    // More than 1 record, header size increases
                    headerBytes += 3; // Add 3 bytes: 1 byte for ct_entry_type 1, 2 bytes for nr_records
                    headerBytes += (nrOfChunks - 1) * 9; // Add 9 header bytes for each additional range (1 byte ct_entry_type 2, 4 bytes start_page_nr, 2 bytes start_record_nr, 2 bytes nr_records)
                    // Recalc total bytes and required records
                    totalBytes = (bytes.length + headerBytes);
                    requiredRecords = Math.ceil(totalBytes / bytesPerRecord);
                }
                lastChunkSize = requiredRecords === 1 ? bytes.length : totalBytes % bytesPerRecord;
                if (requiredRecords > 1 && lastChunkSize === 0) {
                    // Data perfectly fills up the last record!
                    // If we don't set it to bytesPerRecord, reading later will fail: 0 bytes will be read from the last record...
                    lastChunkSize = bytesPerRecord;
                }
            };

            calculateStorageNeeds(1); // Initialize with calculations for 1 contigious chunk of data

            if (requiredRecords > 1) {
                // In the worst case scenario, we get fragmented record space for each required record.
                // Calculate with this scenario. If we claim a record too many, we'll free it again when done
                let wholePages = Math.floor(requiredRecords / storage.settings.pageSize);
                let maxChunks = Math.max(0, wholePages) + Math.min(3, requiredRecords);
                calculateStorageNeeds(maxChunks);

                // headerBytes += 3; // Add 2 bytes for ct_entry_type:1 of first record (instead of ct_entry_type:0) and 1 byte for ending ct_entry_type: 0
                // //let additionalHeaderBytes = (requiredRecords-1) * 9;   // Add 9 bytes for each ct_entry_type:2 of additional records
                // let wholePages = Math.floor(requiredRecords / storage.settings.pageSize);
                // let maxAdditionalRanges = Math.max(0, wholePages-1) + Math.min(3, requiredRecords-1);
                // let additionalHeaderBytes = maxAdditionalRanges * 9;   // Add 9 bytes for each ct_entry_type:2 of additional ranges
                // totalBytes = (bytes.length + headerBytes + additionalHeaderBytes);
                // requiredRecords = Math.ceil(totalBytes / bytesPerRecord);
                // lastChunkSize = totalBytes % bytesPerRecord;
            }

            const rangesFromAllocation = (allocation) => {
                let range = { 
                    pageNr: allocation[0].pageNr, 
                    recordNr: allocation[0].recordNr, 
                    length: 1 
                };
                let ranges = [range];
                for(let i = 1; i < allocation.length; i++) {
                    if (allocation[i].pageNr !== range.pageNr || allocation[i].recordNr !== range.recordNr + range.length) {
                        range = { pageNr: allocation[i].pageNr, recordNr: allocation[i].recordNr, length: 1 };
                        ranges.push(range);
                    }
                    else {
                        range.length++;
                    }
                }
                return ranges;
            };

            const allocationFromRanges = (ranges) => {
                let allocation = [];
                ranges.forEach(range => {
                    for (let i = 0; i < range.length; i++) {
                        allocation.push({ pageNr: range.pageNr, recordNr: range.recordNr + i });
                    }
                });
                return allocation;       
            };

            // Request storage space for these records
            let deallocateRanges;
            let allocationPromise;
            let currentRanges = options.allocation === null ? [] : options.allocation;
            let allocation = options.allocation === null ? null : allocationFromRanges(options.allocation);
            let currentAllocation = allocation !== null ? allocation : [];
            if (currentAllocation.length >= requiredRecords) {
                // Overwrite existing allocated records
                let freed = allocation.splice(requiredRecords);
                // allocation = allocation.slice(0, requiredRecords);
                if (freed.length > 0) {
                    debug.log(`Record "/${path}" reduced in size, releasing ${freed.length} addresses`);
                    //storage.FST.release(freed);
                    deallocateRanges = rangesFromAllocation(freed);
                }
                let ranges = rangesFromAllocation(allocation);
                allocationPromise = Promise.resolve({
                    ranges,
                    allocation
                });
            }
            else {
                if (allocation !== null) {
                    // More records are required to store data, free old addresses
                    debug.log(`Record "/${path}" grew in size, releasing current ${allocation.length} allocated addresses`);
                    // let ranges = rangesFromAllocation(allocation);
                    // storage.FST.release(ranges);
                    deallocateRanges = rangesFromAllocation(allocation);
                }
                // allocation = storage.FST.getFreeAddresses(requiredRecords);
                // debug.log(`Allocated ${allocation.length} new addresses for "/${path}"`);
                allocationPromise = storage.FST.allocate(requiredRecords).then(ranges => {
                    let allocation = allocationFromRanges(ranges);
                    debug.log(`Allocated ${allocation.length} addresses for "/${path}"`);
                    return {
                        ranges,
                        allocation
                    };
                });
            }

            function addChunkTableTypesToRanges(ranges) {
                if (requiredRecords === 1) {
                    ranges[0].type = 0;  // No CT (Chunk Table)
                }
                else {
                    ranges.forEach((range,index) => {
                        if (index === 0) {
                            range.type = 1;     // 1st range CT record
                        }
                        else {
                            range.type = 2;     // CT record with pageNr, recordNr, length
                        }
                    });
                }
                return ranges;
            }

            return allocationPromise.then(result => {
                let { ranges, allocation } = result;
                addChunkTableTypesToRanges(ranges);
                calculateStorageNeeds(ranges.length);

                if (requiredRecords < allocation.length) {
                    if (currentAllocation.length === requiredRecords && currentRanges.length <= ranges.length) {
                        // Undo planned deallocation of previous data, free newly allocated ranges again
                        debug.log(`Record stays the same size, freeing ${allocation.length} newly allocated addresses again, keeping current ${currentAllocation.length} addresses`);
                        storage.FST.release(ranges);
                        deallocateRanges = null;
                        allocation = currentAllocation;
                        ranges = rangesFromAllocation(allocation);
                        addChunkTableTypesToRanges(ranges);
                    }
                    else {
                        const deallocate = allocation.splice(requiredRecords);
                        debug.log(`Requested ${deallocate.length} too many addresses to store "/${path}", releasing them`);
                        storage.FST.release(rangesFromAllocation(deallocate));
                        ranges = rangesFromAllocation(allocation);
                        addChunkTableTypesToRanges(ranges);
                    }
                    calculateStorageNeeds(ranges.length);
                }
                
                // Build the binary header data
                let header = new Uint8Array(headerBytes);
                let headerView = new DataView(header.buffer, 0, header.length);
                header.fill(0);     // Set all zeroes
                header[0] = type; // value_type
                if (hasKeyTree) {
                    header[0] |= FLAG_KEY_TREE;
                }

                // Add chunk table
                let offset = 1;
                ranges.forEach(range => {
                    headerView.setUint8(offset, range.type);
                    if (range.type === 0) {
                        return; // No additional CT data
                    }
                    else if (range.type === 1) {
                        headerView.setUint16(offset + 1, range.length);
                        offset += 3;
                    }
                    else if (range.type === 2) {
                        headerView.setUint32(offset + 1, range.pageNr);
                        headerView.setUint16(offset + 5, range.recordNr);
                        headerView.setUint16(offset + 7, range.length);
                        offset += 9;
                    }
                    else {
                        throw "Unsupported range type";
                    }
                });
                headerView.setUint8(offset, 0);             // ct_type 0 (end of CT), 1 byte
                offset++;
                headerView.setUint16(offset, lastChunkSize);  // last_chunk_size, 2 bytes
                offset += 2;

                // Create and write all chunks
                const writes = [];
                let copyOffset = 0;
                ranges.forEach((range, r) => {
                    const chunk = {
                        data: new Uint8Array(range.length * bytesPerRecord),
                        get length() { return this.data.length; }
                    };
                    chunk.data.fill(0);
                    if (r === 0) {
                        chunk.data.set(header, 0); // Copy header data into first chunk
                        const view = new Uint8Array(bytes.buffer, 0, Math.min(bytes.length, chunk.length - header.length));
                        chunk.data.set(view, header.length); // Copy first chunk of data into range
                        copyOffset += view.length;
                    }
                    else {
                        // Copy chunk data from source data
                        const view = new Uint8Array(bytes.buffer, copyOffset, Math.min(bytes.length - copyOffset, chunk.length));
                        chunk.data.set(view, 0);
                        copyOffset += chunk.length;
                    }
                    const fileIndex = storage.getRecordFileIndex(range.pageNr, range.recordNr);
                    const promise = storage.writeData(fileIndex, chunk.data);
                    // writes.push(promise);
                    const p = promiseTimeout(30000, promise).catch(err => {
                        // Timeout? 30s to write some data is quite long....
                        debug.error(`Failed to write ${chunk.data.length} byte chunk for "/${path}" at file index ${fileIndex}: ${err}`);
                        throw err;
                    });
                    writes.push(p);
                });

                return Promise.all(writes)
                .then((results) => {
                    const bytesWritten = results.reduce((a,b) => a + b, 0);
                    const chunks = results.length;
                    const address = new RecordAddress(path, allocation[0].pageNr, allocation[0].recordNr);

                    debug.log(`Record "/${address.path}" saved at address ${address.pageNr}, ${address.recordNr} - ${allocation.length} addresses, ${bytesWritten} bytes written in ${chunks} chunk(s)`);
                    const record = new Record(storage, address);
                    //let keepDataLength = Math.ceil(header.length / storage.settings.recordSize) * storage.settings.recordSize;
                    record.startData =  bytes; //bytes.slice(0, keepDataLength); // Keep header data 
                    record.allocation = ranges; 
                    record.valueType = type;
                    record.hasKeyTree = hasKeyTree;
                    record.totalBytes = totalBytes;
                    record.headerLength = headerBytes;
                    record.fileIndex = storage.getRecordFileIndex(address.pageNr, address.recordNr);
                    record.timestamp = Date.now();

                    storage.addressCache.update(address);

                    if (deallocateRanges) {
                        debug.log(`Releasing ${deallocateRanges.length} old ranges of "/${address.path}"`);
                        storage.FST.release(deallocateRanges);
                    }

                    // Find out if there are indexes that need to be updated
                    const pathInfo = getPathInfo(record.address.path);
                    const indexes = storage.indexes.get(pathInfo.parent);
                    indexes.forEach(index => {
                        index.handleRecordUpdate(record, value);
                    });

                    return record;
                })
                .catch(reason => {
                    // If any write failed, what do we do?
                    debug.error(`Failed to write record "/${path}": ${err}`);
                    throw reason;
                });
            });
        };

        // read/write lock the record
        const tid = options.tid || uuid62.v1();
        let lock;
        return storage.lock(path, tid, true, `Record.create "/${path}"`) 
        .then(l => {
            lock = l;

            if (typeof value === "string") {
                const encoded = textEncoder.encode(value);
                return _write(VALUE_TYPES.STRING, encoded, value, false);
            }
            else if (value instanceof PathReference) {
                const encoded = textEncoder.encode(value.path);
                return _write(VALUE_TYPES.REFERENCE, encoded, value, false);
            }
            else if (value instanceof ArrayBuffer) {
                return _write(VALUE_TYPES.BINARY, new Uint8Array(value), value, false);
            }
            else if (typeof value !== "object") {
                throw `Unsupported type to store in stand-alone record`;
            }

            const serialize = (path, val) => {
                // if (val instanceof ID) {
                //     let bytes = val.getBytes(); // 16 of 'em
                //     return { type: VALUE_TYPES.ID, bytes };
                // }
                // else 
                if (val instanceof Date) {
                    // Store as 64-bit (8 byte) signed integer. 
                    // NOTE: 53 bits seem to the max for the Date constructor in Chrome browser, 
                    // although higher dates can be constructed using specific year,month,day etc
                    // NOTE: Javascript Numbers seem to have a max "safe" value of (2^53)-1 (Number.MAX_SAFE_INTEGER),
                    // this is because the other 12 bits are used for sign (1 bit) and exponent.
                    // See https://stackoverflow.com/questions/9939760/how-do-i-convert-an-integer-to-binary-in-javascript
                    const ms = val.getTime();
                    const bytes = numberToBytes(ms);
                    return { type: VALUE_TYPES.DATETIME, bytes };
                }
                else if (val instanceof Array) {
                    // Create separate record for the array
                    if (val.length === 0) {
                        return { type: VALUE_TYPES.ARRAY, bytes: [] };
                    }
                    const promise = Record.create(storage, path, val, { tid }).then(record => {
                        return { type: VALUE_TYPES.ARRAY, record };
                    });
                    return promise;
                }
                else if (val instanceof RecordReference) {
                    // Used internally, happens to existing external record data that is not being changed.
                    const record = new Record(storage, val.address);
                    return { type: val.type, record };
                }
                else if (val instanceof ArrayBuffer) {
                    if (val.byteLength > storage.settings.maxInlineValueSize) {
                        const promise = Record.create(storage, path, val, { tid }).then(record => {
                            return { type: VALUE_TYPES.BINARY, record };
                        });
                        return promise;                    
                    }
                    else {
                        return { type: VALUE_TYPES.BINARY, bytes: val };
                    }
                }
                else if (val instanceof PathReference) {
                    const encoded = textEncoder.encode(val.path);
                    if (encoded.length > storage.settings.maxInlineValueSize) {
                        // Create seperate record for this string value
                        const promise = Record.create(storage, path, val, { tid }).then(record => {
                            return { type: VALUE_TYPES.REFERENCE, record };
                        });
                        return promise;
                    }
                    else {
                        // Small enough to store inline
                        return { type: VALUE_TYPES.REFERENCE, binary: encoded };
                    }                    
                }
                else if (typeof val === "object") {
                    // Create seperate record for this object
                    const promise = Record.create(storage, path, val, { tid }).then(record => {
                        return { type: VALUE_TYPES.OBJECT, record };
                    });
                    return promise;
                }
                else if (typeof val === "number") {
                    const bytes = numberToBytes(val);
                    return { type: VALUE_TYPES.NUMBER, bytes };
                }
                else if (typeof val === "boolean") {
                    return { type: VALUE_TYPES.BOOLEAN, bool: val };
                }
                else {
                    // This is a string or something we don't know how to serialize
                    if (typeof val !== "string") {
                        // Not a string, convert to one
                        val = val.toString();
                    }
                    // Idea for later: Use string interning to store identical string values only once, 
                    // using ref count to decide when to remove
                    const encoded = textEncoder.encode(val);
                    if (encoded.length > storage.settings.maxInlineValueSize) {
                        // Create seperate record for this string value
                        const promise = Record.create(storage, path, val, { tid }).then(record => {
                            return { type: VALUE_TYPES.STRING, record };
                        });
                        return promise;
                    }
                    else {
                        // Small enough to store inline
                        return { type: VALUE_TYPES.STRING, binary: encoded };
                    }
                }
            };

            // Store array or object
            let childPromises = [];
            let serialized = [];
            let isArray = value instanceof Array;
            
            if (isArray) {
                // Store array
                value.forEach((val, index) => {
                    if (typeof val === "undefined" || val === null || typeof val === "function") {
                        throw `Array at index ${index} has invalid value. Cannot store null, undefined or functions`;
                    }
                    const childPath = `${path}[${index}]`;
                    let s = serialize(childPath, val);
                    const combine = (s) => {
                        s.index = index;
                        s.ref = val;
                        serialized.push(s);
                    }
                    if (s instanceof Promise) {
                        s = s.then(combine);
                        childPromises.push(s);
                    }
                    else {
                        combine(s);
                    }
                });
            }
            else {
                // Store object

                // Create property tree
                Object.keys(value).forEach(key => {
                    const childPath = `${path}/${key}`;
                    let val = value[key];
                    if (typeof val === "function" || val === null) {
                        return; // Skip functions and null values
                    }
                    else if (typeof val === "undefined") {
                        if (storage.settings.removeVoidProperties === true) {
                            delete value[key]; // Kill the property in the passed object as well, to prevent differences in stored and working values
                            return;
                        }
                        else {
                            throw `Property ${key} has invalid value. Cannot store null or undefined values. Set removeVoidProperties option to true to automatically remove void properties`;
                        }
                    }
                    else {
                        let s = serialize(childPath, val);
                        const combine = (s) => {
                            s.key = key;
                            s.ref = val;
                            serialized.push(s);
                        }
                        if (s instanceof Promise) {
                            s = s.then(combine);
                            childPromises.push(s);
                        }
                        else {
                            combine(s);
                        }
                    }
                });
            }

            const getBinaryValue = (kvp) => {
                // value_type:
                let bytes = [];
                let index = 0;
                bytes[index] = kvp.type << 4;
                // tiny_value?:
                let tinyValue = -1;
                if (kvp.type === VALUE_TYPES.BOOLEAN) { tinyValue = kvp.bool ? 1 : 0; }
                else if (kvp.type === VALUE_TYPES.NUMBER && kvp.ref >= 0 && kvp.ref <= 15 && Math.floor(kvp.ref) === kvp.ref) { tinyValue = kvp.ref; }
                else if (kvp.type === VALUE_TYPES.STRING && kvp.binary && kvp.binary.length === 0) { tinyValue = 0; }
                else if (kvp.type === VALUE_TYPES.ARRAY && kvp.ref.length === 0) { tinyValue = 0; }
                else if (kvp.type === VALUE_TYPES.OBJECT && Object.keys(kvp.ref).length === 0) { tinyValue = 0; }
                if (tinyValue >= 0) {
                    // Tiny value
                    bytes[index] |= tinyValue;
                    bytes.push(64); // 01000000 --> tiny value
                    // The end
                }
                else if (kvp.record) {
                    // External record
                    //recordsToWrite.push(kvp.record);
                    index = bytes.length;
                    bytes[index] = 192; // 11000000 --> record value
                    let address = kvp.record.address;
                    
                    // Set the 6 byte record address (page_nr,record_nr)
                    let bin = new Uint8Array(6);
                    let view = new DataView(bin.buffer);
                    view.setUint32(0, address.pageNr);
                    view.setUint16(4, address.recordNr);
                    bin.forEach(val => bytes.push(val)); //bytes.push(...bin);
                    
                    // End
                }
                else {
                    // Inline value
                    let data = kvp.bytes || kvp.binary;
                    index = bytes.length;
                    bytes[index] = 128; // 10000000 --> inline value
                    bytes[index] |= data.length - 1; // inline_length
                    data.forEach(val => bytes.push(val)); //bytes.push(...data);
                    
                    // End
                }
                return bytes;
            };

            return Promise.all(childPromises).then(() => {
                // Append all serialized data into 1 binary array
                let data, keyTree;
                const minKeysPerNode = 25;
                const minKeysForTreeCreation = 100;
                if (false && serialized.length > minKeysForTreeCreation) {
                    // Create a B+tree
                    const keysPerNode = Math.max(minKeysPerNode, Math.ceil(serialized.length / 10));
                    keyTree = new BPlusTree(keysPerNode, true); // 4 for quick testing, should be 10 or so
                    serialized.forEach(kvp => {
                        let binaryValue = getBinaryValue(kvp);
                        keyTree.add(kvp.key, binaryValue); // TODO: replace kvp.key with same keyIndex'ing strategy as usual
                    });
                    let bytes = keyTree.toBinary();
                    data = new Uint8Array(bytes);
                }
                else {
                    data = serialized.reduce((binary, kvp) => {
                        // For binary key/value layout, see _write function
                        let bytes = [];
                        if (!isArray) {
                            if (kvp.key.length > 128) { throw `Key ${kvp.key} is too long to store. Max length=128`; }
                            let keyIndex = storage.KIT.getOrAdd(kvp.key); // Gets an caching index for this key

                            // key_info:
                            if (keyIndex >= 0) {
                                // Cached key name
                                bytes[0] = 128;                       // key_indexed = 1
                                bytes[0] |= (keyIndex >> 8) & 127;    // key_nr (first 7 bits)
                                bytes[1] = keyIndex & 255;            // key_nr (last 8 bits)
                            }
                            else {
                                // Inline key name
                                bytes[0] = kvp.key.length - 1;        // key_length
                                // key_name:
                                for (let i = 0; i < kvp.key.length; i++) {
                                    let charCode = kvp.key.charCodeAt(i);
                                    if (charCode > 255) { throw `Invalid character in key ${kvp.key} at char ${i+1}`; }
                                    bytes.push(charCode);
                                }
                            }
                        }
                        const binaryValue = getBinaryValue(kvp);
                        binaryValue.forEach(val => bytes.push(val));//bytes.push(...binaryValue);
                        return concatTypedArrays(binary, new Uint8Array(bytes));
                    }, new Uint8Array());
                }

                // Now write the record
                return _write(isArray ? VALUE_TYPES.ARRAY : VALUE_TYPES.OBJECT, data, serialized, !!keyTree);
            });
        })
        .then(record => {
            lock.release(`Record.create`);
            return record;
        })
        .catch(err => {
            lock.release(`Record.create error`);
            debug.error(err);
            throw err;
        });        
    }
    
    /**
     * Retrieves information about a specific child by key name or index
     * @param {string|number} key key name or index number
     * @param {{ tid?: string }} options a previously achieved lock can be passed in the lock property
     * @returns {Promise<{ exists: boolean, key?: string, index?: number, storageType: string, address?: RecordAddress, value?: any, valueType: number }>} returns a Promise that resolves with the child record or null if it the child did not exist
     */
    getChildInfo(key, options = { tid: undefined }) {
        let child = null;
        return this.getChildStream({ keyFilter: [key], tid: options.tid })
        .next(c => {
            child = c;
        })
        .then(() => {
            if (child) {
                return {
                    exists: true,
                    key: child.key,
                    index: child.index,
                    storageType: child.address ? "record" : "value",
                    address: child.address,
                    value: child.value,
                    valueType: child.type 
                };
            }
            return {
                key,
                exists: false,
                storageType: "none",
                valueType: -1
            };
        });
    }

    static update(storage, path, updates, options = { tid: undefined, flags: undefined, trackChanges: true }) {
        // TODO: do something with flags.pushed that indicates the update is a guaranteed insert
        const tid = options.tid || uuid62.v1(); //options.lock ? options.lock.tid : uuid62.v1();
        const trackChanges = options.trackChanges;
        const pathInfo = getPathInfo(path);
        let lock;
        return storage.lock(path, tid, true, `Record.update "/${path}"`)
        .then(l => {
            lock = l;
            return Record.get(storage, { path }, { tid });
        })
        .then(record => {
            if (!record) {
                return storage.moveLockToParent(lock)
                .then((l) => {
                    lock = l;
                    return Record.update(storage, pathInfo.parent, { [pathInfo.key]: updates }, { tid, trackChanges });
                });
            }
            else {
                return record.update(updates, { tid, trackChanges });
            }
        })
        .then(r => {
            if (lock) {
                lock.release(`Record.update, done`);
                lock = null;
            }
        })
        .catch(err => {
            debug.error(err);
            if (lock) {
                lock.release(`Record.update, error`);
            }
            throw err;
        });
    }

    /**
     * 
     * @param {Storage} storage 
     * @param {string} path 
     * @param {(currentValue: any) => any} callback 
     */
    static transaction(storage, path, callback) {
        const pathInfo = getPathInfo(path);

        if (pathInfo.parent === null) {
            throw new Error(`Can't perform transaction on root record`);
        }

        const transaction = new RecordTransaction(pathInfo.parent, callback);
        const state = {
            lock: undefined,
            parentLock: undefined,
            record: undefined,
            parentRecord: undefined
        };

        storage.lock(pathInfo.parent, transaction.tid, true, `Record.transaction "/${pathInfo.parent}"`)
        .then(lock => {
            state.parentLock = lock;
            return Record.get(storage, { path: lock.path }, { tid: transaction.tid });
        })
        .then(parentRecord => {
            if (!parentRecord) {
                return null;
            }
            // Get currentValue
            state.parentRecord = parentRecord;
            return parentRecord.getChildInfo(pathInfo.key)
            .then(child => {
                if (!child.exists) {
                    return null;
                }
                else if (child.storageType === "record") {
                    // Child is stored in its own record
                    transaction.path = child.address.path;
                    return storage.lock(child.address.path, transaction.tid, true, `Record.transaction:childRecord "/${child.address.path}"`)
                    .then(lock => {
                        state.lock = lock;
                        return Record.get(storage, child.address, { tid: transaction.tid })
                        .then(record => {
                            state.record = record;
                            return record.getValue({ tid: transaction.tid });
                        });
                    });
                }
                else {
                    // Child is a simple value stored within parent record
                    return child.value;
                }
            })
        })
        .then(currentValue => {
            transaction.oldValue = cloneObject(currentValue); // Clone or it'll be altered by the callback
            let newValue = callback(currentValue);
            if (newValue instanceof Promise) {
                return newValue.then(newValue => {
                    return newValue;
                });
            }
            return newValue;
        })
        .then(newValue => {
            if (typeof newValue === "undefined") {
                transaction.result = "canceled";
                return; //record;
            }
            else if (newValue !== null) {
                // Mark any keys that are not present in the new value as deleted
                Object.keys(transaction.oldValue).forEach(key => {
                    if (typeof newValue[key] === "undefined") {
                        newValue[key] = null;
                    }
                });
            }
            transaction.newValue = newValue;
            if (state.record) {
                return state.record.update(newValue, { transaction, tid: transaction.tid });
            }
            else if (state.parentRecord) {
                transaction.oldValue = { [pathInfo.key]: transaction.oldValue };
                return state.parentRecord.update( { [pathInfo.key]: newValue }, { transaction, tid: transaction.tid });
            }
            else {
                //return Record.create(storage, path, newValue, { lock: state.parentLock });
                // parent doesn't exist, forward to parent's parent
                let parentPathInfo = getPathInfo(pathInfo.parent);
                return Record.update(storage, parentPathInfo.parent, { [parentPathInfo.key]: { [pathInfo.key]: newValue }}, { tid: transaction.tid } );
            }
        })
        .then(() => {
            state.parentLock.release();
            state.lock && state.lock.release();
            transaction.done();
        });

        return transaction.wait();
    }

    /**
     * 
     * @param {Storage} storage 
     * @param {RecordAddress} address 
     */
    static getDataStream(storage, address, options = { tid: undefined }) { // , options
        const tid = options.tid || uuid62.v1();
        const maxRecordsPerChunk = 200; // 200: about 25KB of data when using 128 byte records
        let resolve, reject;
        let callback;
        const generator = {
            /**
             * @param {(result: {data: Uint8Array, valueType: number, chunks: { pageNr: number, recordNr: number, length: number }[], chunkIndex: number, totalBytes: number, hasKeyTree: boolean }) => boolean} cb callback function that is called with each chunk read. Reading will stop immediately when false is returned
             * @returns {Promise<{ valueType: number, chunks: { pageNr: number, recordNr: number, length: number }[]}>} returns a promise that resolves when all data is read
             */
            next(cb) { 
                callback = cb; 
                const promise = new Promise((rs, rj) => { resolve = rs; reject = rj; }); 
                start();
                return promise;
            }
        };

        function start() {
            storage.lock(address.path, tid, false, `Record.getDataStream "/${address.path}"`) // lock the record while streaming
            .then(lock => {
                if (typeof address.path === "string" 
                    && typeof address.pageNr === "undefined" 
                    && typeof address.recordNr === "undefined"
                ) {
                    // Resolve pageNr and recordNr first
                    Record.resolve(storage, address.path, { tid })
                    .then(addr => {
                        if (!addr) { 
                            // No address found for path, so it doesn't exist
                            lock.release(`Record.getDataStream: record not found`);
                            return reject(new RecordNotFoundError(`Record "/${address.path}" does not exist`));
                        }
                        address.pageNr = addr.pageNr;
                        address.recordNr = addr.recordNr;
                        read(lock);
                    });
                    return;
                }
                else {
                    read(lock);
                }
            })
            .catch(err => {
                debug.error(`Error reading "/${address.path}": `, err);
                reject(err);
            });
        };

        function read(lock) {
            const fileIndex = storage.getRecordFileIndex(address.pageNr, address.recordNr);

            // Read the first record which includes headers
            let data = new Uint8Array(storage.settings.recordSize);
            return storage.readData(fileIndex, data)
            .then(bytesRead => {
                // Read header
                //const isLocked = data[0] & FLAG_WRITE_LOCK; // 0001 0000
                const hasKeyTree = (data[0] & FLAG_KEY_TREE) === FLAG_KEY_TREE;
                const valueType = data[0] & FLAG_VALUE_TYPE; // Last 4-bits of first byte of read data has value type

                if (valueType === 0) {
                    throw new Error("Corrupt record data!");
                }
                
                const view = new DataView(data.buffer);
                // Read Chunk Table
                // TODO: If the CT is too big for 1 record, it needs to read more records or it will crash... 
                // UPDATE: the max amount of chunks === nr of whole pages needed + 3, so this will (probably) never happen
                let chunkTable = [];
                let offset = 1;
                while (true) {
                    const type = view.getUint8(offset);
                    const chunk = {
                        type,
                        pageNr: address.pageNr,
                        recordNr: address.recordNr,
                        length: 1
                    };

                    if (type === 0) {
                        // No more chunks, exit
                        offset++;
                        break;
                    }
                    else if (type === 1) {
                        // First chunk is longer than the 1 record already read
                        chunk.recordNr++;
                        chunk.length = view.getUint16(offset + 1) - 1;
                        offset += 3;
                    }
                    else if (type === 2) {
                        // Next chunk is location somewhere else (not contigious)
                        chunk.pageNr = view.getUint32(offset + 1);
                        chunk.recordNr = view.getUint16(offset + 5);
                        chunk.length = view.getUint16(offset + 7);
                        offset += 9;
                    }
                    chunkTable.push(chunk);
                }
                const lastRecordSize = view.getUint16(offset);
                // if (lastRecordSize === 0) {
                //     // Fixes a bug where the last bit of data exactly filled up the last record, and would not be read because of this 0!
                //     lastRecordSize = storage.settings.recordSize;
                // }
                offset += 2;
                const headerLength = offset;

                const chunks = [{
                    pageNr: address.pageNr,
                    recordNr: address.recordNr,
                    length: 1
                }];

                // Loop through chunkTable entries, add them to chunks array
                const firstChunkLength = chunkTable.length === 0 ? lastRecordSize : data.length - headerLength;
                let totalBytes = firstChunkLength;
                chunkTable.forEach((entry, i) => {
                    let chunk = {
                        pageNr: entry.pageNr,
                        recordNr: entry.recordNr,
                        length: entry.length
                    }
                    let chunkLength = (chunk.length * storage.settings.recordSize);
                    if (i === chunkTable.length-1) { 
                        chunkLength -= storage.settings.recordSize;
                        chunkLength += lastRecordSize;
                    }
                    totalBytes += chunkLength;
                    while (chunk.length > maxRecordsPerChunk) {
                        let remaining = chunk.length - maxRecordsPerChunk;
                        chunk.length = maxRecordsPerChunk;
                        chunks.push(chunk);
                        chunk = {
                            pageNr: chunk.pageNr,
                            recordNr: chunk.recordNr + maxRecordsPerChunk,
                            length: remaining
                        };
                    }
                    chunks.push(chunk);
                });

                const isLastChunk = chunkTable.length === 0;
                if (isLastChunk) {
                    // Release lock right away, we don't need it anymore
                    lock.release(`Record.getDataStream: all data read`);
                    lock = null;
                }

                // Run callback with the first chunk (and possibly the only chunk) already read
                const firstChunkData = new Uint8Array(data.buffer, headerLength, firstChunkLength);
                let proceed = callback({ data: firstChunkData, valueType, chunks, chunkIndex: 0, totalBytes, hasKeyTree, fileIndex, headerLength }) !== false;
                if (!proceed && lock) {
                    lock.release(`Record.getDataStream: no more data requested`);
                }
                if (!proceed || isLastChunk) {
                    resolve({ valueType, chunks });
                    return;
                }
                const next = (index) => {
                    //debug.log(address.path);
                    const chunk = chunks[index];
                    const fileIndex = storage.getRecordFileIndex(chunk.pageNr, chunk.recordNr);
                    let length = chunk.length * storage.settings.recordSize;
                    if (index === chunks.length-1) {
                        length -= storage.settings.recordSize;
                        length += lastRecordSize;
                    }
                    const data = new Uint8Array(length);
                    return storage.readData(fileIndex, data).then(bytesRead => {
                        const isLastChunk = index + 1 === chunks.length
                        if (isLastChunk) {
                            // Release lock right away, we don't need it anymore
                            lock.release(`Record.getDataStream: last chunk read`);
                            lock = null;
                        }

                        const proceed = callback({ data, valueType, chunks, chunkIndex:index, totalBytes, hasKeyTree, fileIndex, headerLength }) !== false;
                        if (!proceed && lock) {
                            lock.release(`Record.getDataStream: no more data requested`);
                        }
                        if (!proceed || isLastChunk) {
                            resolve({ valueType, chunks });
                            return;
                        }
                        else {
                            return next(index+1);
                        }
                    });
                }
                return next(1);
            })
            .catch(err => {
                if (lock){
                    lock.release(`Record.getDataStream: error`);
                }
                reject(err);
            });
        };

        return generator;
    }

    /**
     * Starts reading a record, returns a generator that fires .next for each child key until the callback function returns false. The generator (.next) returns a promise that resolves when all child keys have been processed, or was cancelled because false was returned in the generator callback
     * @param {Storage} storage 
     * @param {RecordAddress} address 
     * @returns {{next: (cb: (child: { key?: string, index?: number, type: number, value?: any, address?: RecordAddress }) => boolean) => Promise<void>}} - returns a generator that is called for each child. return false from your .next callback to stop iterating
     */
    static getChildStream(storage, address, options = { tid: undefined, keyFilter: undefined }) {
        const tid = options.tid || uuid62.v1();
        let resolve, reject;
        let callback;
        const generator = {
            next(cb) { 
                callback = cb; 
                const promise = new Promise((rs, rj) => {
                    resolve = rs;
                    reject = rj;
                });
                start();
                return promise;
            }
        };

        function start() {
            let lock;
            storage.lock(address.path, tid, false, `Record.getChildStream "/${address.path}"`)
            .then(l => {
                lock = l;
                return Record.get(storage, address, { tid });
            })
            .then(record => {
                if (!record) {
                    lock.release(`Record.getChildStream: record not found`);
                    return reject(new RecordNotFoundError(`Record "/${address.path}" does not exist`));
                }
                return record.getChildStream({ tid, keyFilter: options.keyFilter }).next(callback)
                .then(data => {
                    lock.release(`Record.getChildStream: done`);
                    resolve(data);
                });
            })
            .catch(err => {
                lock.release(`Record.getChildStream: error`);
                reject(err);
            });            ;
        };
        return generator;
    }

    /**
     * Starts reading this record, returns a generator that fires .next for each child key until the callback function returns false. The generator (.next) returns a promise that resolves when all child keys have been processed, or was cancelled because false was returned in the generator callback
     * @param {{keyFilter?: string[], tid?: string }} options optional options: keyFilter specific keys to get, offers performance and memory improvements when searching specific keys
     * @returns {{next: (cb: (child: { key?: string, index?: number, type: number, value?: any, address?: RecordAddress }) => boolean) => Promise<void>}} - returns a generator that is called for each child. return false from your .next callback to stop iterating
     */
    getChildStream(options = { keyFilter: undefined, tid: undefined }) {
        const tid = options.tid || uuid62.v1();
        let resolve, reject;
        let callback;
        let childCount = 0;
        let isArray = this.valueType === VALUE_TYPES.ARRAY;
        const generator = {
            next(cb) { 
                callback = cb; 
                const promise = new Promise((rs, rj) => { resolve = rs; reject = rj });
                start();
                return promise;
            }
        };

        const start = () => {
            let lock;
            this.storage.lock(this.address.path, tid, false, `record.getChildStream "/${this.address.path}"`)
            .then(l => {
                lock = l;
                if (this.hasKeyTree) {
                    return createStreamFromBinaryTree();
                }
                // TODO: Enable again?
                // else if (this.allocation.length === 1 && this.allocation[0].length === 1) {
                //     // We have all data in memory (small record)
                //     return createStreamFromLinearData(this.startData, true);
                // }
                else {
                    return this.getDataStream({ tid })
                    .next(({ data, valueType, chunks, chunkIndex, hasKeyTree, headerLength, fileIndex }) => {
                        let isLastChunk = chunkIndex === chunks.length-1;
                        if (isLastChunk) {
                             // Early release
                            lock.release(`record.getChildStream: last chunk read`);
                            lock = null;
                        }
                        return createStreamFromLinearData(data, isLastChunk);
                    });
                }
            })
            .then(() => {
                lock && lock.release(`record.getChildStream: done`);
                resolve();
            })
            .catch(err => {
                lock && lock.release(`record.getChildStream: error`);
                reject(err);
            });
        }

        // Gets children from a indexed binary tree of key/value data
        const createStreamFromBinaryTree = () => {
            
            return new Promise((resolve, reject) => {
                let i = -1;
                const tree = new BinaryBPlusTree(treeDataReader);
                const processLeaf = (leaf) => {

                    if (!leaf.getNext) {
                        resolve(); // Resolve already, so lock can be removed
                    }

                    const children = leaf.entries
                    .map(entry => {
                        i++;
                        if (options.keyFilter) {
                            if (isArray && options.keyFilter.indexOf(i) < 0) { return null; }
                            else if (!isArray && options.keyFilter.indexOf(child.key) < 0) { return null; }
                        }
                        const child = {
                            key: entry.key
                        };
                        const res = getValueFromBinary(child, entry.value, 0);
                        if (res.skip) {
                            return null;
                        }
                        // child.type = res.type;
                        // child.address = res.address;
                        // child.value = res.value;
                        return child;
                    })
                    .filter(child => child !== null);

                    i = 0;
                    const stop = !children.every(child => {
                        return callback(child, i++) !== false; // Keep going until callback returns false
                    });
                    if (!stop && leaf.getNext) {
                        leaf.getNext().then(processLeaf);
                    }
                    else if (stop) {
                        resolve(); //done(`readKeyStream:processLeaf, stop=${stop}, last=${!leaf.getNext}`);
                    }
                };

                if (options.keyFilter && !isArray) {
                    let i = 0;
                    const nextKey = () => {
                        const isLastKey = i + 1 === options.keyFilter.length;
                        const key = options.keyFilter[i];
                        tree.find(key)
                        .then(value => {
                            if (isLastKey) {
                                resolve();  // Resolve already, so lock can be removed
                            }

                            let proceed = true;
                            if (value !== null) {
                                const child = { key };
                                const res = getValueFromBinary(child, value, 0);
                                if (!res.skip) {
                                    proceed = callback(child, i) !== false;
                                }
                            }
                            if (proceed && !isLastKey) {
                                i++;
                                nextKey();
                            }
                            else if (!proceed) {
                                resolve(); //done(`readKeyStream:nextKey, proceed=${proceed}, last=${isLastKey}`);
                            }
                        });
                    }
                    nextKey();
                }
                else {
                    tree.getFirstLeaf().then(processLeaf);
                }
            });              
        }

        // Translates requested data index and length to actual record data location and reads it
        const treeDataReader = (index, length) => {
            // index to fileIndex:
            // fileIndex + headerLength + (floor(index / recordSize)*recordSize) + (index % recordSize)
            // above is not true for fragmented records

            // start recordNr & offset:
            // recordNr = floor((index + headerLength) / recordSize)
            // offset = (index + headerLength) % recordSize
            // end recordNr & offset:
            // recordNr = floor((index + headerLength + length) / recordSize)
            // offset = (index + headerLength + length) % recordSize

            const recordSize = this.storage.settings.recordSize;
            const startRecord = {
                nr: Math.floor((this.headerLength + index) / recordSize),
                offset: (this.headerLength + index) % recordSize
            };
            const endRecord = {
                nr: Math.floor((this.headerLength + index + length) / recordSize),
                offset: (this.headerLength + index + length) % recordSize
            };
            const records = [];
            this.allocation.forEach(range => {
                for(let i = 0; i < range.length; i++) {
                    records.push({ pageNr: range.pageNr, recordNr: range.recordNr + i });
                }
            });
            const readRecords = records.slice(startRecord.nr, endRecord.nr + 1);
            const readRanges = rangesFromRecords(readRecords);
            const reads = [];
            const totalLength = (readRecords.length * recordSize) - startRecord.offset;
            const binary = new Uint8Array(totalLength);
            let bOffset = 0;
            for (let i = 0; i < readRanges.length; i++) {
                const range = readRanges[i];
                let fIndex = this.storage.getRecordFileIndex(range.pageNr, range.recordNr);
                let bLength = range.length * recordSize;
                if (i === 0) { 
                    fIndex += startRecord.offset; 
                    bLength -= startRecord.offset; 
                }
                // if (i + 1 === readRanges.length) {
                //     bLength -= endRecord.offset;
                // }
                let p = this.storage.readData(fIndex, binary, bOffset, bLength);
                reads.push(p);
                bOffset += bLength;
            }
            return Promise.all(reads).then(() => {
                // Convert Uint8Array to byte array
                let bytes = [];
                binary.forEach(val => bytes.push(val)); //bytes.push(...binary);
                return bytes;
            });
        }

        // To get values from binary data:
        const getValueFromBinary = (child, binary, index) => {
            const assert = (bytes) => {
                if (index + bytes > binary.length) { // binary.byteOffset + ... >
                    throw new TruncatedDataError(`truncated data`); 
                }
            };
            assert(2);
            child.type = binary[index] >> 4;
            //let value, address;
            const tinyValue = binary[index] & 0xf;
            const valueInfo = binary[index + 1];
            const isRemoved = child.type === 0;
            const unusedDataLength = isRemoved ? valueInfo : 0;
            const isTinyValue = (valueInfo & 192) === 64;
            const isInlineValue = (valueInfo & 192) === 128;
            const isRecordValue = (valueInfo & 192) === 192;
            index += 2;
            if (isRemoved) {
                throw new Error("corrupt: removed child data isn't implemented yet");
                // NOTE: will not happen yet because record saving currently rewrites
                // whole records on updating. Adding new/updated data to the end of a 
                // record will offer performance improvements. Rewriting a whole new record
                // can then be scheduled upon x updates
                assert(unusedDataLength);
                index += unusedDataLength;
                return { index, skip: true }; // Don't add this child
            }
            else if (isTinyValue) {
                if (child.type === VALUE_TYPES.BOOLEAN) { child.value = tinyValue === 1; }
                else if (child.type === VALUE_TYPES.NUMBER) { child.value = tinyValue; }
                else if (child.type === VALUE_TYPES.STRING) { child.value = ""; }
                else if (child.type === VALUE_TYPES.ARRAY) { child.value = []; }
                else if (child.type === VALUE_TYPES.OBJECT) { child.value = {}; }
                else if (child.type === VALUE_TYPES.BINARY) { child.value = new ArrayBuffer(0); }
                else if (child.type === VALUE_TYPES.REFERENCE) { child.value = new PathReference(""); }
                else { throw `Tiny value deserialization method missing for value type ${child.type}`};
            }
            else if (isInlineValue) {
                const length = (valueInfo & 63) + 1;
                assert(length);
                const bytes = binary.slice(index, index + length);
                if (child.type === VALUE_TYPES.NUMBER) { child.value = bytesToNumber(bytes); }
                else if (child.type === VALUE_TYPES.STRING) {
                    child.value = textDecoder.decode(Uint8Array.from(bytes)); 
                }
                else if (child.type === VALUE_TYPES.DATETIME) { let time = bytesToNumber(bytes); child.value = new Date(time); }
                //else if (type === VALUE_TYPES.ID) { value = new ID(bytes); }
                else if (child.type === VALUE_TYPES.ARRAY) { throw new Error(`Inline array deserialization not implemented`); }
                else if (child.type === VALUE_TYPES.OBJECT) { throw new Error(`Inline object deserialization not implemented`); }
                else if (child.type === VALUE_TYPES.BINARY) { child.value = new Uint8Array(bytes).buffer; }
                else if (child.type === VALUE_TYPES.REFERENCE) { 
                    const path = textDecoder.decode(Uint8Array.from(bytes));
                    child.value = new PathReference(path); 
                }
                else { throw `Inline value deserialization method missing for value type ${type}`};
                index += length;
            }
            else if (isRecordValue) {
                // Record address
                assert(6);
                if (typeof binary.buffer === "undefined") {
                    binary = new Uint8Array(binary);
                }
                const view = new DataView(binary.buffer, binary.byteOffset + index, 6);
                const pageNr = view.getUint32(0);
                const recordNr = view.getUint16(4);
                const childPath = isArray ? `${this.address.path}[${child.index}]` : this.address.path === "" ? child.key : `${this.address.path}/${child.key}`;
                child.address = new RecordAddress(childPath, pageNr, recordNr);

                // Make sure we have the latest address - if the record was changed and its parent
                // must still be updated with the new address, we can get it already
                //DISABLED: child.address = this.storage.addressCache.getLatest(child.address);

                index += 6;
            }
            else {
                throw new Error("corrupt");
            }
            return { index };
        };

        // Gets children from a chunk of data, linear key/value pairs:
        let incompleteData = null;
        const getChildrenFromChunk = (valueType, binary) => {
            if (incompleteData !== null) {
                binary = concatTypedArrays(incompleteData, binary);
                incompleteData = null;
            }
            let children = [];
            if (valueType === VALUE_TYPES.OBJECT || valueType === VALUE_TYPES.ARRAY) {
                isArray = valueType === VALUE_TYPES.ARRAY;
                let index = 0;
                const assert = (bytes) => {
                    if (index + bytes > binary.length) { // binary.byteOffset + ... >
                        throw new TruncatedDataError(`truncated data`); 
                    }
                };

                // Index child keys or array indexes
                while(index < binary.length) {
                    childCount++;
                    let startIndex = index;
                    let child = {
                        key: undefined,
                        index: undefined,
                        type: undefined,
                        value: undefined,
                        address: undefined
                    };
    
                    try {
                        if (isArray) {
                            child.index = childCount-1;
                        }
                        else {
                            assert(2);
                            const keyIndex = (binary[index] & 128) === 0 ? -1 : (binary[index] & 127) << 8 | binary[index+1];
                            if (keyIndex >= 0) {
                                child.key = this.storage.KIT.keys[keyIndex];
                                index += 2;
                            }
                            else {
                                const keyLength = (binary[index] & 127) + 1;
                                index++;
                                assert(keyLength);
                                child.key = "";
                                for(let i = 0; i < keyLength; i++) {
                                    child.key += String.fromCharCode(binary[index + i]);
                                }
                                index += keyLength;
                            }
                        }
        
                        let res = getValueFromBinary(child, binary, index);
                        index = res.index;
                        if (res.skip) {
                            continue;
                        }
                        else if (!isArray && options.keyFilter && options.keyFilter.indexOf(child.key) < 0) {
                            continue;
                        }
                        else if (isArray && options.keyFilter && options.keyFilter.indexOf(child.index) < 0) {
                            continue;
                        }

                        children.push(child);
                    }
                    catch(err) {
                        if (err instanceof TruncatedDataError) { //if (err.message === "corrupt") { throw err; }
                            incompleteData = binary.slice(startIndex);
                            break;
                        }
                        else {
                            throw err;
                        }
                    }
                    // next
                }
            }
            return children;
        }

        let i = 0;
        const createStreamFromLinearData = (chunkData, isLastChunk) => {
            let children = getChildrenFromChunk(this.valueType, chunkData);
            let stop = !children.every(child => {
                const proceed = callback(child, i) !== false; // Keep going until callback returns false
                i++;
                return proceed;
            });
            if (stop || isLastChunk) {
                return false;
            }
        }

        function rangesFromRecords (records) {
            let range = { 
                pageNr: records[0].pageNr, 
                recordNr: records[0].recordNr, 
                length: 1 
            };
            let ranges = [range];
            for(let i = 1; i < records.length; i++) {
                if (records[i].pageNr !== range.pageNr || records[i].recordNr !== range.recordNr + range.length) {
                    range = { pageNr: records[i].pageNr, recordNr: records[i].recordNr, length: 1 };
                    ranges.push(range);
                }
                else {
                    range.length++;
                }
            }
            return ranges;
        }

        return generator;
    }

    getDataStream(options = { tid: undefined }) {
        // TODO: Implement caching?
        if (this.startData.length === this.totalBytes) {
            // We have all data
            return {
                next: (cb) => {
                    cb({ data: this.startData, chunks: this.allocation, chunkIndex: 0 });
                    return Promise.resolve();
                }
            };
        }

        // We don't have all data, get it now
        let resolve, reject;
        let callback;
        const generator = {
            /**
             * @param {(result: {data: Uint8Array, chunkIndex: number, chunks: { pageNr: number, recordNr: number, length: number }[] }) => boolean} cb callback function that is called with each chunk read. Reading will stop immediately when false is returned
             * @returns {Promise<{ chunks: { pageNr: number, recordNr: number, length: number }[]}>} returns a promise that resolves when all data is read
             */
            next(cb) { 
                callback = cb; 
                const promise = new Promise((rs, rj) => { resolve = rs; reject = rj; }); 
                start();
                return promise;
            }
        };
 
        const start = () => {
            // TODO:
            // if (this.storage.wasWritelockedSince(this.address.path, this.timestamp)) {
            //     // We need fresh data
            // }
            // else {
            //     // Just start streaming ahead
            // }


            // Locking not needed, done by Record.getDataStream
            Record.getDataStream(this.storage, this.address, { tid: options.tid })
            .next(({ data, valueType, chunks, chunkIndex, totalBytes, hasKeyTree, fileIndex, headerLength }) => {
                if (chunkIndex === 0) {
                    // Update this record with fresh data
                    let allocation = [];
                    if (chunks.length > 1 && chunks[0].pageNr === chunks[1].pageNr && chunks[0].recordNr+1 === chunks[1].recordNr) {
                        allocation.push({
                            pageNr: chunks[0].pageNr,
                            recordNr: chunks[0].recordNr,
                            length: chunks[1].length + 1
                        });
                        chunks.length > 2 && allocation.push(...chunks.slice(2));
                    }
                    else {
                        allocation.push(...chunks);
                    }
                    this.startData = data;
                    this.headerLength = headerLength;
                    this.fileIndex = fileIndex;
                    this.allocation = allocation;
                    this.valueType = valueType;
                    this.hasKeyTree = hasKeyTree;
                    this.totalBytes = totalBytes;
                    this.timestamp = Date.now();
                }

                const proceed = callback({ data, chunks, chunkIndex }) !== false;
                if (!proceed) {
                    return false;
                }
            })
            .then(summary => {
                resolve(summary);
            })
            .catch(err => {
                reject(err);
            });
        };

        return generator;
    }


    /**
     * Check if this record matches the passed criteria
     * @param {Array<{ key: string, op: string, compare: string }>} filters criteria to test
     */
    matches(filters) {
        let filterKeys = filters.reduce((keys, f) => {
            if (keys.indexOf(f.key) < 0) {
                keys.push(f.key);
            }
            return keys;
        }, []);

        return Promise.all(filterKeys.map(key => this.getChildInfo(key)))
        .then(childInfos => {
            const promises = [];
            let matchesFilters = childInfos.every(childInfo => {
                const child = childInfo;
                const fs = filters.filter(f => f.key === child.key);
                return fs.every(f => {
                    let proceed = true;
                    if (f.op === "!exists" || (f.op === "==" && (f.compare === null || f.compare === undefined))) { 
                        proceed = !child.exists;
                    }
                    else if (f.op === "exists" || (f.op === "!=" && (f.compare === null || f.compare === undefined))) {
                        proceed = child.exists;
                    }
                    else if (!child.exists) {
                        proceed = false;
                    }
                    else {
                        const isMatch = (val) => {
                            if (f.op === "<") { return val < f.compare; }
                            if (f.op === "<=") { return val <= f.compare; }
                            if (f.op === "==") { return val === f.compare; }
                            if (f.op === "!=") { return val !== f.compare; }
                            if (f.op === ">") { return val > f.compare; }
                            if (f.op === ">=") { return val >= f.compare; }
                            if (f.op === "in") { return f.compare.indexOf(val) >= 0; }
                            if (f.op === "!in") { return f.compare.indexOf(val) < 0; }
                            if (f.op === "matches") {
                                return f.compare.test(val.toString());
                            }
                            if (f.op === "!matches") {
                                return !f.compare.test(val.toString());
                            }
                            if (f.op === "between") {
                                return val >= f.compare[0] && val <= f.compare[1];
                            }
                            if (f.op === "!between") {
                                return val < f.compare[0] || val > f.compare[1];
                            }
                            if (f.op === "custom") {
                                return f.compare(val);
                            }
                        };

                        if (child.address) {
                            if (child.valueType === VALUE_TYPES.OBJECT && ["has","!has"].indexOf(f.op) >= 0) {
                                const op = f.op === "has" ? "exists" : "!exists";
                                const p = Record.get(this.storage, child.address)
                                    .then(cr => cr.matches([{ key: f.compare, op }])
                                    .then(isMatch => { return { key: child.key, result: isMatch }; }));
                                promises.push(p);
                                proceed = true;
                            }
                            else if (child.valueType === VALUE_TYPES.ARRAY && ["contains","!contains"].indexOf(f.op) >= 0) {
                                const p = Record.get(this.storage, child.address)
                                    .then(cr => cr.getValue())
                                    .then(arr => { 
                                        const i = arr.indexOf(f.compare);
                                        return { key: child.key, result: (i >= 0 && f.op === "contains") || (i < 0 && f.op === "!contains") };
                                    });
                                promises.push(p);
                                proceed = true;
                            }
                            else if (child.valueType === VALUE_TYPES.STRING) {
                                const p = Record.get(this.storage, child.address)
                                    .then(cr => cr.getValue())
                                    .then(val => {
                                        return { key: child.key, result: isMatch(val) };
                                    });
                                promises.push(p);
                                proceed = true;
                            }
                            else {
                                proceed = false;
                            }
                        }
                        else if (child.type === VALUE_TYPES.OBJECT && ["has","!has"].indexOf(f.op) >= 0) {
                            const has = f.compare in child.value;
                            proceed = (has && f.op === "has") || (!has && f.op === "!has");
                        }
                        else if (child.type === VALUE_TYPES.ARRAY && ["contains","!contains"].indexOf(f.op) >= 0) {
                            const contains = child.value.indexOf(f.compare) >= 0;
                            proceed = (contains && f.op === "contains") || (!contains && f.op === "!contains");
                        }
                        else {
                            const ret = isMatch(child.value);
                            if (ret instanceof Promise) {
                                promises.push(ret);
                                ret = true;
                            }
                            proceed = ret;
                        }
                    }
                    return proceed;
                }); // fs.every
            }); // childInfos.every

            if (matchesFilters && promises.length > 0) {
                // We have to wait for promises to resolve before we know for sure if it is a match
                return Promise.all(promises).then(results => {
                    return results.every(r => r.result);
                });            
            }
            else {
                return Promise.resolve(matchesFilters);
            }
        });
    }

    // static transaction(storage, address, callback) {
    //     const transaction = new RecordTransaction(callback);
    //     Record.get(storage, address, { transaction }).then(record => {
    //         if (!record) {
    //             debug.error(`Path "/${address.path}" does not have its own record to run transaction on. Use the parent instead`);
    //             transaction.fail("no record to run transaction on");
    //         }
    //     });
    //     return transaction.wait();
    // }

    /**
     * Gets the record stored at a specific address (pageNr+recordNr, or path)
     * @param {Storage} storage - reference to the used storage engine
     * @param {RecordAddress} address - which page/recordNr/path the record resides
     * @returns {Promise<Record>} - returns a promise that resolves with a Record object or null reference if the record doesn't exist
     */
    static get(storage, address, options = { tid: undefined }) {
        /** @type {Record} */
        let record;
        /**  @type {RecordLock} */
        let lock;
        /** @type {string} */
        // const tid = options.tid || uuid62.v1();
        // return storage.lock(address.path, tid, false, `Record.get "/${address.path}"`)
        // .then(l => {
        //     lock = l;
            return Record.getDataStream(storage, address, { tid: options.tid })
            .next(({ data, valueType, hasKeyTree, chunks, headerLength, fileIndex, totalBytes }) => {
                let allocation = [];
                if (chunks.length > 1 && chunks[0].pageNr === chunks[1].pageNr && chunks[0].recordNr+1 === chunks[1].recordNr) {
                    allocation.push({
                        pageNr: chunks[1].pageNr,
                        recordNr: chunks[0].recordNr,
                        length: chunks[1].length + 1
                    });
                    chunks.length > 2 && allocation.push(...chunks.slice(2));
                }
                else {
                    allocation.push(...chunks);
                }
    
                record = new Record(storage, address);
                record.startData = data;
                record.headerLength = headerLength;
                record.fileIndex = fileIndex;
                record.allocation = allocation;
                record.valueType = valueType;
                record.hasKeyTree = hasKeyTree;
                record.totalBytes = totalBytes;
                record.timestamp = Date.now();
                return false; // Stop data streaming after first bit of data
            })
            .catch(err => {
                if (err instanceof RecordNotFoundError) {
                    record = null;
                }
                else {
                    throw err;
                }
            })
            .then(() => {
                return record;
            });
        // })
        // .then(record => {
        //     lock.release(`Record.get "/${address.path}"`);
        //     return record;
        // });
    }

    /**
     * Resolves the RecordAddress for given path
     * @param {Storage} storage - reference to the used storage engine
     * @param {string} path - path to resolve
     * @param {{ tid?: string }} options
     * @returns {Promise<RecordAddress>} - returns Promise that resolves with the given path if the record exists, or with a null reference if it doesn't
     */
    static resolve(storage, path, options = { tid: undefined }) {
        path = path.replace(/^\/|\/$/g, ""); // Remove start/end slashes
        let address = storage.addressCache.find(path);
        if (address) {
            return Promise.resolve(address);
        }
        // Cache miss. 
        // Look it up the hard way by reading parent record from file
        let ancestorAddress = storage.addressCache.findAncestor(path);
        let tailPath = path.substr(ancestorAddress.path.length).replace(/^\//, "");
        let keys = getPathKeys(tailPath);
        const tid = options.tid || uuid62.v1();
        
        return new Promise((resolve, reject) => {
            const next = (index, parentAddress) => {
                // Because IO reading is async, it is possible that another caller already came
                // accross the record we are trying to resolve. Check the cache again
                let address = storage.addressCache.find(path);
                if (address) { 
                    // Found by other caller in the mean time, stop IO and return
                    return resolve(address); 
                }

                let lock;
                storage.lock(parentAddress.path, tid, false, `Record.resolve "/${parentAddress.path}"`)
                .then(l => {
                    lock = l;
                    return Record.get(storage, parentAddress, { tid });
                })
                .then(parentRecord => {
                    if (!parentRecord) { 
                        // Parent doesn't exist
                        lock.release(`Record.resolve: parent record does not exist`);
                        return null;
                    }

                    return parentRecord.getChildInfo(keys[index], { tid });
                })
                .then(childInfo => {
                    if (childInfo === null) { 
                        resolve(null);
                        return; 
                    }
                    else {
                        lock.release(`Record.resolve: done`);
                    }
                    if (childInfo.address) {
                        storage.addressCache.update(childInfo.address); // Cache anything that comes along!
                    }
                    if (!childInfo.exists) { 
                        // Key does not exist
                        resolve(null); 
                    }
                    else if (!childInfo.address) {
                        // Child is not stored in its own record
                        resolve(null);
                    }
                    else if (index === keys.length-1) {
                        // This is the node we were looking for
                        resolve(childInfo.address);
                    }
                    else {
                        // We have to dig deeper
                        next(index + 1, childInfo.address);
                    }
                });
            };
            next(0, ancestorAddress);
        });

    }

}

module.exports = {
    Record,
    RecordAddress,
    RecordReference,
    RecordTransaction,
    RecordLock,
    VALUE_TYPES,
    UNCHANGED
};