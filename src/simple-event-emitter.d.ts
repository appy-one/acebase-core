export declare class SimpleEventEmitter {
    private _subscriptions;
    private _oneTimeEvents;
    constructor();
    on<T>(event: string, callback: (data: T) => void): void;
    off<T>(event: string, callback?: (data: T) => void): void;
    once<T>(event: string, callback?: (data: T) => void): Promise<T>;
    emit(event: string, data?: any): void;
    emitOnce(event: string, data?: any): void;
}
