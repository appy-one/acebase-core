export declare type SerializedDataType = 'date' | 'binary' | 'reference' | 'regexp' | 'array' | 'bigint';
export declare type SerializedDataMap = {
    [path: string]: SerializedDataType;
};
export declare type SerializedValue = {
    map?: SerializedDataType | SerializedDataMap;
    val: any;
};
export declare type V2SerializedPrimitive = string | number | boolean;
export declare type V2SerializedDate = {
    '.type': 'date';
    '.val': string;
};
export declare type V2SerializedBinary = {
    '.type': 'binary';
    '.val': string;
};
export declare type V2SerializedReference = {
    '.type': 'reference';
    '.val': string;
};
export declare type V2SerializedRegExp = {
    '.type': 'regexp';
    '.val': string | {
        pattern: string;
        flags: string;
    };
};
export declare type V2SerializedPartialArray = {
    '.type': 'array';
    [index: string]: any;
};
export declare type V2SerializedBigInt = {
    '.type': 'bigint';
    '.val': string;
};
export declare type V2SerializedObject = {
    [key: string]: V2SerializedValue;
};
export declare type V2SerializedArray = V2SerializedValue[];
export declare type V2SerializedValue = V2SerializedPrimitive | V2SerializedDate | V2SerializedBinary | V2SerializedReference | V2SerializedRegExp | V2SerializedPartialArray | V2SerializedBigInt | V2SerializedObject | V2SerializedArray;
/**
 * Original deserialization method using global `map` and `val` properties
 * @param data
 * @returns
 */
export declare const deserialize: (data: SerializedValue) => any;
/**
 * Function to detect the used serialization method with for the given object
 * @param data
 * @returns
 */
export declare const detectSerializeVersion: (data: any) => 1 | 2;
/**
 * Original serialization method using global `map` and `val` properties
 * @param data
 * @returns
 */
export declare const serialize: (obj: any) => SerializedValue;
/**
 * New serialization method using inline `.type` and `.val` properties
 * @param obj
 * @returns
 */
export declare const serialize2: (obj: any) => V2SerializedValue;
/**
 * New deserialization method using inline `.type` and `.val` properties
 * @param obj
 * @returns
 */
export declare const deserialize2: (data: V2SerializedValue) => any;
