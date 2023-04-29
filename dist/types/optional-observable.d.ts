// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: rxjs dependency is optional and only needed when using methods that require them
import type { Observable } from 'rxjs';
export { Observable };
export declare function getObservable<T = any>(): typeof Observable<T>;
export declare function setObservable(Observable: any): void;
export interface ISubscription {
    unsubscribe(): any;
}
interface IObserver<T> {
    next(value: T): any;
    start?(subscription: ISubscription): void;
    error?(error: any): any;
    complete?(value: any): void;
}
type CleanupFunction = () => any;
type CreateFunction<T> = (observer: IObserver<T>) => CleanupFunction;
type SubscribeFunction<T> = (value: T) => any;
export interface IObservableLike<T> {
    subscribe(subscriber: SubscribeFunction<T>): ISubscription;
}
/**
 * rxjs is an optional dependency that only needs installing when any of AceBase's observe methods are used.
 * If for some reason rxjs is not available (eg in test suite), we can provide a shim. This class is used when
 * `db.setObservable("shim")` is called
 */
export declare class SimpleObservable<T> implements IObservableLike<T> {
    private _active;
    private _create;
    private _cleanup;
    private _subscribers;
    constructor(create: CreateFunction<T>);
    subscribe(subscriber: SubscribeFunction<T>): ISubscription;
}
//# sourceMappingURL=optional-observable.d.ts.map