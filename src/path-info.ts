function getPathKeys(path: string): Array<string|number> {
    path = path.replace(/\[/g, '/[').replace(/^\/+/, '').replace(/\/+$/, ''); // Replace [ with /[, remove leading slashes, remove trailing slashes
    if (path.length === 0) { return []; }
    let keys = path.split('/');
    return keys.map(key => {
        return key.startsWith('[') ? parseInt(key.slice(1, -1)) : key;
    });
}

export class PathInfo {
    static get(path: string|Array<string|number>): PathInfo {
        return new PathInfo(path);
    }
    static getChildPath(path: string, childKey: string|number): string {
        // return getChildPath(path, childKey);
        return PathInfo.get(path).child(childKey).path;
    }
    static getPathKeys(path: string): Array<string|number> {
        return getPathKeys(path);
    }

    readonly path: string;
    readonly keys: Array<string|number>;
    constructor(path: string|Array<string|number>) {
        if (typeof path === 'string') {
            // this.path = path.replace(/^\/+/, '').replace(/\/+$/, '');
            this.keys = getPathKeys(path);
        }
        else if (path instanceof Array) {
            this.keys = path;
        }
        this.path = this.keys.reduce((path, key, i) => i === 0 ? `${key}` : typeof key === 'string' ? `${path}/${key}` : `${path}[${key}]`, '') as string;
    }
    get key(): string|number {
        return this.keys.length === 0 ? null : this.keys.slice(-1)[0] // getPathInfo(this.path).key;
    }
    get parent() {
        if (this.keys.length == 0) { return null; }
        const parentKeys = this.keys.slice(0, -1);
        return new PathInfo(parentKeys);
    }
    get parentPath(): string {
        return this.keys.length === 0 ? null : this.parent.path; //getPathInfo(this.path).parent;
    }
    child(childKey: string|number|Array<string|number>) {
        if (typeof childKey === 'string') {
            childKey = getPathKeys(childKey);
        }
        return new PathInfo(this.keys.concat(childKey));
    }
    childPath(childKey: string|number|Array<string|number>): string {
        return this.child(childKey).path;
    }
    get pathKeys(): Array<string|number> {
        return this.keys; //getPathKeys(this.path);
    }

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
    static extractVariables(varPath: string, fullPath: string): any {
        if (!varPath.includes('*') && !varPath.includes('$')) { 
            return []; 
        }
        // if (!this.equals(fullPath)) {
        //     throw new Error(`path does not match with the path of this PathInfo instance: info.equals(path) === false!`)
        // }
        const keys = getPathKeys(varPath);
        const pathKeys = getPathKeys(fullPath);
        let count = 0;
        const variables = {
            get length() { return count; }
        };
        keys.forEach((key, index) => {
            const pathKey = pathKeys[index];
            if (key === '*') {
                variables[count++] = pathKey;
            }
            else if (typeof key === 'string' && key[0] === '$') {
                variables[count++] = pathKey;
                // Set the $variable property
                variables[key] = pathKey;
                // Set friendly property name (without $)
                const varName = key.slice(1);
                if (typeof variables[varName] === 'undefined') {
                    variables[varName] = pathKey;
                }
            }
        });
        return variables;
    }

    /**
     * If varPath contains variables or wildcards, it will return a path with the variables replaced by the keys found in fullPath.
     * @example
     * PathInfo.fillVariables('users/$uid/posts/$postid', 'users/ewout/posts/post1/title') === 'users/ewout/posts/post1'
     */
    static fillVariables(varPath: string, fullPath: string): string {
        if (varPath.indexOf('*') < 0 && varPath.indexOf('$') < 0) { 
            return varPath; 
        }
        const keys = getPathKeys(varPath);
        const pathKeys = getPathKeys(fullPath);
        let merged = keys.map((key, index) => {
            if (key === pathKeys[index] || index >= pathKeys.length) {
                return key;
            }
            else if (typeof key === 'string' && (key === '*' || key[0] === '$')) {
                return pathKeys[index];
            }
            else {
                throw new Error(`Path "${fullPath}" cannot be used to fill variables of path "${varPath}" because they do not match`);
            }
        });
        let mergedPath = '';
        merged.forEach(key => {
            if (typeof key === 'number') { 
                mergedPath += `[${key}]`; 
            }
            else { 
                if (mergedPath.length > 0) { mergedPath += '/'; }
                mergedPath += key;
            }
        });
        return mergedPath;
    }

    /**
     * Replaces all variables in a path with the values in the vars argument
     * @param varPath path containing variables
     * @param vars variables object such as one gotten from PathInfo.extractVariables
     */
    static fillVariables2(varPath: string, vars: any): string {
        if (typeof vars !== 'object' || Object.keys(vars).length === 0) {
            return varPath; // Nothing to fill
        }
        let pathKeys = getPathKeys(varPath);
        let n = 0;
        const targetPath = pathKeys.reduce<string>((path, key) => { 
            if (typeof key === 'string' && (key === '*' || key.startsWith('$'))) {
                return PathInfo.getChildPath(path, vars[n++]);
            }
            else {
                return PathInfo.getChildPath(path, key);
            }
        }, '');
        return targetPath;
    }

    /**
     * Checks if a given path matches this path, eg "posts/*\/title" matches "posts/12344/title" and "users/123/name" matches "users/$uid/name"
     */
    equals(otherPath: string|PathInfo): boolean {
        const other = otherPath instanceof PathInfo ? otherPath : new PathInfo(otherPath);
        if (this.path === other.path) { return true; } // they are identical
        if (this.keys.length !== other.keys.length) { return false; }
        return this.keys.every((key, index) => {
            const otherKey = other.keys[index];
            return otherKey === key 
                || (typeof otherKey === 'string' && (otherKey === "*" || otherKey[0] === '$'))
                || (typeof key === 'string' && (key === "*" ||  key[0] === '$'));
        });
    }

    /**
     * Checks if a given path is an ancestor, eg "posts" is an ancestor of "posts/12344/title"
     */
    isAncestorOf(descendantPath: string|PathInfo): boolean {
        const descendant = descendantPath instanceof PathInfo ? descendantPath : new PathInfo(descendantPath);
        if (descendant.path === '' || this.path === descendant.path) { return false; }
        if (this.path === '') { return true; }
        if (this.keys.length >= descendant.keys.length) { return false; }
        return this.keys.every((key, index) => {
            const otherKey = descendant.keys[index];
            return otherKey === key 
                || (typeof otherKey === 'string' && (otherKey === "*" || otherKey[0] === '$'))
                || (typeof key === 'string' && (key === "*" ||  key[0] === '$'));
        });
    }

    /**
     * Checks if a given path is a descendant, eg "posts/1234/title" is a descendant of "posts"
     */
    isDescendantOf(ancestorPath: string|PathInfo): boolean {
        const ancestor = ancestorPath instanceof PathInfo ? ancestorPath : new PathInfo(ancestorPath);
        if (this.path === '' || this.path === ancestor.path) { return false; }
        if (ancestorPath === '') { return true; }
        if (ancestor.keys.length >= this.keys.length) { return false; }
        return ancestor.keys.every((key, index) => {
            const otherKey = this.keys[index];
            return otherKey === key 
                || (typeof otherKey === 'string' && (otherKey === "*" || otherKey[0] === '$'))
                || (typeof key === 'string' && (key === "*" ||  key[0] === '$'));
        });
    }

    /**
     * Checks if the other path is on the same trail as this path. Paths on the same trail if they share a
     * common ancestor. Eg: "posts" is on the trail of "posts/1234/title" and vice versa.
     */
    isOnTrailOf(otherPath: string|PathInfo): boolean {
        const other = otherPath instanceof PathInfo ? otherPath : new PathInfo(otherPath);
        if (this.path.length === 0 || other.path.length === 0) { return true; }
        if (this.path === other.path) { return true; }
        return this.pathKeys.every((key, index) => {
            if (index >= other.keys.length) { return true; }
            const otherKey = other.keys[index];
            return otherKey === key 
                || (typeof otherKey === 'string' && (otherKey === "*" || otherKey[0] === '$'))
                || (typeof key === 'string' && (key === "*" ||  key[0] === '$'));
        });
    }

    /**
     * Checks if a given path is a direct child, eg "posts/1234/title" is a child of "posts/1234"
     */
    isChildOf(otherPath: string|PathInfo): boolean {
        const other = otherPath instanceof PathInfo ? otherPath : new PathInfo(otherPath);
        if (this.path === '') { return false; } // If our path is the root, it's nobody's child...
        return this.parent.equals(other);
    }

    /**
     * Checks if a given path is its parent, eg "posts/1234" is the parent of "posts/1234/title"
     */
     isParentOf(otherPath: string|PathInfo): boolean {
        const other = otherPath instanceof PathInfo ? otherPath : new PathInfo(otherPath);
        if (other.path === '') { return false; } // If the other path is the root, this path cannot be its parent
        return this.equals(other.parent);
    }
}