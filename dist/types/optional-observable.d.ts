// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: rxjs dependency is optional and only needed when using methods that require them
export type { Observable } from 'rxjs';
export declare function getObservable<T = any>(): {
    new (subscribe?: (this: import("rxjs").Observable<T>, subscriber: import("rxjs").Subscriber<T>) => import("rxjs").TeardownLogic): import("rxjs").Observable<T>;
    create: (...args: any[]) => any;
};
export declare function setObservable(Observable: any): void;
//# sourceMappingURL=optional-observable.d.ts.map