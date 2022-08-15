export class DebugLogger {
    constructor(level: 'verbose'|'log'|'warn'|'error', prefix?: string)
    log(message: any, ...optionalParams: any[]): void
    warn(message: any, ...optionalParams: any[]): void
    error(message: any, ...optionalParams: any[]): void
    verbose(message: any, ...optionalParams: any[]): void
    setLevel(level: 'log'|'warn'|'error'): void
}
