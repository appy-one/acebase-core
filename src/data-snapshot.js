const { DataReference } = require('./data-reference');
const { getPathKeys } = require('./path-info');

const getChild = (snapshot, path) => {
    if (!snapshot.exists()) { return null; }
    let child = snapshot.val();
    //path.split("/").every...
    getPathKeys(path).every(key => {
        child = child[key];
        return typeof child !== "undefined";
    });
    return child || null;
};

const getChildren = (snapshot) => {
    if (!snapshot.exists()) { return []; }
    let value = snapshot.val();
    if (value instanceof Array) {
        return new Array(value.length).map((v,i) => i);
    }
    if (typeof value === "object") {
        return Object.keys(value);
    }
    return [];
};

class DataSnapshot {

    /**
     * 
     * @param {DataReference} ref 
     * @param {any} value 
     */
    constructor(ref, value, isRemoved = false, prevValue) {
        this.ref = ref;
        this.val = () => { return value; };
        this.previous = () => { return prevValue; }
        this.exists = () => { 
            if (isRemoved) { return false; } 
            return value !== null && typeof value !== "undefined"; 
        }
    }
    
    /**
     * Gets a new snapshot for a child node
     * @param {string} path child key or path
     * @returns {DataSnapshot}
     */
    child(path) {
        // Create new snapshot for child data
        let child = getChild(this, path);
        return new DataSnapshot(this.ref.child(path), child);
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
     * @param {(child: DataSnapshot) => boolean} callback function that is called with a snapshot of each child node in this snapshot. Must return a boolean value that indicates whether to continue iterating or not.
     * @returns {void}
     */
    forEach(callback) {
        const value = this.val();
        return getChildren(this).every((key, i) => {
            const snap = new DataSnapshot(this.ref.child(key), value[key]); 
            return callback(snap);
        });
    }

    /**
     * @type {string|number}
     */
    get key() { return this.ref.key; }

    // /**
    //  * Convenience method to update this snapshot's value AND commit the changes to the database
    //  * @param {object} updates 
    //  */
    // update(updates) {
    //     return this.ref.update(updates)
    //     .then(ref => {
    //         const isRemoved = updates === null;
    //         let value = this.val();
    //         if (!isRemoved && typeof updates === 'object' && typeof value === 'object') {
    //             Object.assign(value, updates);
    //         }
    //         else {
    //             value = updates;
    //         }
    //         this.val = () => { return value; };
    //         this.exists = () => {
    //             return value !== null && typeof value !== "undefined"; 
    //         }
    //         return this;
    //     });
    // }
}

module.exports = { DataSnapshot };