"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimpleEventEmitter = void 0;
function runCallback(callback, data) {
    try {
        callback(data);
    }
    catch (err) {
        console.error(`Error in subscription callback`, err);
    }
}
class SimpleEventEmitter {
    constructor() {
        this._subscriptions = [];
        this._oneTimeEvents = new Map();
    }
    on(event, callback) {
        if (this._oneTimeEvents.has(event)) {
            return runCallback(callback, this._oneTimeEvents.get(event));
        }
        this._subscriptions.push({ event, callback, once: false });
        return this;
    }
    off(event, callback) {
        this._subscriptions = this._subscriptions.filter(s => s.event !== event || (callback && s.callback !== callback));
        return this;
    }
    once(event, callback) {
        let resolve;
        let promise = new Promise(rs => {
            if (!callback) {
                // No callback used, promise only
                resolve = rs;
            }
            else {
                // Callback used, maybe also returned promise
                resolve = (data) => {
                    rs(data); // resolve promise
                    callback(data); // trigger callback
                };
            }
        });
        if (this._oneTimeEvents.has(event)) {
            runCallback(resolve, this._oneTimeEvents.get(event));
        }
        else {
            this._subscriptions.push({ event, callback: resolve, once: true });
        }
        return promise;
    }
    emit(event, data) {
        if (this._oneTimeEvents.has(event)) {
            throw new Error(`Event "${event}" was supposed to be emitted only once`);
        }
        for (let i = 0; i < this._subscriptions.length; i++) {
            const s = this._subscriptions[i];
            if (s.event !== event) {
                continue;
            }
            try {
                s.callback(data);
            }
            catch (err) {
                console.error(`Error in subscription callback`, err);
            }
            if (s.once) {
                this._subscriptions.splice(i, 1);
                i--;
            }
        }
        return this;
    }
    emitOnce(event, data) {
        if (this._oneTimeEvents.has(event)) {
            throw new Error(`Event "${event}" was supposed to be emitted only once`);
        }
        this.emit(event, data);
        this._oneTimeEvents.set(event, data); // Mark event as being emitted once for future subscribers
        this.off(event); // Remove all listeners for this event, they won't fire again
        return this;
    }
}
exports.SimpleEventEmitter = SimpleEventEmitter;
//# sourceMappingURL=simple-event-emitter.js.map