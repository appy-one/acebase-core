"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ascii85 = void 0;
const c = function (input, length, result) {
    var i, j, n, b = [0, 0, 0, 0, 0];
    for (i = 0; i < length; i += 4) {
        n = ((input[i] * 256 + input[i + 1]) * 256 + input[i + 2]) * 256 + input[i + 3];
        if (!n) {
            result.push("z");
        }
        else {
            for (j = 0; j < 5; b[j++] = n % 85 + 33, n = Math.floor(n / 85))
                ;
        }
        result.push(String.fromCharCode(b[4], b[3], b[2], b[1], b[0]));
    }
};
function encode(arr) {
    // summary: encodes input data in ascii85 string
    // input: ArrayLike
    var input = arr;
    var result = [], remainder = input.length % 4, length = input.length - remainder;
    c(input, length, result);
    if (remainder) {
        var t = new Uint8Array(4);
        t.set(input.slice(length), 0);
        c(t, 4, result);
        var x = result.pop();
        if (x == "z") {
            x = "!!!!!";
        }
        result.push(x.substr(0, remainder + 1));
    }
    var ret = result.join(""); // String
    ret = '<~' + ret + '~>';
    return ret;
}
exports.ascii85 = {
    encode: function (arr) {
        if (arr instanceof ArrayBuffer) {
            arr = new Uint8Array(arr, 0, arr.byteLength);
        }
        return encode(arr);
    },
    decode: function (input) {
        // summary: decodes the input string back to an ArrayBuffer
        // input: String: the input string to decode
        if (!input.startsWith('<~') || !input.endsWith('~>')) {
            throw new Error('Invalid input string');
        }
        input = input.substr(2, input.length - 4);
        var n = input.length, r = [], b = [0, 0, 0, 0, 0], i, j, t, x, y, d;
        for (i = 0; i < n; ++i) {
            if (input.charAt(i) == "z") {
                r.push(0, 0, 0, 0);
                continue;
            }
            for (j = 0; j < 5; ++j) {
                b[j] = input.charCodeAt(i + j) - 33;
            }
            d = n - i;
            if (d < 5) {
                for (j = d; j < 4; b[++j] = 0)
                    ;
                b[d] = 85;
            }
            t = (((b[0] * 85 + b[1]) * 85 + b[2]) * 85 + b[3]) * 85 + b[4];
            x = t & 255;
            t >>>= 8;
            y = t & 255;
            t >>>= 8;
            r.push(t >>> 8, t & 255, y, x);
            for (j = d; j < 5; ++j, r.pop())
                ;
            i += 4;
        }
        const data = new Uint8Array(r);
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }
};
//# sourceMappingURL=ascii85.js.map