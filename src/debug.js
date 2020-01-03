class DebugLogger {
    constructor(level = "log", prefix = '') {
        this.prefix = prefix;
        this.setLevel(level);
    }
    setLevel(level) {
        const prefix = this.prefix ? this.prefix : '';
        this.level = level;
        this.verbose = ["verbose"].includes(level) ? console.log.bind(console, prefix) : () => {};
        this.log = ["verbose", "log"].includes(level) ? console.log.bind(console, prefix) : () => {};
        this.warn = ["verbose", "log", "warn"].includes(level) ? console.warn.bind(console, prefix) : () => {};
        this.error = ["verbose", "log", "warn", "error"].includes(level) ? console.error.bind(console, prefix) : () => {};
        this.write = console.log.bind(console);
    }
}

module.exports = DebugLogger;