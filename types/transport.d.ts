export type SerializedDataType = 'date'|'binary'|'reference'|'regexp'|'array';
export type SerializedDataMap = { [path: string]: SerializedDataType };
export type SerializedValue =  { map?: SerializedDataType | SerializedDataMap, val: any };

export type V2SerializedPrimitive = string|number|boolean;
export type V2SerializedDate = { '.type': 'date'; '.val': string }
export type V2SerializedBinary = { '.type': 'binary'; '.val': string };
export type V2SerializedReference = { '.type': 'reference'; '.val': string };
export type V2SerializedRegExp = { '.type': 'regexp'; '.val': { pattern: string; flags: string } };
export type V2SerializedPartialArray = { '.type': 'array'; [index: string]: any };
export type V2SerializedObject = { [key: string]: V2SerializedValue };
export type V2SerializedArray = V2SerializedValue[];
export type V2SerializedValue = V2SerializedPrimitive|V2SerializedDate|V2SerializedBinary|V2SerializedReference|V2SerializedRegExp|V2SerializedPartialArray|V2SerializedObject|V2SerializedArray;
export abstract class Transport {
    static serialize(obj: any): any
    static deserialize(obj: any): any
    static serialize2(obj: any): any
    static deserialize2(obj: any): any
}