export class PathInfo {
    static get(path: string): PathInfo
    static getChildPath(path: string, childKey:string|number): string
    static getPathKeys(path: string): Array<string|number>
    static extractVariables(varPath: string, fullPath: string): Array<{name?:string, value:string|number}>
    static fillVariables(varPath: string, fullPath: string) : string
    static fillVariables2(varPath: string, vars: any) : string
    constructor(path: string)
    readonly path: string
    readonly key: string|number
    readonly keys: Array<string|number>
    readonly parent: PathInfo
    readonly parentPath: string
    child(childKey: string|number): PathInfo
    childPath(childKey: string|number): string
    /** @deprecated use keys property */
    readonly pathKeys: Array<string|number>
    equals(otherPath: string|PathInfo): boolean
    isAncestorOf(otherPath: string|PathInfo): boolean
    isDescendantOf(otherPath: string|PathInfo): boolean
    isChildOf(otherPath: string|PathInfo): boolean
    isParentOf(otherPath: string|PathInfo): boolean
    isOnTrailOf(otherPath: string|PathInfo): boolean
}