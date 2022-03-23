export interface SimpleCacheOptions {
    /** The number of seconds to keep items cached after their last update */
    expirySeconds?: number;
    /** Whether to deep clone the stored values to protect them from accidental adjustments */
    cloneValues?: boolean; 
    /** Maximum amount of entries to keep in cache */
    maxEntries?: number
}

/**
 * Simple cache implementation that retains immutable values in memory for a limited time.
 * Immutability is enforced by cloning the stored and retrieved values. To change a cached value, it will have to be `set` again with the new value.
 */
export class SimpleCache<KeyType, ValueType> {
    enabled: boolean;
    readonly size: number;
    constructor(expirySeconds: number);
    constructor(options: SimpleCacheOptions);
    has(key: KeyType): boolean;
    set(key: KeyType, value:ValueType): void;
    get(key: KeyType): ValueType;
    remove(key: KeyType): void;
}