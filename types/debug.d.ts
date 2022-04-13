export class DebugLogger {
    constructor(level: 'verbose'|'log'|'warn'|'error', prefix?: string)
    log(message: any, ...optionalParams: any[])
    warn(message: any, ...optionalParams: any[])
    error(message: any, ...optionalParams: any[])
    verbose(message: any, ...optionalParams: any[])
    setLevel(level: 'log'|'warn'|'error')
}