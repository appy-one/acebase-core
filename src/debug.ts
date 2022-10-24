import process from './process';

type LoggingFunction = (text: string, ...args: any[]) => void;
export type LoggingLevel = 'verbose' | 'log' | 'warn' | 'error';

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

export class DebugLogger {
    verbose: LoggingFunction;
    log: LoggingFunction;
    warn: LoggingFunction;
    error: LoggingFunction;
    write: (text: string) => void;

    constructor(public level: LoggingLevel = 'log', private prefix = '') {
        this.setLevel(level);
    }
    setLevel(level: LoggingLevel) {
        const prefix = this.prefix ? this.prefix + ' %s' : '';
        this.verbose = ['verbose'].includes(level) ? prefix ? console.log.bind(console, prefix) : console.log.bind(console) : noop;
        this.log = ['verbose', 'log'].includes(level) ? prefix ? console.log.bind(console, prefix) : console.log.bind(console) : noop;
        this.warn = ['verbose', 'log', 'warn'].includes(level) ? prefix ? console.warn.bind(console, prefix) : console.warn.bind(console) : noop;
        this.error = ['verbose', 'log', 'warn', 'error'].includes(level) ? prefix ? console.error.bind(console, prefix) : console.error.bind(console) : noop;
        this.write = (text) => {
            const isRunKit = typeof process !== 'undefined' && process.env && typeof process.env.RUNKIT_ENDPOINT_PATH === 'string';
            if (text && isRunKit) {
                text.split('\n').forEach(line => console.log(line)); // Logs each line separately
            }
            else {
                console.log(text);
            }
        };
    }
}
