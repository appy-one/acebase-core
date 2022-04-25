"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObservableShim = exports.setObservable = exports.getObservable = void 0;
let _observable;
function getObservable() {
    if (_observable) {
        return _observable;
    }
    if (typeof window !== 'undefined' && window.Observable) {
        _observable = window.Observable;
        return _observable;
    }
    try {
        const { Observable } = require('rxjs');
        if (!Observable) {
            throw new Error('not loaded');
        }
        _observable = Observable;
        return Observable;
    }
    catch (err) {
        throw new Error(`RxJS Observable could not be loaded. If you are using a browser build, add it to AceBase using db.setObservable. For node.js builds, add it to your project with: npm i rxjs`);
    }
}
exports.getObservable = getObservable;
function setObservable(Observable) {
    if (Observable === 'shim') {
        console.warn(`Using AceBase's simple Observable shim. Only use this if you know what you're doing.`);
        Observable = ObservableShim;
    }
    _observable = Observable;
}
exports.setObservable = setObservable;
/**
 * rxjs is an optional dependency that only needs installing when any of AceBase's observe methods are used.
 * If for some reason rxjs is not available (eg in test suite), we can provide a shim. This class is used when
 * `db.setObservable("shim")` is called
 */
class ObservableShim {
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
                        console.error(`Error in subscriber callback:`, err);
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
            unsubscribe
        };
        return subscription;
    }
}
exports.ObservableShim = ObservableShim;
//# sourceMappingURL=optional-observable.js.map