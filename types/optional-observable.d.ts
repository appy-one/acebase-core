export type { Observable } from 'rxjs'; // Typescript 3.8+ type export. Error here? Read below..

/*
How to handle a TS error in above export:

- If you use AceBase functions that return Observables*, make sure you have RxJS installed: 
npm install rxjs

- If you have RxJS installed and use typescript < 3.8: try updating it, or use:
export { Observable } from 'rxjs';

- If you don't use AceBase functions that return Observables, replace the export with:
export type Observable<T> = any;

* AceBase function that use RxJS Observables are:
    - ref.observe(),
    - proxy values' getObservable()
*/