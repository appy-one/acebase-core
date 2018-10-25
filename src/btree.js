const { numberToBytes, bytesToNumber } = require('./utils');

const KEY_TYPE = {
    UNDEFINED: 0,
    STRING: 1,
    NUMBER: 2,
    BOOLEAN: 3,
    DATE: 4
};

class BPlusTreeNodeEntry {
    /**
     * 
     * @param {BPlusTreeNode} node 
     * @param {string|number|boolean|Date} key 
     */
    constructor(node, key) {
        this.node = node;
        this.key = key;
        /**
         * @type {BPlusTreeNode|BPlusTreeLeaf}
         */
        this.ltChild = null;
    }
}

class BPlusTreeNode {
    /**
     * 
     * @param {BPlusTree} tree 
     * @param {BPlusTreeNode} parent 
     */
    constructor(tree, parent) {
        this.tree = tree;
        this.parent = parent;
        /**
         * @type {BPlusTreeNodeEntry[]}
         */
        this.entries = [];

        /**
         * @type {BPlusTreeNode|BPlusTreeLeaf}
         */
        this.gtChild = null;
    }

    toString() {
        let str = "Node: [" + this.entries.map(entry => entry.key).join(" | ") + "]";
        str += " --> ";
        str += this.entries.map(entry => entry.ltChild.toString()).join(", ");
        str += ", " + this.gtChild.toString();
        return str;
    }    

    /**
     * 
     * @param {string|number|boolean|Date|undefined} newKey 
     * @param {BPlusTreeLeaf} fromLeaf 
     * @param {BPlusTreeLeaf} newLeaf 
     */
    insertKey(newKey, fromLeaf, newLeaf) {
        // New key is being inserted from splitting leaf node
        if(this.entries.findIndex(entry => entry.key === newKey) >= 0) {
            throw new Error(`Key ${newKey} is already present in node`);
        }

        const newNodeEntry = new BPlusTreeNodeEntry(this, newKey);
        if (this.gtChild === fromLeaf) {
            newNodeEntry.ltChild = fromLeaf;
            this.gtChild = newLeaf;
            this.entries.push(newNodeEntry);
        }
        else {
            const oldNodeEntry = this.entries.find(entry => entry.ltChild === fromLeaf);
            const insertIndex = this.entries.indexOf(oldNodeEntry);
            newNodeEntry.ltChild = fromLeaf;
            oldNodeEntry.ltChild = newLeaf;
            this.entries.splice(insertIndex, 0, newNodeEntry);
        }

        this._checkSize();
    }

    _checkSize() {
        // Check if there are too many entries
        if (this.entries.length > this.tree.maxEntriesPerNode) {
            // Split this node
            // A = [ 10, 20, 30, 40 ] becomes A = [ 10, 20 ], B = [ 40 ], C = 30 moves to parent
            // B's gtChild (-) becomes A's gtChild (>=40)
            // A's gtChild (>=40) becomes C's ltChild (<30)
            // C's ltChild (<30) becomes A
            // C's entry_index+1.ltChild (when inserted, or C's node.gtChild when appended) becomes B
            const splitIndex = Math.ceil(this.tree.maxEntriesPerNode / 2);
            const moveEntries = this.entries.splice(splitIndex);
            const moveUpEntry = moveEntries.shift();
            const ltChild = moveUpEntry.ltChild;
            moveUpEntry.ltChild = this;
            const gtChild = this.gtChild;
            this.gtChild = ltChild;

            if (this.parent === null) {
                // Create new root node
                const newRoot = new BPlusTreeNode(this.tree, null);
                newRoot.entries = [moveUpEntry];
                const newSibling = new BPlusTreeNode(this.tree, newRoot);
                newSibling.entries = moveEntries;
                moveEntries.forEach(entry => entry.ltChild.parent = newSibling);
                newRoot.gtChild = newSibling;
                newSibling.gtChild = gtChild;
                gtChild.parent = newSibling;
                this.parent = newRoot;
                this.tree.root = newRoot;
                this.tree.depth++;
            }
            else {
                const newSibling = new BPlusTreeNode(this.tree, this.parent);
                newSibling.entries = moveEntries;
                moveEntries.forEach(entry => entry.ltChild.parent = newSibling);
                newSibling.gtChild = gtChild;
                gtChild.parent = newSibling;

                // Find where to insert moveUp
                const insertIndex = this.parent.entries.findIndex(entry => entry.key > moveUpEntry.key);
                if (insertIndex < 0) {
                    // Add to the end
                    this.parent.entries.push(moveUpEntry);
                    this.parent.gtChild = newSibling;
                }
                else {
                    // Insert somewhere in between
                    let insertBefore = this.parent.entries[insertIndex];
                    insertBefore.ltChild = newSibling;
                    this.parent.entries.splice(insertIndex, 0, moveUpEntry);
                }

                this.parent._checkSize(); // Let it check its size
            }
        }
    }

    toBinary(keepFreeSpace) {
        // EBNF layout:
        // data                 = byte_length, index_type, max_node_entries, root_node
        // byte_length          = 4 byte number (byte count)
        // index_type           = 1 byte = [0,0,0,0,0,0,0,is_unique]
        // max_node_entries     = 1 byte number
        // root_node            = node | leaf
        // node*                = byte_length, is_leaf, free_byte_length, entries_length, entries, gt_child_ptr, children
        // is_leaf              = 1 byte
        //                          0: no, it's a node
        //                          1: yes, leaf
        // free_byte_length     = byte_length (how many bytes are free for later additions)
        // entries_length       = 1 byte number
        // entries              = entry, [entry, [entry...]]
        // entry                = key, lt_child_ptr
        // key                  = key_type, key_length, key_data
        // key_type             = 1 byte number
        //                          0: UNDEFINED (equiv to sql null values)
        //                          1: STRING
        //                          2: NUMBER
        //                          3: BOOLEAN
        //                          4: DATE
        // key_length           = 1 byte number
        // key_data             = [key_length] bytes ASCII string
        // lt_child_ptr         = 4 byte number (byte offset to node | leaf)
        // gt_child_ptr         = 4 byte number (byte offset to node | leaf)
        // children             = node, [node, [node...]] | leaf, [leaf, [leaf...]]
        // leaf**               = byte_length, is_leaf, free_byte_length, prev_leaf_ptr, next_leaf_ptr, entries_length, leaf_entries
        // prev_leaf_ptr        = 4 byte signed_number (byte offset to leaf)
        // next_leaf_ptr        = 4 byte signed_number (byte offset to leaf)
        // leaf_entries         = leaf_entry, [leaf_entry, [leaf_entry...]]
        // leaf_entry           = key, val
        // signed_number        = 32 bits = [negative_flag, bit{31}]
        // val                  = val_length, val_data
        // val_length           = 4 byte number (byte count)
        // val_data             = is_unique?
        //                          0: value_list
        //                          1: value
        // value_list           = value_list_length, value, [value, [value...]]
        // value_list_length    = 4 byte number
        // value                = value_length, value_data
        // value_length         = 1 byte number
        // value_data           = [value_length] bytes data         
        //
        // * Written by BPlusTreeNode.toBinary()
        // ** Written by BPlusTreeLeaf.toBinary() 

        let bytes = [];

        // byte_length:
        bytes.push(0, 0, 0, 0);

        // is_leaf:
        bytes.push(0); // (no)

        // free_byte_length:
        bytes.push(0, 0, 0, 0); // Not used for nodes at this time, reserved for future use

        // entries_length:
        bytes.push(this.entries.length);

        let pointers = [],      // pointers refer to an offset in the binary data where nodes/leafs can be found
            references = [];    // references point to an index in the binary data where pointers are to be stored
        
        this.entries.forEach(entry => {
            let keyBytes = BPlusTree.getBinaryKeyData(entry.key);
            bytes.push(...keyBytes);

            // lt_child_ptr:
            let index = bytes.length;
            bytes.push(0, 0, 0, 0);
            references.push({ name: `<${entry.key}`, index, node: entry.ltChild });
        });

        // gt_child_ptr:
        let index = bytes.length;
        bytes.push(0, 0, 0, 0);
        references.push({ name: `>${this.entries[this.entries.length - 1].key}`, index, node: this.gtChild });

        // update byte_length:
        bytes[0] = (bytes.length >> 24) & 0xff;
        bytes[1] = (bytes.length >> 16) & 0xff;
        bytes[2] = (bytes.length >> 8) & 0xff;
        bytes[3] = bytes.length & 0xff;

        const addChild = (childNode, name) => {
            index = bytes.length;
            const refIndex = references.findIndex(ref => ref.node === childNode);
            const ref = references.splice(refIndex, 1)[0];
            const offset = index - (ref.index + 3);
            bytes[ref.index] = BPlusTree.addBinaryDebugString(`child_ptr ${name}`, (offset >> 24) & 0xff);
            bytes[ref.index+1] = (offset >> 16) & 0xff;
            bytes[ref.index+2] = (offset >> 8) & 0xff;
            bytes[ref.index+3] = offset & 0xff;
            
            // Add child here
            let child;
            // try {
                child = childNode.toBinary(keepFreeSpace);
                bytes = bytes.concat(child.bytes);            
            // }
            // catch(err) {
            //     // Currently see a stack overflow happening sometimes, have to debug this
            //     console.error(err);
            //     throw err;
            // }
            if (childNode instanceof BPlusTreeLeaf) {
                // Remember location we stored this leaf, we need it later
                pointers.push({ 
                    name, 
                    leaf: childNode, 
                    index
                });
            }
            // Add node pointers added by the child
            child.pointers && child.pointers.forEach(pointer => {
                pointer.index += index;
                pointers.push(pointer);
            });
            // Add unresolved references added by the child
            child.references.forEach(ref => {
                ref.index += index;
                references.push(ref);
            });
        };

        // Update all lt_child_ptr's:
        this.entries.forEach(entry => {
            index = bytes.length;
            if (entry.ltChild !== null) {
                // Update lt_child_ptr:
                addChild(entry.ltChild, `<${entry.key}`);
            }
        });

        // Update gt_child_ptr:
        if (this.gtChild !== null) {
            addChild(this.gtChild, `>=${this.entries[this.entries.length-1].key}`);
        }

        // Check if we can resolve any leaf references
        // let maxOffset = Math.pow(2, 31) - 1;
        // pointers.forEach(pointer => {
        //     const i = references.findIndex(ref => ref.leaf === pointer.leaf);
        //     if (i >= 0) {
        //         let ref = references.splice(i, 1); // remove it from the references
        //         let offset = pointer.index - ref.index;
        //         const negative = (offset < 0);
        //         if (negative) { offset = -offset; }
        //         if (offset > maxOffset) {
        //             throw new Error(`offset to big to store in 31 bits`);
        //         }
        //         bytes[ref.index] = ((offset >> 24) & 0x7f) | (negative ? 0x80 : 0);
        //         bytes[ref.index+1] = (offset >> 16) & 0xff;
        //         bytes[ref.index+2] = (offset >> 8) & 0xff;
        //         bytes[ref.index+3] = offset & 0xff;
        //     }
        // });
        BPlusTreeNode.resolveBinaryReferences(bytes, references, pointers);
        return { bytes, references, pointers };
    }

    static resolveBinaryReferences(bytes, references, pointers) {
        let maxOffset = Math.pow(2, 31) - 1;
        pointers.forEach(pointer => {
            while(true) {
                const i = references.findIndex(ref => ref.target === pointer.leaf);
                if (i < 0) {
                    break;
                }
                else {
                    let ref = references.splice(i, 1)[0]; // remove it from the references
                    let offset = pointer.index - ref.index;
                    const negative = (offset < 0);
                    if (negative) { offset = -offset; }
                    if (offset > maxOffset) {
                        throw new Error(`reference offset to big to store in 31 bits`);
                    }
                    let debugName = bytes[ref.index] instanceof Array ? bytes[ref.index][0] : undefined;
                    bytes[ref.index] = ((offset >> 24) & 0x7f) | (negative ? 0x80 : 0);
                    if (debugName) {
                        bytes[ref.index] = [debugName, bytes[ref.index]];
                    }
                    bytes[ref.index+1] = (offset >> 16) & 0xff;
                    bytes[ref.index+2] = (offset >> 8) & 0xff;
                    bytes[ref.index+3] = offset & 0xff;
                }
            }
        });      
    }

}

class BPlusTreeLeafEntry {
    /**
     * 
     * @param {BPlusTreeLeaf} leaf 
     * @param {string|number|boolean|Date|undefined} key 
     * @param {ArrayBuffer|number[]|string} value 
     */
    constructor(leaf, key, value) {
        this.leaf = leaf;
        this.key = key;
        this.values = typeof value === 'undefined' ? [] : [value];
    }
}

class BPlusTreeLeaf {
    /**
     * 
     * @param {BPlusTree|BPlusTreeNode} parent 
     */
    constructor(parent) {
        /**
         * @type {BPlusTree|BPlusTreeNode}
         */
        this.parent = parent;
        /**
         * @type {BPlusTreeLeafEntry[]}
         */
        this.entries = [];
        /**
         * @type {BPlusTreeLeaf}
         */
        this.prevLeaf = null;
        /**
         * @type {BPlusTreeLeaf}
         */
        this.nextLeaf = null;
    }

    /**
     * The BPlusTree this leaf is in
     * @type {BPlusTree}
     */
    get tree() {
        return this.parent instanceof BPlusTree ? this.parent : this.parent.tree;
    }

    /**
     * Adds an entry to this leaf
     * @param {string|number|boolean|Date|undefined} key 
     * @param {ArrayBuffer|Array} value data to store with the key, max size is 255
     * @returns {BPlusTreeLeafEntry} returns the added leaf entry
     */
    add(key, value) {

        if (typeof value === "string") {
            // For now, allow this. Convert to byte array
            let bytes = [];
            for(let i = 0; i < value.length; i++) {
                bytes.push(value.charCodeAt(i));
            }
            value = bytes;
        }
        if (!(value instanceof Array || value instanceof ArrayBuffer)) {
            throw new TypeError("value must be a byte array");
        }
        if (value.length > 255) {
            throw new Error(`Unable to store values larger than 255 bytes`); // binary restriction
        }

        // First. check if we already have an entry with this key
        const entryIndex = this.entries.findIndex(entry => entry.key === key);
        if (entryIndex >= 0) {
            if (this.tree.uniqueKeys) {
                throw new Error(`Cannot insert duplicate key ${key}`);
            }
            const entry = this.entries[entryIndex];
            entry.values.push(value);
            return entry;
        }

        // New key, create entry
        const entry = new BPlusTreeLeafEntry(this, key, value);
        if (this.entries.length === 0) {
            this.entries.push(entry);
        }
        else {
            // Find where to insert sorted
            let insertIndex = this.entries.findIndex(otherEntry => otherEntry.key > entry.key);
            if (insertIndex < 0) { 
                this.entries.push(entry);
            }
            else {
                this.entries.splice(insertIndex, 0, entry);
            }

            // FInd out if there are too many entries
            if (this.entries.length > this.tree.maxEntriesPerNode) {
                // Split the leaf
                const splitIndex = Math.ceil(this.tree.maxEntriesPerNode / 2);
                const moveEntries = this.entries.splice(splitIndex);
                const copyUpKey = moveEntries[0].key;
                if (this.parent instanceof BPlusTree) {
                    // We have to create the first parent node
                    const tree = this.parent;
                    this.parent = new BPlusTreeNode(tree, null);
                    tree.root = this.parent;
                    tree.depth = 2;
                    const newLeaf = new BPlusTreeLeaf(this.parent);
                    newLeaf.entries = moveEntries;
                    const newEntry = new BPlusTreeNodeEntry(this.parent, copyUpKey);
                    newEntry.ltChild = this;
                    this.parent.gtChild = newLeaf;
                    this.parent.entries = [newEntry];

                    // Update linked list pointers
                    newLeaf.prevLeaf = this;
                    if (this.nextLeaf) {
                        newLeaf.nextLeaf = this.nextLeaf;
                        newLeaf.nextLeaf.prevLeaf = newLeaf;
                    }
                    this.nextLeaf = newLeaf;
                }
                else {
                    const newLeaf = new BPlusTreeLeaf(this.parent);
                    newLeaf.entries = moveEntries;
                    this.parent.insertKey(copyUpKey, this, newLeaf);

                    // Update linked list pointers
                    newLeaf.prevLeaf = this;
                    if (this.nextLeaf) {
                        newLeaf.nextLeaf = this.nextLeaf;
                        newLeaf.nextLeaf.prevLeaf = newLeaf;
                    }
                    this.nextLeaf = newLeaf;  
                }
            }
        }
        return entry;
    }

    toString() {
        let str = "Leaf: [" + this.entries.map(entry => entry.key).join(" | ") + "]";
        return str;
    }

    toBinary(keepFreeSpace = false) {
        // See BPlusTreeNode.toBinary() for data layout
        const bytes = [];

        // byte_length
        bytes.push(0, 0, 0, 0);

        // is_leaf:
        bytes.push(1); // (yes)

        // free_byte_length:
        bytes.push(0, 0, 0, 0);

        const references = [];

        // prev_leaf_ptr:
        this.prevLeaf && references.push({ name: `<${this.entries[0].key}`, target: this.prevLeaf, index: bytes.length });
        bytes.push(BPlusTree.addBinaryDebugString("prev_leaf_ptr", 0), 0, 0, 0);

        // next_leaf_ptr:
        this.nextLeaf && references.push({ name: `>${this.entries[this.entries.length-1].key}`, target: this.nextLeaf, index: bytes.length });
        bytes.push(BPlusTree.addBinaryDebugString("next_leaf_ptr", 0), 0, 0, 0);

        // entries_length:
        bytes.push(BPlusTree.addBinaryDebugString("entries_length", this.entries.length));

        this.entries.forEach(entry => {
            let keyBytes = BPlusTree.getBinaryKeyData(entry.key);
            bytes.push(...keyBytes);

            // val_length:
            const valLengthIndex = bytes.length;
            bytes.push(BPlusTree.addBinaryDebugString("val_length", 0), 0, 0, 0);

            const writeValue = (value) => {
                // value_length:
                bytes.push(BPlusTree.addBinaryDebugString("value_length", value.length));

                // value_data:
                bytes.push(...value);
            };
            if (this.tree.uniqueKeys) {
                // value:
                writeValue(entry.values[0]);
            }
            else {
                // value_list_length:
                const valueListLength = entry.values.length;
                bytes.push((valueListLength >> 24) & 0xff);
                bytes.push((valueListLength >> 16) & 0xff);
                bytes.push((valueListLength >> 8) & 0xff);
                bytes.push(valueListLength & 0xff);

                entry.values.forEach(value => {
                    // value:
                    writeValue(value);
                });
            }

            // update val_length
            const valLength = bytes.length - valLengthIndex - 4;
            bytes[valLengthIndex] = (valLength >> 24) & 0xff;
            bytes[valLengthIndex+1] = (valLength >> 16) & 0xff;
            bytes[valLengthIndex+2] = (valLength >> 8) & 0xff;
            bytes[valLengthIndex+3] = valLength & 0xff;
        });

        // Add free space
        // const fillFactor = keepFreeSpace 
        //     ? Math.ceil((this.entries.length / this.tree.maxEntriesPerNode) * 100)
        //     : 100;
        // const freeBytesLength = Math.ceil(((100 - fillFactor) / 100) * bytes.length);
        const avgBytesPerEntry = Math.ceil(bytes.length / this.entries.length);
        const availableEntries = this.tree.maxEntriesPerNode - this.entries.length;
        const freeBytesLength = 
            keepFreeSpace && this.entries.length > 0
            ? availableEntries * avgBytesPerEntry
            : 0;
        for (let i = 0; i < freeBytesLength; i++) { bytes.push(0); }

        // update byte_length:
        bytes[0] = (bytes.length >> 24) & 0xff;
        bytes[1] = (bytes.length >> 16) & 0xff;
        bytes[2] = (bytes.length >> 8) & 0xff;
        bytes[3] = bytes.length & 0xff;

        // update free_byte_length
        bytes[5] = (freeBytesLength >> 24) & 0xff;
        bytes[6] = (freeBytesLength >> 16) & 0xff;
        bytes[7] = (freeBytesLength >> 8) & 0xff;
        bytes[8] = freeBytesLength & 0xff;

        return { bytes, references };
    }

    // DEPRECATED, now uses linked list to link next/prev leafs
    // This was very useful to determine if tree structure was ok
    // next() {
    //     // Walk the tree to find out what leaf is next. Enables index scanning
    //     let searchNode = this;
    //     console.log(this.toString());
    //     while(searchNode.parent) {
    //         let index = searchNode.parent.entries.findIndex(entry => entry.ltChild === searchNode);
    //         let lastIndex = searchNode.parent.entries.length - 1;
    //         let next;
    //         if (index < 0) {
    //             console.assert(searchNode.parent.gtChild === searchNode);
    //             // We need to go further up
    //             searchNode = searchNode.parent;
    //             continue;
    //         }
    //         else if (index === lastIndex) {
    //             next = searchNode.parent.gtChild;
    //             if (next instanceof BPlusTreeNode) {
    //                 next = next.entries[0];
    //             }
    //         }
    //         else {
    //             next = searchNode.parent.entries[index + 1];
    //         }

    //         while (next.ltChild) {
    //             next = next.ltChild;
    //         }
    //         return next;
    //     } 
    //     return null;
    // }
}

class BPlusTree {
    /**
     * 
     * @param {number} maxEntriesPerNode max number of entries per tree node. Working with this instead of m for max number of children, because that makes less sense imho
     * @param {boolean} uniqueKeys whether the keys added must be unique
     */
    constructor(maxEntriesPerNode, uniqueKeys) {
        this.maxEntriesPerNode = maxEntriesPerNode;
        this.uniqueKeys = uniqueKeys;
        this.root = new BPlusTreeLeaf(this);
        this.depth = 1;
    }

    // checkTree() {
    //     /**
    //      * 
    //      * @param {BPlusTreeNode} node 
    //      */
    //     const checkNode = (node) => {
    //         if (node.parent) {
    //             const index = node.parent.entries.findIndex(entry => entry.ltChild === node);
    //             if (index < 0) {
    //                 console.assert(node.parent.gtChild === node, `Node "${node.toString()}" must be referred to by parent "${node.parent.toString()}"`);
    //             }
    //         }
    //         if (node instanceof BPlusTreeNode) {
    //             node.entries.forEach(entry => {
    //                 checkNode(entry.ltChild);
    //             });
    //             checkNode(node.gtChild);
    //         }
    //     };
    //     checkNode(this.root);
    // }

    /**
     * Adds a key to the tree
     * @param {string|number|boolean|Date|undefined} key 
     * @param {ArrayBuffer|Array} value data to store with the key, max size is 255
     * @returns {BPlusTree} returns reference to this tree
     */
    add(key, value) {
        // Find the leaf to insert to
        let leaf;
        if (this.root instanceof BPlusTreeLeaf) {
            // Root is leaf node (total entries <= maxEntriesPerNode)
            leaf = this.root;
        }
        else {
            // Navigate to the right leaf to add to
            leaf = this.findLeaf(key, true);
        }
        leaf.add(key, value);
        return this;
    }

    // TODO: Enable bulk adding of keys: throw away all nodes, append/insert all keys ordered. Uupon commit, cut all data into leafs, construct the nodes up onto the root
    // addBulk(arr, commit = false) {
    //     // Adds given items in bulk and reconstructs the tree
    //     let leaf = this.firstLeaf();
    //     while(leaf) {
    //         leaf = leaf.getNext()
    //     }
    // }

    /**
     * Finds the relevant leaf for a key
     * @param {string|number|boolean|Date|undefined} key 
     * @returns {BPlusTreeLeaf} returns the leaf the key is in, or would be in when present
     */
    findLeaf(key) {
        /**
         * 
         * @param {BPlusTreeNode} node 
         * @returns {BPlusTreeLeaf}
         */
        const findLeaf = (node) => { 
            for (let i = 0; i < node.entries.length; i++) {
                let entry = node.entries[i];
                if (key < entry.key) {
                    node = entry.ltChild;
                    if (!node) {
                        return null;
                    }
                    if (node instanceof BPlusTreeLeaf) {
                        return node;
                    }
                    else {
                        return findLeaf(node);
                    }
                }
            }
            // Still here? key must be >= last entry
            console.assert(key >= node.entries[node.entries.length-1].key)
            if (node.gtChild instanceof BPlusTreeLeaf) {
                return node.gtChild;
            } 
            return findLeaf(node.gtChild);
        };
        return findLeaf(this.root);   
    }

    find(key) {
        const leaf = this.findLeaf(key);
        const entry = leaf.entries.find(entry => entry.key === key);
        if (!entry) { return null; }
        if (this.uniqueKeys) {
            return entry.values[0];
        }
        else {
            return entry.values;
        }
    }

    search(op, val) {
        if (["in","!in","between","!between"].indexOf(op) >= 0) {
            // val must be an array
            console.assert(val instanceof Array, `val must be an array when using operator ${op}`);
        }
        let results = [];
        const add = (entry) => {
            let obj = { key: entry.key };
            if (this.uniqueValues) {
                obj.value = entry.values[0];
            }
            else {
                obj.values = entry.values;
            }
            results.push(obj);
        };
        if (["<","<="].indexOf(op) >= 0) {
            let leaf = this.findLeaf(val);
            while(leaf) {
                for (let i = leaf.entries.length-1; i >= 0; i--) {
                    const entry = leaf.entries[i];
                    if (op === "<=" && entry.key <= val) { add(entry); }
                    else if (op === "<" && entry.key < val) { add(entry); }
                }
                leaf = leaf.prevLeaf;
            }
        }
        else if ([">",">="].indexOf(op) >= 0) {
            let leaf = this.findLeaf(val);
            while(leaf) {
                for (let i = 0; i < leaf.entries.length; i++) {
                    const entry = leaf.entries[i];
                    if (op === ">=" && entry.key >= val) { add(entry); }
                    else if (op === ">" && entry.key > val) { add(entry); }
                }
                leaf = leaf.nextLeaf;
            }
        }
        else if (op === "==") {
            let leaf = this.findLeaf(val);
            let entry = leaf.entries.find(entry => entry.key === val);
            if (entry) {
                add(entry);
            }
        }
        else if (op === "!=") {
            // Full index scan needed
            let leaf = this.firstLeaf();
            while(leaf) {
                for (let i = 0; i < leaf.entries.length; i++) {
                    const entry = leaf.entries[i];
                    if (entry.key !== val) { add(entry); }
                }
                leaf = leaf.nextLeaf;
            }
        }
        else if (op === "in") {
            let sorted = val.slice().sort();
            let searchKey = sorted.shift();
            let leaf; // = this.findLeaf(searchKey);
            let trySameLeaf = false;
            while (searchKey) {
                if (!trySameLeaf) {
                    leaf = this.findLeaf(searchKey);
                }
                let entry = leaf.entries.find(entry => entry.key === searchKey);
                if (!entry && trySameLeaf) {
                    trySameLeaf = false;
                    continue;
                }
                if (entry) { add(entry); }
                searchKey = sorted.shift();
                trySameLeaf = true;
            }
        }
        else if (op === "!in") {
            // Full index scan needed
            let keys = val;
            let leaf = this.firstLeaf();
            while(leaf) {
                for (let i = 0; i < leaf.entries.length; i++) {
                    const entry = leaf.entries[i];
                    if (keys.indexOf(entry.key) < 0) { add(entry); }
                }
                leaf = leaf.nextLeaf;
            }
        }
        else if (op === "between") {
            let bottom = val[0], top = val[1];
            if (top < bottom) {
                let swap = top;
                top = bottom;
                bottom = swap;
            }
            let leaf = this.findLeaf(bottom);
            let stop = false;
            while(!stop && leaf) {
                for (let i = 0; i < leaf.entries.length; i++) {
                    const entry = leaf.entries[i];
                    if (entry.key >= bottom && entry.key <= top) { add(entry); }
                    if (entry.key > top) { stop = true; break; }
                }
                leaf = leaf.nextLeaf;
            }
        }
        else if (op === "!between") {
            // Equal to key < bottom || key > top
            let bottom = val[0], top = val[1];
            if (top < bottom) {
                let swap = top;
                top = bottom;
                bottom = swap;
            }
            // Add lower range first, lowest value < val < bottom
            let leaf = this.firstLeaf();
            let stop = false;
            while (leaf && !stop) {
                for (let i = 0; i < leaf.entries.length; i++) {
                    const entry = leaf.entries[i];
                    if (entry.key < bottom) { add(entry); }
                    else { stop = true; break; }
                }
                leaf = leaf.nextLeaf;
            }
            // Now add upper range, top < val < highest value
            leaf = this.findLeaf(top);
            while (leaf) {
                for (let i = 0; i < leaf.entries.length; i++) {
                    const entry = leaf.entries[i];
                    if (entry.key > top) { add(entry); }
                }
                leaf = leaf.nextLeaf;
            }            
        }
        return results;
    }

    /**
     * @returns {BPlusTreeLeaf} the first leaf in the tree
     */
    firstLeaf() {
        // Get the very first leaf
        let node = this.root;
        while (!(node instanceof BPlusTreeLeaf)) {
            node = node.entries[0].ltChild;
        }
        return node;
    }

    /**
     * @returns {BPlusTreeLeaf} the last leaf in the tree
     */
    lastLeaf() {
        // Get the very last leaf
        let node = this.root;
        while (!(node instanceof BPlusTreeLeaf)) {
            node = node.gtChild;
        }        
    }

    all() {
        // Get the very first leaf
        let leaf = this.firstLeaf();
        // Now iterate through all the leafs
        const all = [];
        while (leaf) {
            all.push(...leaf.entries.map(entry => entry.key));
            leaf = leaf.nextLeaf; //leaf.next();
        }
        return all;
    }

    reverseAll() {
        // Get the very last leaf
        let leaf = this.lastLeaf();
        // Now iterate through all the leafs (backwards)
        const all = [];
        while (leaf) {
            all.push(...leaf.entries.map(entry => entry.key));
            leaf = leaf.prevLeaf;
        }
        return all;
    }

    static get debugBinary() { return false; }
    static addBinaryDebugString(str, byte) {
        if (this.debugBinary) {
            return [str, byte];
        }
        else {
            return byte;
        }
    }
    static getKeyFromBinary(bytes, index) {
        // key_type:
        let keyType = bytes[index];
        index++;

        // key_length:
        let keyLength = bytes[index];
        index++;

        // key_data:
        let keyData = bytes.slice(index, index + keyLength); // [];
        index += keyLength;

        let key;
        switch(keyType) {
            case KEY_TYPE.UNDEFINED: {
                // no need to do this: key = undefined;
                break;
            }
            case KEY_TYPE.STRING: {
                key = keyData.reduce((k, code) => k + String.fromCharCode(code), "");
                break;
            }
            case KEY_TYPE.NUMBER: {
                if (keyData.length < 8) {
                    // Append trailing 0's
                    keyData.push(...[0,0,0,0,0,0,0,0].slice(keyData.length));
                }
                key = bytesToNumber(keyData);
                break;
            }
            case KEY_TYPE.BOOLEAN: {
                key = keyData[0] === 1;
                break;
            }
            case KEY_TYPE.DATE: {
                key = new Date(bytesToNumber(keyData));
                break;
            }
        }
        return { key, length: keyLength };
    }
    static getBinaryKeyData(key) {
        let keyBytes = [];
        let keyType = KEY_TYPE.UNDEFINED;
        switch(typeof key) {
            case "undefined": {
                keyType = KEY_TYPE.UNDEFINED;
                break;
            }                
            case "string": {
                keyType = KEY_TYPE.STRING;
                for (let i = 0; i < key.length; i++) {
                    keyBytes.push(key.charCodeAt(i));
                }
                break;
            }
            case "number": {
                keyType = KEY_TYPE.NUMBER;
                keyBytes = numberToBytes(key);
                // Remove trailing 0's to reduce size for smaller and integer values
                while (keyBytes[keyBytes.length-1] === 0) { keyBytes.pop(); }
                break;
            }
            case "boolean": {
                keyType = KEY_TYPE.BOOLEAN;
                keyBytes = [key ? 1 : 0];
                break;
            }
            case "object": {
                if (key instanceof Date) {
                    keyType = KEY_TYPE.DATE;
                    keyBytes = numberToBytes(key.getTime());
                }
                else {
                    throw new Error(`Unsupported key type`);
                }
                break;
            }
            default: {
                throw new Error(`Unsupported key type: ${typeof key}`);
            }
        }

        const bytes = [];

        // key_type:
        bytes.push(keyType);

        // key_length:
        bytes.push(keyBytes.length);

        // key_data:
        bytes.push(...keyBytes);

        return bytes;
    }

    toBinary(keepFreeSpace = false) {
        // Return binary data
        let { bytes, references, pointers } = this.root.toBinary(keepFreeSpace);

        //BPlusTreeNode.resolveBinaryReferences(bytes, references, pointers);
        console.assert(references.length === 0, "All references must be resolved now");

        // Add header
        let header = [
            // index_length:
            BPlusTree.addBinaryDebugString("index_length", (bytes.length >> 24) & 0xff),
            (bytes.length >> 16) & 0xff,
            (bytes.length >> 8) & 0xff,
            bytes.length & 0xff,
            // index_type:
            BPlusTree.addBinaryDebugString("index_type", this.uniqueKeys ? 1 : 0),
            // max_node_entries:
            this.maxEntriesPerNode
        ];
        bytes.unshift(...header);
        return bytes;
    }
}

class BPlusTreeBuilder {
    /**
     * @param {boolean} uniqueKeys 
     */
    constructor(uniqueKeys, fillFactor = 100) {
        this.uniqueKeys = uniqueKeys;
        this.fillFactor = fillFactor;
        this.list = new Map(); // {};
    }
    add(key, value) {
        const existing = this.list.get(key); // [key];
        if (this.uniqueKeys && typeof existing !== 'undefined') {
            throw `Cannot add duplicate key "${key}", tree must have unique keys`;
        }
        else if (existing) {
            existing.push(value);
        }
        else {
            this.list.set(key, this.uniqueKeys //[key] =
                ? value
                : [value]);
        }
    }
    remove(key, value = undefined) {
        const isEqual = (val1, val2) => {
            if (val1 instanceof Array && val2 instanceof Array) {
                return val1.every((v,i) => val2[i] === v);
            }
            return val1 === val2;
        };
        const item = this.list.get(key); //[key]
        if (typeof key === 'undefined') { return; }
        if (this.uniqueKeys) {
            this.list.delete(key); //delete this.list[key];
        }
        else {
            const valIndex = item.findIndex(val => isEqual(val, value));
            if (~valIndex) {
                if (item.length === 1) {
                    this.list.delete(key); //delete this.list[key];
                }
                else {
                    item.splice(valIndex, 1);
                }
            }
        }
    }
    create() {
        // Create a tree bottom-up with all nodes filled to the max

        // Example tree: 3 entries per node
        //                                      [10	x	x	>=]
        //                      [4	7	10	x]				[13 16	x	>=]
        // [1	2	3] |    [4	5	6]  |	[7	8	9]  |   [10	11	12] |   [13	14	15] |   [16	17]

        // const list = Object.keys(this.list).map(key => {
        //     return { key, val: this.list[key] };
        // })
        // .sort((a,b) => {
        //     if (a.key < b.key) { return -1; }
        //     return 1;
        // }); // .sort is probably not needed?

        let list = [];
        this.list.forEach((val, key) => {
            list.push({ key, val });
        });
        this.list.clear();
        this.list = null; // Make unusable!
        list.sort((a,b) => {
            if (a.key < b.key) { return -1; }
            return 1;
        });

        //const length = Object.keys(this.list).length;
        const minNodeSize = 3; //25;
        const maxNodeSize = 255;
        const entriesPerNode = Math.min(maxNodeSize, Math.max(minNodeSize, Math.ceil(list.length / 10)));
        const entriesPerLeaf = Math.max(minNodeSize, Math.floor(entriesPerNode * (this.fillFactor / 100)));
        const minParentEntries = Math.max(1, Math.floor(entriesPerNode / 2));
        const tree = new BPlusTree(entriesPerNode, this.uniqueKeys);

        const nrOfLeafs = Math.max(1, Math.ceil(list.length / entriesPerLeaf));
        const parentConnections = entriesPerNode+1;  // should be +1 because the > connection
        let currentLevel = 1;
        let nrOfNodesAtLevel = nrOfLeafs;
        let nrOfParentNodes = Math.ceil(nrOfNodesAtLevel / parentConnections);
        let nodesAtLevel = [];
        while (true) {
            // Create parent nodes
            const creatingLeafs = currentLevel === 1;
            const parentNodes = [];
            for (let i = 0; i < nrOfParentNodes; i++) {
                const node = new BPlusTreeNode(tree, null);
                if (i > 0) { 
                    const prevNode = parentNodes[i-1];
                    node.prevNode = prevNode;
                    prevNode.nextNode = node;
                }
                parentNodes.push(node);
            }

            for (let i = 0; i < nrOfNodesAtLevel; i++) {
                // Eg 500 leafs with 25 entries each, 500/25 = 20 parent nodes:
                // When i is between 0 and (25-1), parent node index = 0
                // When i is between 25 and (50-1), parent index = 1 etc
                // So, parentIndex = Math.floor(i / 25)
                const parentIndex = Math.floor(i / parentConnections); 
                const parent = parentNodes[parentIndex];

                if (creatingLeafs) {
                    // Create leaf
                    const leaf = new BPlusTreeLeaf(parent);
                    nodesAtLevel.push(leaf);

                    // Setup linked list properties
                    const prevLeaf = nodesAtLevel[nodesAtLevel.length-2];
                    if (prevLeaf) {
                        leaf.prevLeaf = prevLeaf;
                        prevLeaf.nextLeaf = leaf;
                    }

                    // Create leaf entries
                    const fromIndex = i * entriesPerLeaf;
                    const entryKVPs = list.slice(fromIndex, fromIndex + entriesPerLeaf);
                    entryKVPs.forEach(kvp => {
                        const entry = new BPlusTreeLeafEntry(leaf, kvp.key);
                        entry.values = this.uniqueKeys ? [kvp.val] : kvp.val;
                        leaf.entries.push(entry);
                    });
                    
                    const isLastLeaf = Math.floor((i+1) / parentConnections) > parentIndex 
                        || i === nrOfNodesAtLevel-1;
                    if (isLastLeaf) {
                        // Have parent's gtChild point to this last leaf
                        parent.gtChild = leaf;

                        if (parentNodes.length > 1 && parent.entries.length < minParentEntries) {
                            /* Consider this order 4 B+Tree: 3 entries per node, 4 connections

                                                    12  >
                                            4  7  10 >	  ||	>
                                1  2  3 || 4  5  6 || 7  8  9 || 10  11  12 || 13 14 15

                                The last leaf (13 14 15) is the only child of its parent, its assignment to
                                parent.gtChild is right, but there is no entry to > compare to. In this case, we have to
                                move the previous leaf's parent entry to our own parent:

                                                    10  >
                                            4  7  >	   ||	13  >
                                1  2  3 || 4  5  6 || 7  8  9 || 10  11  12 || 13 14 15

                                We moved just 1 parent entry which is fine in case of an order 4 tree, floor((O-1) / 2) is the 
                                minimum entries for a node, floor((4-1) / 2) = floor(1.5) = 1.
                                When the tree order is higher, it's effect on higher tree nodes becomes greater and the tree 
                                becomes inbalanced if we do not meet the minimum entries p/node requirement. 
                                So, we'll have to move Math.floor(entriesPerNode / 2) parent entries to our parent
                            */
                            const nrOfParentEntries2Move = minParentEntries - parent.entries.length;
                            const prevParent = parent.prevNode;
                            for (let j = 0; j < nrOfParentEntries2Move; j++) {
                                const firstChild = parent.entries.length === 0 
                                    ? leaf                                      // In first iteration, firstLeaf === leaf === "13 14 15"
                                    : parent.entries[0].ltChild;                // In following iterations, firstLeaf === last moved leaf "10 11 12"
                                //const prevChild = firstChild.prevChild;
                                const moveEntry = prevParent.entries.pop();     // removes "10" from prevLeaf's parent
                                const moveLeaf = prevParent.gtChild;
                                prevParent.gtChild = moveEntry.ltChild;         // assigns "7 8 9" leaf to prevLeaf's parent > connection
                                moveEntry.key = firstChild.entries[0].key;      // changes the key to "13"
                                moveLeaf.parent = parent;                       // changes moving "10 11 12" leaf's parent to ours
                                moveEntry.ltChild = moveLeaf;                   // assigns "10 11 12" leaf to <13 connection
                                parent.entries.unshift(moveEntry);              // inserts "13" entry into our parent node
                                moveEntry.node = parent;                      // changes moving entry's parent to ours
                            }
                            //console.log(`Moved ${nrOfParentEntries2Move} parent node entries`);
                        }
                    }
                    else {
                        // Create parent entry with ltChild that points to this leaf
                        const ltChildKey = list[fromIndex + entriesPerLeaf].key;
                        const parentEntry = new BPlusTreeNodeEntry(parent, ltChildKey);
                        parentEntry.ltChild = leaf;
                        parent.entries.push(parentEntry);
                    }
                }
                else {
                    // Nodes have already been created at the previous iteration,
                    // we have to create entries for parent nodes only
                    const node = nodesAtLevel[i];
                    node.parent = parent;

                    // // Setup linked list properties - not needed by BPlusTreeNode itself, but used in code below
                    // const prevNode = nodesAtLevel[nodesAtLevel.length-2];
                    // if (prevNode) {
                    //     node.prevNode = prevNode;
                    //     prevNode.nextNode = node;
                    // }

                    const isLastNode = Math.floor((i+1) / parentConnections) > parentIndex
                        || i === nrOfNodesAtLevel-1;
                    if (isLastNode) {
                        parent.gtChild = node;

                        if (parentNodes.length > 1 && parent.entries.length < minParentEntries) {
                            // This is not right, we have to fix it.
                            // See leaf code above for additional info
                            const nrOfParentEntries2Move = minParentEntries - parent.entries.length;
                            const prevParent = parent.prevNode;
                            for (let j = 0; j < nrOfParentEntries2Move; j++) {
                                const firstChild = parent.entries.length === 0 
                                    ? node
                                    : parent.entries[0].ltChild;
                                
                                const moveEntry = prevParent.entries.pop();
                                const moveNode = prevParent.gtChild;
                                prevParent.gtChild = moveEntry.ltChild;
                                let ltChild = firstChild.entries[0];
                                while (!(ltChild instanceof BPlusTreeLeaf)) {
                                    ltChild = ltChild.entries[0].ltChild;
                                }
                                moveEntry.key = ltChild.key; //firstChild.entries[0].key;
                                moveNode.parent = parent;
                                moveEntry.ltChild = moveNode;
                                parent.entries.unshift(moveEntry);
                                moveEntry.node = parent;
                            }
                            //console.log(`Moved ${nrOfParentEntries2Move} parent node entries`);
                        }
                    }
                    else {
                        let ltChild = node.nextNode;
                        while (!(ltChild instanceof BPlusTreeLeaf)) {
                            ltChild = ltChild.entries[0].ltChild;
                        }
                        const ltChildKey = ltChild.entries[0].key; //node.gtChild.entries[node.gtChild.entries.length-1].key; //nodesAtLevel[i+1].entries[0].key;
                        const parentEntry = new BPlusTreeNodeEntry(parent, ltChildKey);
                        parentEntry.ltChild = node;
                        parent.entries.push(parentEntry);
                    }
                }
            }

            if (nrOfLeafs === 1) {
                // Very little data. Only 1 leaf
                let leaf = nodesAtLevel[0];
                leaf.parent = tree;
                tree.root = leaf;
                break;
            }
            else if (nrOfParentNodes === 1) {
                // Done
                tree.root = parentNodes[0];
                break;
            }
            currentLevel++; // Level up
            nodesAtLevel = parentNodes;
            nrOfNodesAtLevel = nodesAtLevel.length;
            nrOfParentNodes = Math.ceil(nrOfNodesAtLevel / parentConnections);
            tree.depth++;
        }

        // if (true) {
        //     // TEST the tree!
        //     const ok = list.every(item => {
        //         const val = tree.find(item.key);
        //         if (val === null) {
        //             return false;
        //         }
        //         return true;
        //         //return  !== null;
        //     })
        //     if (!ok) {
        //         throw new Error(`This tree is not ok`);
        //     }
        // }

        return tree;
    }
}

// TODO: Refactor to typed arrays
class ChunkReader {
    constructor(chunkSize, readFn) {
        this.chunkSize = chunkSize;
        this.read = readFn;
        this.data = null;
        this.offset = 0;    // offset of loaded data (start index of current chunk in data source)
        this.index = 0;     // current chunk reading index ("cursor" in currently loaded chunk)
    }
    init() {
        return this.read(0, this.chunkSize)
        .then(chunk => {
            this.data = chunk;
            this.offset = 0;
            this.index = 0;
        });
    }
    get(byteCount) {
        return this.assert(byteCount)
        .then(() => {
            const bytes = this.data.slice(this.index, this.index + byteCount);
            this.index += byteCount;
            return bytes;
        });
    }
    more(chunks = 1) {
        return this.read(this.offset + this.data.length, chunks * this.chunkSize)
        .then(nextChunk => {
            //this.data.push(...nextChunk);
            //nextChunk.forEach(byte => this.data.push(byte));
            this.data = this.data.concat(Array.from(nextChunk));
        });
    }
    seek(offset) {
        if (this.index + offset < this.data.length) {
            this.index += offset;
            return Promise.resolve();
        }
        let dataIndex = this.offset + this.index + offset;
        return this.read(dataIndex, this.chunkSize)
        .then(newChunk => {
            this.data = newChunk;
            this.offset = dataIndex;
            this.index = 0;
        });        
    }
    assert(byteCount) {
        if (this.index + byteCount > this.data.length) {
            return this.more(Math.ceil(byteCount / this.chunkSize));
        }
        else {
            return Promise.resolve();
        }        
    }
    skip(byteCount) {
        this.index += byteCount;
    }
    rewind(byteCount) {
        this.index -= byteCount;
    }
    go(index) {
        if (this.offset <= index && this.offset + this.data.length > index) {
            this.index = index - this.offset;
            return Promise.resolve();
        }
        return this.read(index, this.chunkSize)
        .then(chunk => {
            this.data = chunk;
            this.offset = index;
            this.index = 0;
        });
    }
    savePosition(offsetCorrection = 0) {
        let savedIndex = this.offset + this.index + offsetCorrection;
        let go = (offset = 0) => {
            let index = savedIndex + offset;
            return this.go(index);
        }
        return {
            go,
            index: savedIndex
        };
    }
    get sourceIndex() {
        return this.offset + this.index;
    }
}

class BinaryBPlusTree {
    /**
     * Provides functionality to read and search in a B+tree from a binary data source
     * @param {Array|(index: number, length: number) => Promise<Array>} readFn byte array, or function that reads from your data source, must return a promise that resolves with a byte array (the bytes read from file/memory)
     * @param {number} chunkSize numbers of bytes per chunk to read at once
     * @param {(data: number[], index: number) => Promise<any>} writeFn function that writes to your data source, must return a promise that resolves once write has completed
     */
    constructor(readFn, chunkSize = 1024, writeFn = undefined) {
        this._chunkSize = chunkSize;
        if (readFn instanceof Array) {
            let data = readFn;
            if (BPlusTree.debugBinary) {
                this.debugData = data;
                data = data.map(entry => entry instanceof Array ? entry[1] : entry);
            }
            this._readFn = (i, length) => {
                let slice = data.slice(i, i + length);
                return Promise.resolve(slice);
            };
        }
        else if (typeof readFn === "function") {
            this._readFn = readFn;
        }
        else {
            throw new TypeError(`readFn must be a byte array or function that reads from a data source`);
        }

        if (typeof writeFn === "function") {
            this._writeFn = writeFn;
        }
        else if (typeof writeFn === "undefined" && readFn instanceof Array) {
            const sourceData = readFn;
            this._writeFn = (data, index) => {
                for (let i = 0; i < data.length; i++) {
                    sourceData[index + i] = data[i];
                }
                return Promise.resolve();
            }
        }        
        else {
            this._writeFn = () => {
                throw new Error(`Cannot write data, no writeFn was supplied`);
            }
        }
    }

    _getReader() {
        const reader = new ChunkReader(this._chunkSize, this._readFn);        
        return reader.init()
        .then(() => {
            return reader.get(6);
        })
        .then(header => {
            this.info = {
                byteLength: (header[0] << 24) | (header[1] << 16) | (header[2] << 8) | header[3],
                isUnique: (header[4] & 0x1) === 1,
                entriesPerNode: header[5]
            };
            return reader;
        });
    }

    /**
     * 
     * @param {ChunkReader} reader 
     * @returns {Promise<BinaryBPlusTreeNodeInfo>}
     */
    _readChild(reader) {
        const index = reader.sourceIndex; //reader.savePosition().index;
        const headerLength = 9;
        return reader.get(headerLength) // byte_length, is_leaf, free_byte_length
        .then(bytes => {
            const byteLength = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]; // byte_length
            const isLeaf = bytes[4] === 1; // is_leaf
            const freeBytesLength = (bytes[5] << 24) | (bytes[6] << 16) | (bytes[7] << 8) | bytes[8];

            // load whole node/leaf for easy processing
            return reader.get(byteLength - headerLength) // todo: - freeBytesLength, right?
            .then(bytes => {
                const childInfo = new BinaryBPlusTreeNodeInfo({
                    isLeaf,
                    bytes,
                    index,
                    length: byteLength,
                    free: freeBytesLength
                });
                return childInfo;
            });
        });
    }

    /**
     * 
     * @param {BinaryBPlusTreeNodeInfo} leaf 
     * @param {ChunkReader} reader 
     * @returns {BinaryBPlusTreeLeaf}
     */
    _getLeaf(leafInfo, reader) {
        const leaf = new BinaryBPlusTreeLeaf(leafInfo);
        const bytes = leaf.bytes;
        const savedPosition = reader.savePosition(-bytes.length);
        const getSignedOffset = (bytes, index) => {
            let offset = ((bytes[index] & 0x7f) << 24) | (bytes[index+1] << 16) | (bytes[index+2] << 8)  | bytes[index+3];
            let isNegative = (bytes[index] & 0x80) > 0;
            if (isNegative) { offset = -offset; }
            return offset;
        };

        const prevLeafOffset = getSignedOffset(bytes, 0); // prev_leaf_ptr
        const nextLeafOffset = getSignedOffset(bytes, 4); // next_leaf_ptr
        leaf.prevLeafOffset = prevLeafOffset;
        leaf.nextLeafOffset = nextLeafOffset;

        let entriesLength = bytes[8]; // entries_length

        let index = 9;

        const readValue = () => {
            let valueLength = bytes[index];
            index++;
            let value = [];
            for (let j = 0; j < valueLength; j++) {
                value[j] = bytes[index + j];
            }
            index += valueLength;
            return value;
        };

        for (let i = 0; i < entriesLength; i++) {
            let keyInfo = BPlusTree.getKeyFromBinary(bytes, index);
            let key = keyInfo.key;
            index += keyInfo.length + 2;

            // Read value(s) and return
            index += 4; // Skip val_length, we will read all values
            if (this.info.isUnique) {
                // Read single value
                const value = readValue();
                leaf.entries.push(new BinaryBPlusTreeLeafEntry(key, [value]));
            }
            else {
                // Read value_list_length
                const valuesLength = (bytes[index] << 24) | (bytes[index+1] << 16) | (bytes[index+2] << 8) | bytes[index+3]; // value_list_length
                index += 4;
                const values = [];
                for(let i = 0; i < valuesLength; i++) {
                    const value = readValue();
                    values.push(value);
                }
                leaf.entries.push(new BinaryBPlusTreeLeafEntry(key, values));
            }
        }

        if (prevLeafOffset !== 0) {
            leaf.getPrevious = () => {
                return savedPosition.go(prevLeafOffset)
                .then(() => {
                    return this._readChild(reader)
                    .then(childInfo => {
                        console.assert(childInfo.isLeaf, `If this is not the case, debug me`);
                        return this._getLeaf(childInfo, reader);
                    });
                });
            };
        }
        if (nextLeafOffset !== 0) {
            leaf.getNext = () => {
                return savedPosition.go(nextLeafOffset + 4) // +4 because next_leaf_ptr is 4 bytes from savedPosition
                .then(() => {
                    return this._readChild(reader)
                    .then(childInfo => {
                        console.assert(childInfo.isLeaf, `If this is not the case, debug me`);
                        return this._getLeaf(childInfo, reader);
                    });                    
                });
            };
        }
        return leaf;
    }

    /**
     * 
     * @param {BinaryBPlusTreeLeaf} leafInfo 
     * @returns {Promise<void>}
     */
    _writeLeaf(leafInfo) {

        const tree = new BPlusTree(this.info.entriesPerNode, this.info.isUnique);
        const leaf = new BPlusTreeLeaf(tree);
        leafInfo.entries.forEach(entry => {
            const key = entry.key;
            const leafEntry = new BPlusTreeLeafEntry(leaf, key);
            leafEntry.values = entry.values;
            leaf.entries.push(leafEntry);
        });
        const { bytes } = leaf.toBinary(false); // Let us add the free space ourselves

        // Add free space
        const freeBytesLength = leafInfo.length - bytes.length;
        if (freeBytesLength < 0) {
            throw new Error(`Cannot write leaf: its data became too big to store in available space`);
        }
        for (let i = 0; i < freeBytesLength; i++) {
            bytes.push(0);
        }
        
        // update byte_length:
        bytes[0] = (bytes.length >> 24) & 0xff;
        bytes[1] = (bytes.length >> 16) & 0xff;
        bytes[2] = (bytes.length >> 8) & 0xff;
        bytes[3] = bytes.length & 0xff;

        // update free_byte_length
        bytes[5] = (freeBytesLength >> 24) & 0xff;
        bytes[6] = (freeBytesLength >> 16) & 0xff;
        bytes[7] = (freeBytesLength >> 8) & 0xff;
        bytes[8] = freeBytesLength & 0xff;

        // set pointers to prev/next leafs manually (they stay the same as before)
        const maxSignedNumber = Math.pow(2, 31) - 1;
        const writeSignedOffset = (index, offset, debugName) => {
            const negative = offset < 0;
            if (negative) { offset = -offset; }
            if (offset > maxSignedNumber) {
                throw new Error(`reference offset to big to store in 31 bits`);
            }
            bytes[index] = ((offset >> 24) & 0x7f) | (negative ? 0x80 : 0);
            // if (debugName) {
            //     data[index] = [debugName, data[index]];
            // }
            bytes[index+1] = (offset >> 16) & 0xff;
            bytes[index+2] = (offset >> 8) & 0xff;
            bytes[index+3] = offset & 0xff;
        };

        // update prev_leaf_ptr:
        writeSignedOffset(9, leafInfo.prevLeafOffset);

        // update next_leaf_ptr:
        writeSignedOffset(13, leafInfo.nextLeafOffset);

        return this._writeFn(bytes, leafInfo.index);
    }

    /**
     * 
     * @param {BinaryBPlusTreeNodeInfo} nodeInfo 
     * @param {ChunkReader} reader 
     * @returns {Promise<BinaryBPlusTreeNode>}
     */
    _getNode(nodeInfo, reader) {
        // const node = { 
        //     entries: [] 
        // };
        const node = new BinaryBPlusTreeNode(nodeInfo);
        const bytes = node.bytes;
        const entriesLength = bytes[0];
        let index = 1;

        for (let i = 0; i < entriesLength; i++) {
            let keyInfo = BPlusTree.getKeyFromBinary(bytes, index);
            let key = keyInfo.key;
            index += keyInfo.length + 2;
            let entry = new BinaryBPlusTreeNodeEntry(key);
            node.entries.push(entry);

            // read lt_child_ptr:
            let ltChildOffset = (bytes[index] << 24) | (bytes[index+1] << 16) | (bytes[index+2] << 8) | bytes[index+3]; // lt_child_ptr
            if (ltChildOffset > 0) {
                const savedPosition = reader.savePosition(-bytes.length + index + 3); // +3 because offset is from first byte
                entry.getLtChild = () => {
                    return savedPosition.go(ltChildOffset)
                    .then(() => {
                        return this._readChild(reader);
                    });
                };
                // reader.rewind(bytes.length - index); // correct reader's index
                // return reader.seek(offset + 3).then(() => {
                //     return readChild();
                // });
            }
            index += 4;
        }
        // read gt_child_ptr:
        let gtChildOffset = (bytes[index] << 24) | (bytes[index+1] << 16) | (bytes[index+2] << 8) | bytes[index+3]; // gt_child_ptr
        if (gtChildOffset > 0) {
            const savedPosition = reader.savePosition(-bytes.length + index + 3); // +3 because offset is from first byte
            node.getGtChild = () => {
                return savedPosition.go(gtChildOffset)
                .then(() => {
                    return this._readChild(reader);
                });
            };
            // reader.rewind(bytes.length - index); // correct reader's index
            // return reader.seek(gtNodeOffset + 3).then(() => {
            //     return readChild();
            // });
        }
        return node;
    }

    getFirstLeaf() {
        let reader;
        const processChild = (childInfo) => {
            if (childInfo.isLeaf) {
                return this._getLeaf(childInfo, reader);
            }
            else {
                const node = this._getNode(childInfo, reader);
                return node.entries[0].getLtChild()
                .then(processChild);
            }
        };
        return this._getReader()
        .then(r => {
            reader = r;
            return this._readChild(reader);
        })
        .then(processChild);
    }

    getLastLeaf() {
        let reader;
        /**
         * 
         * @param {BinaryBPlusTreeNodeInfo} childInfo 
         */
        const processChild = (childInfo) => {
            if (childInfo.isLeaf) {
                return this._getLeaf(childInfo, reader);
            }
            else {
                return this._getNode(childInfo, reader)
                .then(node => {
                    return node.getGtChild();
                })
                .then(processChild);
            }
        };
        return this._getReader()
        .then(r => {
            reader = r;
            return this._readChild(reader);
        })
        .then(processChild);
    }

    /**
     * 
     * @param {string|boolean|number|Date} searchKey 
     * @returns {Promise<BinaryBPlusTreeLeaf>}
     */
    findLeaf(searchKey) {
        // navigate to the right child
        let reader;
        const readChild = () => {
            return this._readChild(reader)
            .then(childInfo => {
                if (childInfo.isLeaf) {
                    return this._getLeaf(childInfo, reader);
                }
                else {
                    return readNode(childInfo);
                }
            });
        };

        const readNode = (childInfo) => {
            const bytes = childInfo.bytes;
            let entries = bytes[0];
            let index = 1;

            for (let i = 0; i < entries; i++) {
                let keyInfo = BPlusTree.getKeyFromBinary(bytes, index);
                let key = keyInfo.key;
                index += keyInfo.length + 2;

                if (searchKey < key) {
                    // Check lesser child node
                    let offset = (bytes[index] << 24) | (bytes[index+1] << 16) | (bytes[index+2] << 8) | bytes[index+3]; // lt_child_ptr
                    if (offset > 0) {
                        reader.rewind(bytes.length - index); // correct reader's index
                        return reader.seek(offset + 3).then(() => {
                            return readChild();
                        });
                    }
                    else {
                        return null;
                    }
                }
                else {
                    // Increase index to point to next entry
                    index += 4; // skip lt_child_ptr
                }
            }
            // Still here? key > last entry in node
            let gtNodeOffset = (bytes[index] << 24) | (bytes[index+1] << 16) | (bytes[index+2] << 8) | bytes[index+3]; // gt_child_ptr
            if (gtNodeOffset > 0) {
                reader.rewind(bytes.length - index); // correct reader's index
                return reader.seek(gtNodeOffset + 3).then(() => {
                    return readChild();
                });
            }
            else {
                return null;
            }
        };            

        // let the reader start after the 6 header bytes
        return this._getReader()
        .then(r => {
            reader = r;
            return reader.go(6);
        }) 
        .then(() => {
            return readChild();
        });
    }

    /**
     * Searches the tree
     * @param {string} op operator to use for key comparison, can be single value operators "<", "<=", "==", "!=", ">", ">=", "matches", "!matches", double value operators "between", "!between", and multiple value operators "in", "!in"
     * @param {string|number|boolean|Date|Array} param single value or array for double/multiple value operators
     * @returns {Promise<BinaryBPlusTreeLeafEntry[]>}
     */
    search(op, param) {
        if (["in","!in","between","!between"].indexOf(op) >= 0) {
            // param must be an array
            console.assert(param instanceof Array, `param must be an array when using operator ${op}`);
        }

        /** @type {BinaryBPlusTreeLeafEntry[]} */
        let results = [];

        /**
         * @param {BinaryBPlusTreeLeafEntry} entry 
         */
        const add = (entry) => {
            results.push(entry);
            // let obj = { key: entry.key };
            // if (this.info.uniqueValues) {
            //     obj.value = entry.values[0];
            // }
            // else {
            //     obj.values = entry.values;
            // }
            // results.push(obj);
        };

        if (["<","<="].indexOf(op) >= 0) {
            const processLeaf = (leaf) => {
                let stop = false;
                for (let i = 0; i < leaf.entries.length; i++) {
                    const entry = leaf.entries[i];
                    if (op === "<=" && entry.key <= param) { add(entry); }
                    else if (op === "<" && entry.key < param) { add(entry); }
                    else { stop = true; break; }
                }
                if (!stop && leaf.getNext) {
                    return leaf.getNext()
                    .then(processLeaf)
                }
                else {
                    return results;
                }
            }
            return this.getFirstLeaf()
            .then(processLeaf);
        }
        else if ([">",">="].indexOf(op) >= 0) {
            const processLeaf = (leaf) => {
                for (let i = 0; i < leaf.entries.length; i++) {
                    const entry = leaf.entries[i];
                    if (op === ">=" && entry.key >= param) { add(entry); }
                    else if (op === ">" && entry.key > param) { add(entry); }
                }
                if (leaf.getNext) {
                    return leaf.getNext()
                    .then(processLeaf);
                }
                else {
                    return results;
                }
            }
            return this.findLeaf(param)
            .then(processLeaf);
        }
        else if (op === "==") {
            return this.findLeaf(param)
            .then(leaf => {
                let entry = leaf.entries.find(entry => entry.key === param);
                if (entry) {
                    add(entry);
                }
                return results;
            });
        }
        else if (op === "!=") {
            // Full index scan needed
            const processLeaf = leaf => {
                for (let i = 0; i < leaf.entries.length; i++) {
                    const entry = leaf.entries[i];
                    if (entry.key !== param) { add(entry); }
                }
                if (leaf.getNext) {
                    return leaf.getNext()
                    .then(processLeaf);
                }
                else {
                    return results;
                }
            };
            return this.getFirstLeaf()
            .then(processLeaf);
        }
        else if (op === "in") {
            let sorted = param.slice().sort();
            let searchKey = sorted.shift();
            const processLeaf = (leaf) => {
                while (true) {
                    let entry = leaf.entries.find(entry => entry.key === searchKey);
                    if (entry) { add(entry); }
                    searchKey = sorted.shift();
                    if (!searchKey) {
                        return results;
                    }
                    else if (searchKey > leaf.entries[leaf.entries.length-1].key) {
                        return this.findLeaf(searchKey).then(processLeaf);
                    }
                    // Stay in the loop trying more keys on the same leaf
                }
            };
            return this.findLeaf(searchKey).then(processLeaf);
        }
        else if (op === "!in") {
            // Full index scan needed
            let keys = param;
            const processLeaf = (leaf) => {
                for (let i = 0; i < leaf.entries.length; i++) {
                    const entry = leaf.entries[i];
                    if (keys.indexOf(entry.key) < 0) { add(entry); }
                }
                if (leaf.getNext) {
                    return leaf.getNext()
                    .then(processLeaf);
                }
                else {
                    return results;
                }
            };
            return this.getFirstLeaf().then(processLeaf);
        }        
        else if (op === "between") {
            let bottom = param[0], top = param[1];
            if (top < bottom) {
                let swap = top;
                top = bottom;
                bottom = swap;
            }
            return this.findLeaf(bottom)
            .then(leaf => {
                let stop = false;
                const processLeaf = leaf => {
                    for (let i = 0; i < leaf.entries.length; i++) {
                        const entry = leaf.entries[i];
                        if (entry.key >= bottom && entry.key <= top) { add(entry); }
                        if (entry.key > top) { stop = true; break; }
                    }
                    if (stop || !leaf.getNext) {
                        return results;
                    }
                    else {
                        return leaf.getNext().then(processLeaf);
                    }
                };
                return processLeaf(leaf);
            });
        }
        else if (op === "!between") {
            // Equal to key < bottom || key > top
            let bottom = param[0], top = param[1];
            if (top < bottom) {
                let swap = top;
                top = bottom;
                bottom = swap;
            }
            // Add lower range first, lowest value < val < bottom
            return this.getFirstLeaf()
            .then(leaf => {
                let stop = false;
                const processLeaf = leaf => {
                    for (let i = 0; i < leaf.entries.length; i++) {
                        const entry = leaf.entries[i];
                        if (entry.key < bottom) { add(entry); }
                        else { stop = true; break; }
                    }
                    if (!stop && leaf.getNext) {
                        return leaf.getNext().then(processLeaf);
                    }
                };
                return processLeaf(leaf);
            })
            .then(() => {
                // Now add upper range, top < val < highest value
                return this.findLeaf(top);
            })
            .then(leaf => {
                const processLeaf = leaf => {
                    for (let i = 0; i < leaf.entries.length; i++) {
                        const entry = leaf.entries[i];
                        if (entry.key > top) { add(entry); }
                    }
                    if (!leaf.getNext) {
                        return results;
                    }
                    else {
                        return leaf.getNext().then(processLeaf);
                    }                
                };
                return processLeaf(leaf);
            });
        }
        else if (op === "matches" || op === "!matches") {
            // Full index scan needed
            let re = param;
            const processLeaf = (leaf) => {
                for (let i = 0; i < leaf.entries.length; i++) {
                    const entry = leaf.entries[i];
                    const isMatch = re.test(entry.key);
                    if ((isMatch && op === "matches") || (!isMatch && op === "!matches")) {
                        add(entry); 
                    }
                }
                if (leaf.getNext) {
                    return leaf.getNext()
                    .then(processLeaf);
                }
                else {
                    return results;
                }
            };
            return this.getFirstLeaf().then(processLeaf);
        }
    }

    find(searchKey) {
        return this.findLeaf(searchKey)
        .then(leaf => {
            let entry = leaf.entries.find(entry => entry.key === searchKey);
            if (entry) {
                if (this.info.isUnique) {
                    return entry.values[0];
                }
                else {
                    return entry.values;
                }
            }
            else {
                return null;
            }
        });
    }

    add(key, value) {
        return this.findLeaf(key)
        .then(leaf => {
            // This is the leaf the key should be added to
            const entryIndex = leaf.entries.findIndex(entry => entry.key === key);
            let addNew = false;
            if (this.info.isUnique) {
                // Make sure key doesn't exist yet
                if (~entryIndex) {
                    throw new Error(`Cannot add duplicate key "${key}": tree expects unique keys`);
                }

                addNew = true;
            }
            else {
                if (~entryIndex) {
                    leaf.entries[entryIndex].values.push(value);
                }
                else {
                    addNew = true;
                }
            }

            if (addNew) {
                if (leaf.entries.length + 1 > this.info.entriesPerNode) {
                    throw new Error(`Cannot add key "${key}": leaf is full`);
                }

                // Create entry
                const entry = { 
                    key, 
                    value, 
                    values: [value] 
                };

                // Insert it
                const insertBeforeIndex = leaf.entries.findIndex(entry => entry.key > key);
                if (insertBeforeIndex < 0) { 
                    leaf.entries.push(entry);
                }
                else {
                    leaf.entries.splice(insertBeforeIndex, 0, entry);    
                }            
            }
            return this._writeLeaf(leaf);
        })
        .catch(err => {
            throw err;
        });
    }

    remove(key, value = undefined) {
        function compareBinary(val1, val2) {
            return val1.length === val2.length && val1.every((byte, index) => val2[index] === byte);
        }

        return this.findLeaf(key)
        .then(leaf => {
            // This is the leaf the key should be in
            const entryIndex = leaf.entries.findIndex(entry => entry.key === key);
            if (!~entryIndex) { return; }
            if (this.info.isUnique || typeof value === "undefined" || leaf.entries[entryIndex].values.length === 1) {
                leaf.entries.splice(entryIndex, 1);
            }
            else {
                let valueIndex = leaf.entries[entryIndex].values.findIndex(val => compareBinary(val, value));
                if (!~valueIndex) { return; }
                leaf.entries[entryIndex].values.splice(valueIndex, 1);
            }
            return this._writeLeaf(leaf);
        })
        .catch(err => {
            throw err;
        });
    }

    update(key, newValue, currentValue = undefined) {
        function compareBinary(val1, val2) {
            return val1.length === val2.length && val1.every((byte, index) => val2[index] === byte);
        }

        return this.findLeaf(key)
        .then(leaf => {
            // This is the leaf the key should be in
            const entryIndex = leaf.entries.findIndex(entry => entry.key === key);
            if (!~entryIndex) { 
                throw new Error(`Key to update ("${key}") not found`); 
            }
            const entry = leaf.entries[entryIndex];
            if (this.info.isUnique) {
                entry.values = [newValue];
            }
            else if (typeof currentValue === "undefined") {
                throw new Error(`To update a non-unique key, the current value must be passed as parameter`);
            }
            else {
                let valueIndex = entry.values.findIndex(val => compareBinary(val, currentValue));
                if (!~valueIndex) { 
                    throw new Error(`Key/value combination to update not found (key: "${key}") `); 
                }
                entry.values[valueIndex] = newValue;
            }
            return this._writeLeaf(leaf);
        })
        .catch(err => {
            throw err;
        });
    }

    transaction(operations) {
        return new Promise((resolve, reject) => {
            const rollbackOperations = [];
            let rollingBack = false;
            let errMessage;
            const success = (rollbackOp) => {
                if (operations.length === 0) {
                    if (rollingBack) { reject(errMessage); }
                    else { resolve(); }
                }
                else {
                    if (!rollingBack) {
                        rollbackOperations.push(rollbackOp);
                    }
                    processNextOperation();
                }
            };
            const rollback = (err) => {
                if (rollingBack) {
                    throw new Error(`FATAL ERROR: Failed to rollback transaction: ${err}. Rollback initiated because of error: ${errMessage}`)
                }
                else if (rollbackOperations.length === 0) {
                    return reject(err);
                }
                rollingBack = true;
                errMessage = err;
                operations = rollbackOperations;
                processNextOperation(); // Will start rollback now
            };
            const processNextOperation = () => {
                const op = operations.shift();
                let undoOp, p;
                switch(op.type) {
                    case 'add': {
                        undoOp = { type: 'remove', key: op.key, value: op.value };
                        p = this.add(op.key, op.value);
                        break;
                    }
                    case 'remove': {
                        undoOp = { type: 'add', key: op.key, value: op.value };
                        p = this.remove(op.key, op.value);
                        break;
                    }
                    case 'update': {
                        undoOp = { type: 'update', key: op.key, newValue: op.currentValue, currentValue: op.value };
                        p = this.update(op.key, op.newValue, op.currentValue);
                        break;
                    }
                }
                p.then(() => { success(undoOp); })
                .catch(rollback);
            };
            processNextOperation();
        });
    }

    /**
     * 
     * @param {number} fillFactor 
     * @returns {Promise<BPlusTree>}
     */
    toTree(fillFactor = 100) {
        return this.toTreeBuilder(fillFactor)
        .then(builder => {
            return builder.create();
        });
    }

    /**
     * @returns {Promise<BPlusTreeBuilder>} Promise that resolved with a BPlusTreeBuilder
     */
    toTreeBuilder(fillFactor) {
        const treeBuilder = new BPlusTreeBuilder(this.info.isUnique, fillFactor);
        return this.getFirstLeaf()
        .then(leaf => {

            const processLeaf = (leaf) => {
                leaf.entries.forEach(entry => {
                    if (this.isUnique) {
                        treeBuilder.add(entry.key, entry.value);
                    }
                    else {
                        entry.values.forEach(value => treeBuilder.add(entry.key, value));
                    }
                });
                if (leaf.getNext) {
                    return leaf.getNext().then(processLeaf);
                }
            };

            return processLeaf(leaf);
        })
        .then(() => {
            return treeBuilder;
        });
    }
}

class BinaryBPlusTreeNodeInfo {
    /**
     * 
     * @param {{ isLeaf: boolean, bytes: number[], index: number, length: number, free: number }} info 
     */
    constructor(info) {
        this.isLeaf = info.isLeaf;
        this.bytes = info.bytes;
        this.index = info.index;
        this.length = info.length;
        this.free = info.free;
    }
}

class BinaryBPlusTreeNode extends BinaryBPlusTreeNodeInfo {
    /**
     * 
     * @param {BinaryBPlusTreeNodeInfo} nodeInfo 
     */
    constructor(nodeInfo) {
        super(nodeInfo);

        /** @type {BinaryBPlusTreeNodeEntry[]} */
        this.entries = [];

        /** @type {() => Promise<BinaryBPlusTreeNodeInfo} */
        this.getGtChild = () => {
            return Promise.reject(new Error(`getGtChild must be overridden`));
        };
    }
}

class BinaryBPlusTreeNodeEntry {
    /**
     * 
     * @param {string|number|boolean|Date} key 
     */
    constructor(key) {
        this.key = key;

        /** @type {() => Promise<BinaryBPlusTreeNodeInfo} */
        this.getLtChild = () => {
            return Promise.reject(new Error(`getLtChild must be overridden`));
        }
    }
}

class BinaryBPlusTreeLeaf extends BinaryBPlusTreeNodeInfo {
    /**
     * @param {BinaryBPlusTreeNodeInfo} nodeInfo 
     */
    constructor(nodeInfo) {
        super(nodeInfo);
        
        this.prevLeafOffset = 0;
        this.nextLeafOffset = 0;        
        /** @type {BinaryBPlusTreeLeafEntry[]} */
        this.entries = [];

        /** @type {() => Promise<BinaryBPlusTreeLeaf>?} only present if there is a previous leaf */
        this.getPrevious = undefined;
        /** @type {function?} only present if there is a next leaf */
        this.getNext = undefined;
    }
}

class BinaryBPlusTreeLeafEntry {
    /**
     * 
     * @param {string|number|boolean|Date} key 
     * @param {Array<number[]>} values Array of binary values - NOTE if the tree has unique values, it must always wrap the single value in an Array: [value]
     */
    constructor(key, values) {
        this.key = key;
        this.values = values;
    }

    get value() {
        return this.values[0];
    }
}

module.exports = { 
    BPlusTree,
    BinaryBPlusTree,
    BPlusTreeBuilder
};