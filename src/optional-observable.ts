import { getGlobalObject } from './utils';
export type { Observable } from 'rxjs';

let _shimRequested = false;
let _observable: any;
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

export function getObservable<T = any>() {
    if (_observable === SimpleObservable && !_shimRequested) {
        console.warn(
            'Using AceBase\'s simple Observable implementation because rxjs is not available. ' +
            'Add it to your project with "npm install rxjs", add it to AceBase using db.setObservable(Observable), ' +
            'or call db.setObservable("shim") to suppress this warning'
        );
    }
    if (_observable) { return _observable as typeof import('rxjs').Observable<T>; }
    throw new Error('RxJS Observable could not be loaded. ');
}

export function setObservable(Observable: any) {
    if (Observable === 'shim') {
        _observable = SimpleObservable;
        _shimRequested = true;
    }
    else {
        _observable = Observable;
    }
}

export interface ISubscription {
    unsubscribe(): any
}
interface IObserver<T> {
    next(value: T): any
    start?(subscription: ISubscription): void
    error?(error: any): any
    complete?(value: any): void
}
type CleanupFunction = () => any;
type CreateFunction<T> = (observer: IObserver<T>) => CleanupFunction;
type SubscribeFunction<T> = (value: T) => any;
export interface IObservableLike<T> {
    subscribe(subscriber: SubscribeFunction<T>): ISubscription
}

/**
 * rxjs is an optional dependency that only needs installing when any of AceBase's observe methods are used.
 * If for some reason rxjs is not available (eg in test suite), we can provide a shim. This class is used when
 * `db.setObservable("shim")` is called
 */
export class SimpleObservable<T> implements IObservableLike<T> {
    private _active = false;
    private _create: CreateFunction<T>;
    private _cleanup: CleanupFunction;
    private _subscribers: SubscribeFunction<T>[] = [];
    constructor (create: CreateFunction<T>) {
        this._create = create;
    }
    subscribe(subscriber: SubscribeFunction<T>) {
        if (!this._active) {
            const next = (value: T) => {
                // emit value to all subscribers
                this._subscribers.forEach(s => {
                    try { s(value); }
                    catch(err) { console.error('Error in subscriber callback:', err); }
                });
            };
            const observer:IObserver<T> = { next };
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
        const subscription:ISubscription = {
            unsubscribe,
        };
        return subscription;
    }
}
