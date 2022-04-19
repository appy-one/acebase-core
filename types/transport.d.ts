export type SerializedDataType = 'date'|'binary'|'reference'|'regexp'|'array';
export type SerializedDataMap = { [path: string]: SerializedDataType };
export type SerializedValue =  { map?: SerializedDataType | SerializedDataMap, val: any };
export abstract class Transport {
    static serialize(obj: any): any
    static deserialize(obj: any): any
}