"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setObservable = exports.getObservable = void 0;
const simple_observable_1 = require("./simple-observable");
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
        const { Observable } = await Promise.resolve().then(() => require('rxjs'));
        _observable = Observable;
    }
    catch (_a) {
        // rxjs Observable not available, setObservable must be used if usage of SimpleObservable is not desired
        _observable = simple_observable_1.SimpleObservable;
    }
})();
function getObservable() {
    if (_observable === simple_observable_1.SimpleObservable && !_shimRequested) {
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
        _observable = simple_observable_1.SimpleObservable;
        _shimRequested = true;
    }
    else {
        _observable = Observable;
    }
}
exports.setObservable = setObservable;
//# sourceMappingURL=optional-observable.js.map