export function cloneObject(original: object): object
export function compareValues(val1: any, val2: any): TCompareResult
export type TCompareResult = 'identical'|'added'|'removed'|'changed'|{ added: string[], removed: string[], changed: Array<{ key: string, change: TCompareResult }>, forChild(key: string|number): TCompareResult };
export function defer(fn: Function);
