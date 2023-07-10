import { SimpleObservable } from './simple-observable.js';
import { getGlobalObject } from './utils.js';
let _shimRequested = false;
let _observable;
(async () => {
    // Try pre-loading rxjs Observable
    // Test availability in global scope first
    const global = getGlobalObject();
    if (typeof global.Observable !== 'undefined') {
        _observable = global.Observable;
        return;
    }
    // Try importing it from dependencies
    try {
        const { Observable } = await import('rxjs');
        _observable = Observable;
    }
    catch {
        // rxjs Observable not available, setObservable must be used if usage of SimpleObservable is not desired
        _observable = SimpleObservable;
    }
})();
export function getObservable() {
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
export function setObservable(Observable) {
    if (Observable === 'shim') {
        _observable = SimpleObservable;
        _shimRequested = true;
    }
    else {
        _observable = Observable;
    }
}
//# sourceMappingURL=optional-observable.js.map