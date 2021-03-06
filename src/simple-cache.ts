export class SimpleCache<K, V> {
    expirySeconds: number;
    cache: Map<K, { value: V, expires: number }>;
    constructor(expirySeconds) {
        this.expirySeconds = expirySeconds;
        this.cache = new Map();
        setInterval(() => { this.cleanUp(); }, 60 * 1000); // Cleanup every minute
    }
    set(key: K, value: V) {
        this.cache.set(key, { value, expires: Date.now() + (this.expirySeconds * 1000) })
    }
    get(key: K): V {
        const entry = this.cache.get(key);
        if (!entry || entry.expires <= Date.now()) { return null; }
        return entry.value;
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