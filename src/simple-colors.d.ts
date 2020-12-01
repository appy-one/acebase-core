export declare enum ColorStyle {
    reset = "reset",
    bold = "bold",
    dim = "dim",
    italic = "italic",
    underline = "underline",
    inverse = "inverse",
    hidden = "hidden",
    strikethrough = "strikethrough",
    black = "black",
    red = "red",
    green = "green",
    yellow = "yellow",
    blue = "blue",
    magenta = "magenta",
    cyan = "cyan",
    grey = "grey",
    bgBlack = "bgBlack",
    bgRed = "bgRed",
    bgGreen = "bgGreen",
    bgYellow = "bgYellow",
    bgBlue = "bgBlue",
    bgMagenta = "bgMagenta",
    bgCyan = "bgCyan",
    bgWhite = "bgWhite",
    bgGrey = "bgGrey"
}
export declare function Colorize(str: string, style: ColorStyle | ColorStyle[]): string;
declare global {
    interface String {
        colorize(style: ColorStyle | ColorStyle[]): string;
    }
}
