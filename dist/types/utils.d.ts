/**
 * Avoiding usage of Node's `Buffer` to prevent browser polyfills being used by bundlers
 */
export interface TypedArrayLike {
    byteLength: number;
    buffer: ArrayBuffer;
    [index: number]: number;
}
export type TypedArray = Uint8Array | Uint16Array | Uint32Array;
export declare function numberToBytes(number: number): number[];
export declare function bytesToNumber(bytes: TypedArrayLike | TypedArray | number[]): number;
export declare const bigintToBytes: (number: bigint) => number[];
export declare const bytesToBigint: (bytes: TypedArrayLike | TypedArray | number[]) => bigint;
/**
 * Converts a string to a utf-8 encoded Uint8Array
 */
export declare function encodeString(str: string): Uint8Array;
/**
 * Converts a utf-8 encoded buffer to string
 */
export declare function decodeString(buffer: TypedArrayLike | TypedArray | number[]): string;
export declare function concatTypedArrays<T extends TypedArray>(a: T, b: TypedArray): T;
export declare function cloneObject(original: any, stack?: any[]): any;
export declare function valuesAreEqual(val1: any, val2: any): boolean;
export declare class ObjectDifferences {
    added: ObjectProperty[];
    removed: ObjectProperty[];
    changed: Array<{
        key: ObjectProperty;
        change: ValueCompareResult;
    }>;
    constructor(added: ObjectProperty[], removed: ObjectProperty[], changed: Array<{
        key: ObjectProperty;
        change: ValueCompareResult;
    }>);
    forChild(key: ObjectProperty): ValueCompareResult;
}
export type ValueCompareResult = 'identical' | 'added' | 'removed' | 'changed' | ObjectDifferences;
export type ObjectProperty = string | number;
/**
 * @deprecated Use `ValueCompareResult`
 */
export type TCompareResult = ValueCompareResult;
export declare function compareValues(oldVal: any, newVal: any, sortedResults?: boolean): ValueCompareResult;
export declare function getMutations(oldVal: any, newVal: any, sortedResults?: boolean): Array<{
    target: ObjectProperty[];
    prev: any;
    val: any;
}>;
export declare function getChildValues(childKey: ObjectProperty, oldValue: any, newValue: any): {
    oldValue: any;
    newValue: any;
};
export declare function defer(fn: (...args: any[]) => any): void;
export declare function getGlobalObject(): any;
//# sourceMappingURL=utils.d.ts.map