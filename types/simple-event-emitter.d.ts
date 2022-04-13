export declare class SimpleEventEmitter {
    private _subscriptions;
    private _oneTimeEvents;
    constructor();
    on(event: string, callback: (data: any) => void): void;
    on<T>(event: string, callback: (data: T) => void): void;
    off(event: string, callback?: (data: any) => void): void;
    off<T>(event: string, callback?: (data: T) => void): void;
    once(event: string, callback?: (data: any) => void): Promise<any>;
    once<T>(event: string, callback?: (data: T) => void): Promise<T>;
    emit(event: string, data?: any): void;
    emitOnce(event: string, data?: any): void;
}
