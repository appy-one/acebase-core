let _observable:any;
export function getObservable() {
    if (_observable) { return _observable; }
    if (typeof window !== 'undefined' && (window as any).Observable) { 
        _observable = (window as any).Observable;
        return _observable;
    }
    try {
        const { Observable } = require('rxjs'); //'rxjs/internal/observable'
        if (!Observable) { throw new Error('not loaded'); }
        _observable = Observable;
        return Observable;
    }
    catch(err) {
        throw new Error(`RxJS Observable could not be loaded. If you are using a browser build, add it to AceBase using db.setObservable. For node.js builds, add it to your project with: npm i rxjs`);
    }
}
export function setObservable(Observable: any) {
    _observable = Observable;
}