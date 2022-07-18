export interface IType {
    typeOf: string,
    // eslint-disable-next-line @typescript-eslint/ban-types
    instanceOf?: Function,
    value?:string|number|boolean|null,
    genericTypes?: IType[],
    children?: IProperty[],
    matches?: RegExp
}

export interface IProperty {
    name: string,
    optional: boolean,
    wildcard: boolean,
    types: IType[]
}

export interface ISchemaCheckResult {
    ok: boolean,
    reason?: string
}

export class SchemaDefinition {
    readonly source: string|object;
    readonly text: string;
    readonly type: IType;
    constructor(definition: string|object)
    check(path: string, value: any, partial: boolean, trailKeys?: Array<string|number>) : ISchemaCheckResult
}
