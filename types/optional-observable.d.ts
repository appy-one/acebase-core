// Optional dependency on rxjs package. If rxjs is installed into your project, you'll get the correct 
// typings for AceBase methods that use Observables, and you'll be able to use them. If you don't use
// those methods, there is no need to install rxjs. 

// @ts-ignore: rxjs dependency is optional and only needed when using methods that require them
export { Observable } from 'rxjs';

export interface IObservableLike<T> {
    subscribe(observer: (value: T) => any): { unsubscribe(): any }
}