"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MutationsDataSnapshot = exports.DataSnapshot = void 0;
const path_info_1 = require("./path-info");
function getChild(snapshot, path, previous = false) {
    if (!snapshot.exists()) {
        return null;
    }
    let child = previous ? snapshot.previous() : snapshot.val();
    if (typeof path === 'number') {
        return child[path];
    }
    path_info_1.PathInfo.getPathKeys(path).every(key => {
        child = child[key];
        return typeof child !== 'undefined';
    });
    return child || null;
}
function getChildren(snapshot) {
    if (!snapshot.exists()) {
        return [];
    }
    let value = snapshot.val();
    if (value instanceof Array) {
        return new Array(value.length).map((v, i) => i);
    }
    if (typeof value === 'object') {
        return Object.keys(value);
    }
    return [];
}
class DataSnapshot {
    /**
     * Creates a new DataSnapshot instance
     */
    constructor(ref, value, isRemoved = false, prevValue, context) {
        this.ref = ref;
        this.val = () => { return value; };
        this.previous = () => { return prevValue; };
        this.exists = () => {
            if (isRemoved) {
                return false;
            }
            return value !== null && typeof value !== 'undefined';
        };
        this.context = () => { return context || {}; };
    }
    val() { }
    previous() { }
    exists() { return false; }
    context() { }
    /**
     * Creates a DataSnapshot instance (for internal AceBase usage only)
     */
    static for(ref, value) {
        return new DataSnapshot(ref, value);
    }
    /**
     * Gets a new snapshot for a child node
     * @param path child key or path
     * @returns Returns a DataSnapshot of the child
     */
    child(path) {
        // Create new snapshot for child data
        let val = getChild(this, path, false);
        let prev = getChild(this, path, true);
        return new DataSnapshot(this.ref.child(path), val, false, prev);
    }
    /**
     * Checks if the snapshot's value has a child with the given key or path
     * @param {string} path child key or path
     * @returns {boolean}
     */
    hasChild(path) {
        return getChild(this, path) !== null;
    }
    /**
     * Indicates whether the the snapshot's value has any child nodes
     * @returns {boolean}
     */
    hasChildren() {
        return getChildren(this).length > 0;
    }
    /**
     * The number of child nodes in this snapshot
     * @returns {number}
     */
    numChildren() {
        return getChildren(this).length;
    }
    /**
     * Runs a callback function for each child node in this snapshot until the callback returns false
     * @param callback function that is called with a snapshot of each child node in this snapshot. Must return a boolean value that indicates whether to continue iterating or not.
     * @returns {void}
     */
    forEach(callback) {
        const value = this.val();
        const prev = this.previous();
        return getChildren(this).every((key, i) => {
            const snap = new DataSnapshot(this.ref.child(key), value[key], false, prev[key]);
            return callback(snap);
        });
    }
    /**
     * @type {string|number}
     */
    get key() { return this.ref.key; }
}
exports.DataSnapshot = DataSnapshot;
class MutationsDataSnapshot extends DataSnapshot {
    val(warn = true) { return []; }
    previous() { throw new Error('Iterate values to get previous values for each mutation'); }
    constructor(ref, mutations, context) {
        super(ref, mutations, false, undefined, context);
        this.val = (warn = true) => {
            if (warn) {
                console.warn(`Unless you know what you are doing, it is best not to use the value of a mutations snapshot directly. Use child methods and forEach to iterate the mutations instead`);
            }
            return mutations;
        };
    }
    /**
     * Runs a callback function for each mutation in this snapshot until the callback returns false
     * @param callback function that is called with a snapshot of each mutation in this snapshot. Must return a boolean value that indicates whether to continue iterating or not.
     * @returns Returns whether every child was interated
     */
    forEach(callback) {
        const mutations = this.val();
        return mutations.every(mutation => {
            const ref = mutation.target.reduce((ref, key) => ref.child(key), this.ref);
            const snap = new DataSnapshot(ref, mutation.val, false, mutation.prev);
            return callback(snap);
        });
    }
    /**
     * Gets a snapshot of a mutated node
     * @param index index of the mutation
     * @returns Returns a DataSnapshot of the mutated node
     */
    child(index) {
        if (typeof index !== 'number') {
            throw new Error(`child index must be a number`);
        }
        const mutation = this.val()[index];
        const ref = mutation.target.reduce((ref, key) => ref.child(key), this.ref);
        return new DataSnapshot(ref, mutation.val, false, mutation.prev);
    }
}
exports.MutationsDataSnapshot = MutationsDataSnapshot;
//# sourceMappingURL=data-snapshot.js.map