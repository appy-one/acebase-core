interface NodeBuffer { byteLength: number; buffer: ArrayBuffer }
type TypedArray = NodeBuffer | Uint8Array | Uint16Array | Uint32Array;
export function cloneObject(original: object): object;
export function numberToBytes(number: number) : number[];
export function bigintToBytes(number: bigint): number[];
export function bytesToNumber(bytes: NodeBuffer | number[]): number;
export function bytesToBigint(bytes: NodeBuffer | number[]): bigint;
/**
 * Converts a string to a utf-8 encoded Uint8Array
 */
export function encodeString(str: string) : Uint8Array;
/**
 * Converts a utf-8 encoded buffer to string
 */
export function decodeString(buffer: TypedArray | number[]): string;
export function concatTypedArrays<T extends TypedArray>(a: T, b: TypedArray): T;
export function valuesAreEqual(val1: any, val2: any): boolean;
export type TCompareResult = 'identical'|'added'|'removed'|'changed'|{ added: string[], removed: string[], changed: Array<{ key: string, change: TCompareResult }>, forChild(key: string|number): TCompareResult };
export function compareValues(val1: any, val2: any): TCompareResult;
type ObjectProperty = string|number;
export function getMutations(oldVal: any, newVal: any, sortedResults?: boolean): Array<{ target: ObjectProperty[], prev: any, val: any }>;
export function getChildValues(childKey:ObjectProperty, oldValue: any, newValue: any): { oldValue: any; newValue: any; };
export function defer(fn: (...args: any[]) => any): void;
