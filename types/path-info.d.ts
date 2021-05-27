export class PathInfo {
    static get(path: string): PathInfo
    static getChildPath(path: string, childKey:string|number): string
    static getPathKeys(path: string): Array<string|number>
    static extractVariables(varPath: string, fullPath: string): Array<{name?:string, value:string|number}>
    static fillVariables(varPath: string, fullPath: string) : string
    static fillVariables2(varPath: string, vars: any) : string
    constructor(path: string)
    readonly key: string|number
    readonly parentPath: string
    childPath(childKey: string|number): string
    readonly pathKeys: Array<string|number>
    equals(otherPath: string): boolean
    isAncestorOf(otherPath: string): boolean
    isDescendantOf(otherPath: string): boolean
    isChildOf(otherPath: string): boolean
    isParentOf(otherPath: string): boolean
    isOnTrailOf(otherPath: string): boolean
}