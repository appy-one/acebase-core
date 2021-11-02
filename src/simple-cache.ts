import { cloneObject } from "./utils";

/**
 * Simple cache implementation that retains immutable values in memory for a limited time.
 * Immutability is enforced by cloning the stored and retrieved values. To change a cached value, it will have to be `set` again with the new value.
 */
 export class SimpleCache<K, V> {
    expirySeconds: number;
    private cache: Map<K, { value: V, expires: number }>;
    enabled: boolean = true;
    constructor(expirySeconds) {
        this.expirySeconds = expirySeconds;
        this.cache = new Map();
        setInterval(() => { this.cleanUp(); }, 60 * 1000); // Cleanup every minute
    }
    has(key: K) { 
        if (!this.enabled) { return false; }
        return this.cache.has(key); 
    }
    get(key: K): V {
        if (!this.enabled) { return null; }
        const entry = this.cache.get(key);
        if (!entry) { return null; } // if (!entry || entry.expires <= Date.now()) { return null; }
        return cloneObject(entry.value);
    }
    set(key: K, value: V) {
        this.cache.set(key, { value: cloneObject(value), expires: Date.now() + (this.expirySeconds * 1000) })
    }
    remove(key: K) {
        this.cache.delete(key);
    }
    cleanUp() {
        const now = Date.now();
        this.cache.forEach((entry, key) => {
            if (entry.expires <= now) { this.cache.delete(key); }
        });
    }
}