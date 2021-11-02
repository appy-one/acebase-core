/**
 * Simple cache implementation that retains immutable values in memory for a limited time.
 * Immutability is enforced by cloning the stored and retrieved values. To change a cached value, it will have to be `set` again with the new value.
 */
export class SimpleCache<KeyType, ValueType> {
    enabled: boolean
    constructor(expirySeconds: number)
    has(key:KeyType): boolean
    set(key:KeyType, value:ValueType): void
    get(key:KeyType): ValueType
    remove(key:KeyType): void
}