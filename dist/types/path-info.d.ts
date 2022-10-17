export declare class PathInfo {
    static get(path: string | Array<string | number>): PathInfo;
    static getChildPath(path: string, childKey: string | number): string;
    static getPathKeys(path: string): Array<string | number>;
    readonly path: string;
    readonly keys: Array<string | number>;
    constructor(path: string | Array<string | number>);
    get key(): string | number;
    get parent(): PathInfo;
    get parentPath(): string;
    child(childKey: string | number | Array<string | number>): PathInfo;
    childPath(childKey: string | number | Array<string | number>): string;
    get pathKeys(): Array<string | number>;
    /**
     * If varPath contains variables or wildcards, it will return them with the values found in fullPath
     * @param {string} varPath path containing variables such as * and $name
     * @param {string} fullPath real path to a node
     * @returns {{ [index: number]: string|number, [variable: string]: string|number }} returns an array-like object with all variable values. All named variables are also set on the array by their name (eg vars.uid and vars.$uid)
     * @example
     * PathInfo.extractVariables('users/$uid/posts/$postid', 'users/ewout/posts/post1/title') === {
     *  0: 'ewout',
     *  1: 'post1',
     *  uid: 'ewout', // or $uid
     *  postid: 'post1' // or $postid
     * };
     *
     * PathInfo.extractVariables('users/*\/posts/*\/$property', 'users/ewout/posts/post1/title') === {
     *  0: 'ewout',
     *  1: 'post1',
     *  2: 'title',
     *  property: 'title' // or $property
     * };
     *
     * PathInfo.extractVariables('users/$user/friends[*]/$friend', 'users/dora/friends[4]/diego') === {
     *  0: 'dora',
     *  1: 4,
     *  2: 'diego',
     *  user: 'dora', // or $user
     *  friend: 'diego' // or $friend
     * };
    */
    static extractVariables(varPath: string, fullPath: string): any;
    /**
     * If varPath contains variables or wildcards, it will return a path with the variables replaced by the keys found in fullPath.
     * @example
     * PathInfo.fillVariables('users/$uid/posts/$postid', 'users/ewout/posts/post1/title') === 'users/ewout/posts/post1'
     */
    static fillVariables(varPath: string, fullPath: string): string;
    /**
     * Replaces all variables in a path with the values in the vars argument
     * @param varPath path containing variables
     * @param vars variables object such as one gotten from PathInfo.extractVariables
     */
    static fillVariables2(varPath: string, vars: any): string;
    /**
     * Checks if a given path matches this path, eg "posts/*\/title" matches "posts/12344/title" and "users/123/name" matches "users/$uid/name"
     */
    equals(otherPath: string | PathInfo): boolean;
    /**
     * Checks if a given path is an ancestor, eg "posts" is an ancestor of "posts/12344/title"
     */
    isAncestorOf(descendantPath: string | PathInfo): boolean;
    /**
     * Checks if a given path is a descendant, eg "posts/1234/title" is a descendant of "posts"
     */
    isDescendantOf(ancestorPath: string | PathInfo): boolean;
    /**
     * Checks if the other path is on the same trail as this path. Paths on the same trail if they share a
     * common ancestor. Eg: "posts" is on the trail of "posts/1234/title" and vice versa.
     */
    isOnTrailOf(otherPath: string | PathInfo): boolean;
    /**
     * Checks if a given path is a direct child, eg "posts/1234/title" is a child of "posts/1234"
     */
    isChildOf(otherPath: string | PathInfo): boolean;
    /**
     * Checks if a given path is its parent, eg "posts/1234" is the parent of "posts/1234/title"
     */
    isParentOf(otherPath: string | PathInfo): boolean;
}
