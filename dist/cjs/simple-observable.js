"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimpleObservable = void 0;
/**
 * rxjs is an optional dependency that only needs installing when any of AceBase's observe methods are used.
 * If for some reason rxjs is not available (eg in test suite), we can provide a shim. This class is used when
 * `db.setObservable("shim")` is called
 */
class SimpleObservable {
    constructor(create) {
        this._active = false;
        this._subscribers = [];
        this._create = create;
    }
    subscribe(subscriber) {
        if (!this._active) {
            const next = (value) => {
                // emit value to all subscribers
                this._subscribers.forEach(s => {
                    try {
                        s(value);
                    }
                    catch (err) {
                        console.error('Error in subscriber callback:', err);
                    }
                });
            };
            const observer = { next };
            this._cleanup = this._create(observer);
            this._active = true;
        }
        this._subscribers.push(subscriber);
        const unsubscribe = () => {
            this._subscribers.splice(this._subscribers.indexOf(subscriber), 1);
            if (this._subscribers.length === 0) {
                this._active = false;
                this._cleanup();
            }
        };
        const subscription = {
            unsubscribe,
        };
        return subscription;
    }
}
exports.SimpleObservable = SimpleObservable;
//# sourceMappingURL=simple-observable.js.map