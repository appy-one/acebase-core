// Optional dependency on rxjs package. If rxjs is installed into your project, you'll get the correct
// typings for AceBase methods that use Observables, and you'll be able to use them. If you don't use
// those methods, there is no need to install rxjs.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: rxjs dependency is optional and only needed when using methods that require them
export type { Observable } from 'rxjs';

let _observable: any;

export function getObservable() {
    if (_observable) { return _observable; }
    if (typeof window !== 'undefined' && (window as any).Observable) {
        _observable = (window as any).Observable;
        return _observable;
    }
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Observable } = require('rxjs'); // fails in ESM module, need an elegant way to handle this. Can't use dynamic import() because it 1) requires Node 12+ and 2) causes Webpack build to fail if rxjs is not installed
        if (!Observable) { throw new Error('not loaded'); }
        _observable = Observable;
        return Observable;
    }
    catch(err) {
        throw new Error('RxJS Observable could not be loaded. If you are using a browser build, add it to AceBase using db.setObservable. For node.js builds, add it to your project with: npm i rxjs');
    }
}

export function setObservable(Observable: any) {
    if (Observable === 'shim') {
        console.warn('Using AceBase\'s simple Observable shim. Only use this if you know what you\'re doing.');
        Observable = ObservableShim;
    }
    _observable = Observable;
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
export class ObservableShim<T> implements IObservableLike<T> {
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
