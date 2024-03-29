import type { DataReference } from './data-reference';
import { PathInfo } from './path-info';

function getChild<T extends DataSnapshot = DataSnapshot>(snapshot: T, path: string|number, previous = false) {
    if (!snapshot.exists()) { return null; }
    let child = previous ? snapshot.previous() : snapshot.val();
    if (typeof path === 'number') {
        return child[path];
    }
    PathInfo.getPathKeys(path).every(key => {
        child = child[key];
        return typeof child !== 'undefined';
    });
    return child || null;
}

function getChildren<T extends DataSnapshot = DataSnapshot>(snapshot: T): Array<string|number> {
    if (!snapshot.exists()) { return []; }
    const value = snapshot.val();
    if (value instanceof Array) {
        return new Array(value.length).map((v,i) => i);
    }
    if (typeof value === 'object') {
        return Object.keys(value);
    }
    return [];
}

export class DataSnapshot<T = any> {
    /**
     * Reference to the node
     */
    ref: DataReference;

    /**
     * Gets the value stored in the referenced path, or null if it did't exist in the database. NOTE: In "child_removed" event subscription callbacks, this contains the removed child value instead.
     */
    val: <Value = T>() => Value | null;

    /**
     * If this snapshot is returned in an event subscription callback (eg "child_changed" or "mutated" event), this contains the previous value of the referenced path that was stored in the database.
     * Giving this its own type parameter allows the user to specify a different tyoe in case the previous value differs.
     */
    previous: <Prev = T>() => Prev | undefined;

    /**
     * Indicates whether the node exists in the database
     */
    exists(): boolean { return false; }

    /**
     * For snapshots returned by event (eg "value", "child_changed") callbacks: gets the context that was set on the DataReference when the data was updated.
     * This value is read-only, use it instead of snap.ref.context() to make sure you are using the right data for your business logic.
     */
    context: () => any;

    /**
     * Creates a new DataSnapshot instance
     */
    constructor(ref: DataReference, value: T, isRemoved = false, prevValue?: any, context?: any) {
        this.ref = ref;
        this.val = () => { return value as any; };
        this.previous = () => { return prevValue; };
        this.exists = () => {
            if (isRemoved) { return false; }
            return value !== null && typeof value !== 'undefined';
        };
        this.context = () => { return context || {}; };
    }

    /**
     * Creates a `DataSnapshot` instance
     * @internal (for internal use)
     */
    static for<Value>(ref: DataReference, value: Value): DataSnapshot {
        return new DataSnapshot(ref, value);
    }

    /**
     * Gets a new snapshot for a child node
     * @param path child key or path
     * @returns Returns a `DataSnapshot` of the child
     */
    child<Prop extends keyof T>(key: Prop): DataSnapshot<T[Prop]>;
    child<ChildType = any>(path: string): ChildType extends keyof T ? DataSnapshot<T[ChildType]> : DataSnapshot<ChildType>;
    child(path: string | number) {
        // Create new snapshot for child data
        const val = getChild(this, path, false);
        const prev = getChild(this, path, true);
        return new DataSnapshot(this.ref.child(path), val, false, prev);
    }

    /**
     * Checks if the snapshot's value has a child with the given key or path
     * @param path child key or path
     */
    hasChild(path: string) {
        return getChild(this, path) !== null;
    }

    /**
     * Indicates whether the the snapshot's value has any child nodes
     */
    hasChildren() {
        return getChildren(this).length > 0;
    }

    /**
     * The number of child nodes in this snapshot
     */
    numChildren() {
        return getChildren(this).length;
    }

    /**
     * Runs a callback function for each child node in this snapshot until the callback returns false
     * @param callback function that is called with a snapshot of each child node in this snapshot.
     * Must return a boolean value that indicates whether to continue iterating or not.
     */
    forEach<Child extends DataSnapshot = DataSnapshot<T[keyof T]>>(callback: (child: Child) => boolean): boolean {
        const value = this.val();
        const prev = this.previous();
        return getChildren(this).every((key: never) => {
            const snap = new DataSnapshot(this.ref.child(key), value[key], false, prev[key]);
            return callback(snap as any);
        });
    }

    /**
     * The key of the node's path
     */
    get key() { return this.ref.key; }
}

export type IDataMutationsArray<Value = any, PrevValue = Value> = Array<{ target: Array<string|number>, val: Value, prev: PrevValue }>;
export class MutationsDataSnapshot<Value = any, PrevValue = Value, T extends IDataMutationsArray<Value, PrevValue> = IDataMutationsArray<Value, PrevValue>> extends DataSnapshot<T> {

    /**
     * Gets the internal mutations array. Only use if you know what you are doing.
     * In most cases, it's better to use `forEach` to iterate through all mutations.
     */
    val: <Value = T>(warn?: boolean) => Value;

    /**
     * Don't use this to get previous values of mutated nodes.
     * Use `.previous` properties on the individual child snapshots instead.
     * @throws Throws an error if you do use it.
     */
    previous = () => { throw new Error('Iterate values to get previous values for each mutation'); };

    constructor(ref: DataReference, mutations: T, context: any) {
        super(ref, mutations, false, undefined, context);
        this.val = (warn = true) => {
            if (warn) { console.warn('Unless you know what you are doing, it is best not to use the value of a mutations snapshot directly. Use child methods and forEach to iterate the mutations instead'); }
            return mutations as any;
        };
    }

    /**
     * Runs a callback function for each mutation in this snapshot until the callback returns false
     * @param callback function that is called with a snapshot of each mutation in this snapshot. Must return a boolean value that indicates whether to continue iterating or not.
     * @returns Returns whether every child was interated
     */
    forEach<Child extends DataSnapshot = DataSnapshot>(callback: (child: Child) => boolean): boolean {
        const mutations = this.val(false);
        return mutations.every(mutation => {
            const ref = mutation.target.reduce((ref, key) => ref.child(key), this.ref);
            const snap = new DataSnapshot(ref, mutation.val, false, mutation.prev);
            return callback(snap as any);
        });
    }

    /**
     * Gets a snapshot of a mutated node
     * @param index index of the mutation
     * @returns Returns a DataSnapshot of the mutated node
     */
    child(key: string): never;
    child<ChildType = T[number]>(index: number): DataSnapshot<ChildType>;
    child(index: string | number) {
        if (typeof index !== 'number') { throw new Error('child index must be a number'); }
        const mutation = this.val(false)[index];
        const ref = mutation.target.reduce((ref, key) => ref.child(key), this.ref);
        return new DataSnapshot(ref, mutation.val as any, false, mutation.prev);
    }
}
