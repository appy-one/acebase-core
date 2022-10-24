export declare class SimpleEventEmitter {
    private _subscriptions;
    private _oneTimeEvents;
    constructor();
    on<T = any>(event: string, callback: (data: T) => void): void | this;
    off<T = any>(event: string, callback?: (data: T) => void): this;
    once<T = any>(event: string, callback?: (data: T) => void): Promise<T>;
    emit(event: string, data?: any): this;
    emitOnce(event: string, data?: any): this;
}
//# sourceMappingURL=simple-event-emitter.d.ts.map