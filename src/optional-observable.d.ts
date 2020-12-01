export type { Observable } from 'rxjs'; // Typescript 3.8+ type export. Error here? Read below..
// Add RxJS to your project if you use functions that return an Observable
// If you using an older (<3.8) typescript version: update it, or comment out above export and enable:
// export type Observable<T> = any;