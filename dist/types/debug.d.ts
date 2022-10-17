declare type LoggingFunction = (text: string, ...args: any[]) => void;
export declare type LoggingLevel = 'verbose' | 'log' | 'warn' | 'error';
export declare class DebugLogger {
    level: LoggingLevel;
    private prefix;
    verbose: LoggingFunction;
    log: LoggingFunction;
    warn: LoggingFunction;
    error: LoggingFunction;
    write: (text: string) => void;
    constructor(level?: LoggingLevel, prefix?: string);
    setLevel(level: LoggingLevel): void;
}
export {};
