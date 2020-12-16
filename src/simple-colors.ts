import process from './process';

// See from https://en.wikipedia.org/wiki/ANSI_escape_code
const FontCode = {
    bold: 1,
    dim: 2,
    italic: 3,
    underline: 4,
    inverse: 7,
    hidden: 8,
    strikethrough: 94
}
const ColorCode = {
    black: 30,
    red: 31,
    green: 32,
    yellow: 33,
    blue: 34,
    magenta: 35,
    cyan: 36,
    white: 37, // Light grey
    grey: 90,
    // Bright colors:
    brightRed: 91,
    // TODO, other bright colors
}
const BgColorCode = {
    bgBlack: 40,
    bgRed: 41,
    bgGreen: 42,
    bgYellow: 43,
    bgBlue: 44,
    bgMagenta: 45,
    bgCyan: 46,
    bgWhite: 47,
    bgGrey: 100,
    bgBrightRed: 101,
    // TODO, other bright colors
}
const ResetCode = {
    all: 0,
    color: 39,
    background: 49,
    bold: 22,
    dim: 22,
    italic: 23,
    underline: 24,
    inverse: 27,
    hidden: 28,
    strikethrough: 29
}
export enum ColorStyle {
    reset = 'reset', 
    bold = 'bold', dim = 'dim', italic = 'italic', underline = 'underline', inverse = 'inverse', hidden = 'hidden', strikethrough = 'strikethrough',
    black = 'black', red = 'red', green = 'green', yellow = 'yellow', blue = 'blue', magenta = 'magenta', cyan = 'cyan', grey = 'grey',
    bgBlack = 'bgBlack', bgRed = 'bgRed', bgGreen = 'bgGreen', bgYellow = 'bgYellow', bgBlue = 'bgBlue', bgMagenta = 'bgMagenta', bgCyan = 'bgCyan', bgWhite = 'bgWhite', bgGrey = 'bgGrey',
}
export function ColorsSupported() {
    // Checks for basic color support
    if (typeof process === 'undefined' || !process.stdout || !process.env || !process.platform || process.platform as string === 'browser') { return false; }
    if (process.platform === 'win32') { return true; }
    const env = process.env;
    if (env.COLORTERM) { return true; }
    if (env.TERM === 'dumb') { return false; }
    if (env.CI || env.TEAMCITY_VERSION) { return !!env.TRAVIS; }
    if (['iTerm.app','HyperTerm','Hyper','MacTerm','Apple_Terminal','vscode'].includes(env.TERM_PROGRAM)) { return true; }
    if (/^xterm-256|^screen|^xterm|^vt100|color|ansi|cygwin|linux/i.test(env.TERM)) { return true; }
    return false;
}
let _enabled = ColorsSupported();
export function SetColorsEnabled(enabled: boolean) {
    _enabled = ColorsSupported() && enabled;
}
export function Colorize(str: string, style:ColorStyle|ColorStyle[]) {
    if (!_enabled) { return str; }
    const openCodes = [], closeCodes = [];
    const addStyle = style => {
        if (style === ColorStyle.reset) {
            openCodes.push(ResetCode.all);
        }
        else if (style in FontCode) {
            openCodes.push(FontCode[style]);
            closeCodes.push(ResetCode[style]);
        }
        else if (style in ColorCode) {
            openCodes.push(ColorCode[style]);
            closeCodes.push(ResetCode.color);
        }
        else if (style in BgColorCode) {
            openCodes.push(BgColorCode[style]);
            closeCodes.push(ResetCode.background);
        }
    };
    if (style instanceof Array) { 
        style.forEach(addStyle);
    }
    else {
        addStyle(style);
    }
    // const open = '\u001b[' + openCodes.join(';') + 'm';
    // const close = '\u001b[' + closeCodes.join(';') + 'm';
    const open = openCodes.map(code => '\u001b[' + code + 'm').join('');
    const close = closeCodes.map(code => '\u001b[' + code + 'm').join('');
    // return open + str + close;
    return str.split('\n').map(line => open + line + close).join('\n');
}

// Add colorize to string prototype
declare global {
    interface String {
        colorize(style:ColorStyle|ColorStyle[]): string;
    }
}
String.prototype.colorize = function (style:ColorStyle|ColorStyle[]) {
    return Colorize(this, style);
}