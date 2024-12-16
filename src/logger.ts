/**
 * Defines an interface for custom loggers. This enables you to replace AceBase's default logger
 * with a logging library such as Bunyan, Winston, Pino and any other logger supporting `trace`, `debug`, `info`, `warn`, `error` and `fatal` methods
 */
export interface LoggerPlugin {
    /** Level 10 */
    trace(...args: any[]): any;
    /** Level 20 */
    debug(...args: any[]): any;
    /** Level 30 */
    info(...args: any[]): any;
    /** Level 40 */
    warn(...args: any[]): any;
    /** Level 50 */
    error(...args: any[]): any;
    /** Level 60 */
    fatal(...args: any[]): any;
}
