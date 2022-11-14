"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimpleObservable = exports.setObservable = exports.getObservable = void 0;
const utils_1 = require("./utils");
let _shimRequested = false;
let _observable;
(async () => {
    // Try pre-loading rxjs Observable
    // Test availability in global scope first
    const global = (0, utils_1.getGlobalObject)();
    if (typeof global.Observable !== 'undefined') {
        _observable = global.Observable;
        return;
    }
    // Try importing it from dependencies
    try {
        _observable = await Promise.resolve().then(() => require('rxjs/internal/Observable'));
    }
    catch (_a) {
        // rxjs Observable not available, setObservable must be used if usage of SimpleObservable is not desired
        _observable = SimpleObservable;
    }
})();
function getObservable() {
    if (_observable === SimpleObservable && !_shimRequested) {
        console.warn('Using AceBase\'s simple Observable implementation because rxjs is not available. ' +
            'Add it to your project with "npm install rxjs", add it to AceBase using db.setObservable(Observable), ' +
            'or call db.setObservable("shim") to suppress this warning');
    }
    if (_observable) {
        return _observable;
    }
    throw new Error('RxJS Observable could not be loaded. ');
}
exports.getObservable = getObservable;
function setObservable(Observable) {
    if (Observable === 'shim') {
        _observable = SimpleObservable;
        _shimRequested = true;
    }
    else {
        _observable = Observable;
    }
}
exports.setObservable = setObservable;
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
//# sourceMappingURL=optional-observable.js.map