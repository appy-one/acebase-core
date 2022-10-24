export interface IType {
    typeOf: string;
    instanceOf?: Function;
    value?: string | number | boolean | bigint | null;
    genericTypes?: IType[];
    children?: IProperty[];
    matches?: RegExp;
}
export interface IProperty {
    name: string;
    optional: boolean;
    wildcard: boolean;
    types: IType[];
}
export interface ISchemaCheckResult {
    ok: boolean;
    reason?: string;
}
export declare class SchemaDefinition {
    readonly source: string | object;
    readonly text: string;
    readonly type: IType;
    constructor(definition: string | object);
    check(path: string, value: any, partial: boolean, trailKeys?: Array<string | number>): ISchemaCheckResult;
}
//# sourceMappingURL=schema.d.ts.map