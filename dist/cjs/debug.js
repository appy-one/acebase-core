"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebugLogger = void 0;
const process_1 = require("./process");
class DebugLogger {
    constructor(level = "log", prefix = '') {
        this.prefix = prefix;
        this.setLevel(level);
    }
    setLevel(level) {
        const prefix = this.prefix ? this.prefix + ' %s' : '';
        this.level = level;
        this.verbose = ["verbose"].includes(level) ? prefix ? console.log.bind(console, prefix) : console.log.bind(console) : () => { };
        this.log = ["verbose", "log"].includes(level) ? prefix ? console.log.bind(console, prefix) : console.log.bind(console) : () => { };
        this.warn = ["verbose", "log", "warn"].includes(level) ? prefix ? console.warn.bind(console, prefix) : console.warn.bind(console) : () => { };
        this.error = ["verbose", "log", "warn", "error"].includes(level) ? prefix ? console.error.bind(console, prefix) : console.error.bind(console) : () => { };
        this.write = (text) => {
            const isRunKit = typeof process_1.default !== 'undefined' && process_1.default.env && typeof process_1.default.env.RUNKIT_ENDPOINT_PATH === 'string';
            if (text && isRunKit) {
                text.split('\n').forEach(line => console.log(line)); // Logs each line separately
            }
            else {
                console.log(text);
            }
        };
    }
}
exports.DebugLogger = DebugLogger;
//# sourceMappingURL=debug.js.map