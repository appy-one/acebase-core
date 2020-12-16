"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimpleCache = void 0;
class SimpleCache {
    constructor(expirySeconds) {
        this.expirySeconds = expirySeconds;
        this.cache = new Map();
        setInterval(() => { this.cleanUp(); }, 60 * 1000); // Cleanup every minute
    }
    set(key, value) {
        this.cache.set(key, { value, expires: Date.now() + (this.expirySeconds * 1000) });
    }
    get(key) {
        const entry = this.cache.get(key);
        if (!entry || entry.expires <= Date.now()) {
            return null;
        }
        return entry.value;
    }
    remove(key) {
        this.cache.delete(key);
    }
    cleanUp() {
        const now = Date.now();
        this.cache.forEach((entry, key) => {
            if (entry.expires <= now) {
                this.cache.delete(key);
            }
        });
    }
}
exports.SimpleCache = SimpleCache;
//# sourceMappingURL=simple-cache.js.map