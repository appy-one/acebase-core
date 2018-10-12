const debug = {
    setLevel(level) {
        this.log = ["log"].indexOf(level) >= 0 ? console.log.bind(console) : ()=>{};
        this.warn = ["log", "warn"].indexOf(level) >= 0 ? console.warn.bind(console) : ()=>{};
        this.error = ["log", "warn", "error"].indexOf(level) >= 0 ? console.error.bind(console) : ()=>{};
    }
};
debug.setLevel("log"); // default

module.exports = debug;