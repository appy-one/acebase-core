import type { DataReference } from './data-reference';
export declare class DataSnapshot<T = any> {
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
    exists(): boolean;
    /**
     * For snapshots returned by event (eg "value", "child_changed") callbacks: gets the context that was set on the DataReference when the data was updated.
     * This value is read-only, use it instead of snap.ref.context() to make sure you are using the right data for your business logic.
     */
    context: () => any;
    /**
     * Creates a new DataSnapshot instance
     */
    constructor(ref: DataReference, value: T, isRemoved?: boolean, prevValue?: any, context?: any);
    /**
     * Creates a `DataSnapshot` instance
     * @internal (for internal use)
     */
    static for<Value>(ref: DataReference, value: Value): DataSnapshot;
    /**
     * Gets a new snapshot for a child node
     * @param path child key or path
     * @returns Returns a `DataSnapshot` of the child
     */
    child<Value = any>(path: string | number): DataSnapshot<Value>;
    /**
     * Checks if the snapshot's value has a child with the given key or path
     * @param path child key or path
     */
    hasChild(path: string): boolean;
    /**
     * Indicates whether the the snapshot's value has any child nodes
     */
    hasChildren(): boolean;
    /**
     * The number of child nodes in this snapshot
     */
    numChildren(): number;
    /**
     * Runs a callback function for each child node in this snapshot until the callback returns false
     * @param callback function that is called with a snapshot of each child node in this snapshot.
     * Must return a boolean value that indicates whether to continue iterating or not.
     */
    forEach<Child extends DataSnapshot = DataSnapshot>(callback: (child: Child) => boolean): boolean;
    /**
     * The key of the node's path
     */
    get key(): string;
}
export declare type IDataMutationsArray<T = any, Prev = any> = Array<{
    target: Array<string | number>;
    val: T;
    prev: Prev;
}>;
export declare class MutationsDataSnapshot<Val = any, Prev = any, T extends IDataMutationsArray<Val, Prev> = IDataMutationsArray<Val, Prev>> extends DataSnapshot<T> {
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
    previous: () => never;
    constructor(ref: DataReference, mutations: T, context: any);
    /**
     * Runs a callback function for each mutation in this snapshot until the callback returns false
     * @param callback function that is called with a snapshot of each mutation in this snapshot. Must return a boolean value that indicates whether to continue iterating or not.
     * @returns Returns whether every child was interated
     */
    forEach<Child extends DataSnapshot = DataSnapshot>(callback: (child: Child) => boolean): boolean;
    /**
     * Gets a snapshot of a mutated node
     * @param index index of the mutation
     * @returns Returns a DataSnapshot of the mutated node
     */
    child<Value = Val>(index: number): DataSnapshot<Value>;
}
//# sourceMappingURL=data-snapshot.d.ts.map