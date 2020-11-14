class DebugLogger {
    constructor(level = "log", prefix = '') {
        this.prefix = prefix;
        this.setLevel(level);
    }
    setLevel(level) {
        const prefix = this.prefix ? this.prefix : '';
        this.level = level;
        this.verbose = ["verbose"].includes(level) ? prefix ? console.log.bind(console, prefix) : console.log.bind(console) : () => {};
        this.log = ["verbose", "log"].includes(level) ? prefix ? console.log.bind(console, prefix) : console.log.bind(console) : () => {};
        this.warn = ["verbose", "log", "warn"].includes(level) ? prefix ? console.warn.bind(console, prefix) : console.warn.bind(console) : () => {};
        this.error = ["verbose", "log", "warn", "error"].includes(level) ? prefix ? console.error.bind(console, prefix) : console.error.bind(console) : () => {};
        this.write = console.log.bind(console);
    }
}

module.exports = DebugLogger;