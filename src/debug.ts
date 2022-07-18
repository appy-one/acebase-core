import process from './process';

type LoggingFunction = (text: string, ...args: any) => void;

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

export class DebugLogger {
    level: 'verbose'|'log'|'warn'|'error';
    prefix: string;
    verbose: LoggingFunction;
    log: LoggingFunction;
    warn: LoggingFunction;
    error: LoggingFunction;
    write: (text: string) => void;

    constructor(level = 'log', prefix = '') {
        this.prefix = prefix;
        this.setLevel(level);
    }
    setLevel(level) {
        const prefix = this.prefix ? this.prefix + ' %s' : '';
        this.level = level;
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
