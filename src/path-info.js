/**
 * 
 * @param {string} path 
 * @returns {Array<string|number>}
 */
function getPathKeys(path) {
    path = path.replace(/^\//, ""); // Remove leading slash
    if (path.length === 0) { return []; }
    let keys = path.replace(/\[/g, "/[").split("/");
    keys.forEach((key, index) => {
        if (key.startsWith("[")) { 
            keys[index] = parseInt(key.substr(1, key.length - 2)); 
        }
    });
    return keys;
}

function getPathInfo(path) {
    path = path.replace(/^\//, ""); // Remove leading slash
    if (path.length === 0) {
        return { parent: null, key: "" };
    }
    const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("["));
    const parentPath = i < 0 ? "" : path.substr(0, i);
    let key = i < 0 ? path : path.substr(i);
    if (key.startsWith("[")) { 
        key = parseInt(key.substr(1, key.length - 2)); 
    }
    else if (key.startsWith("/")) {
        key = key.substr(1); // Chop off leading slash
    }
    if (parentPath === path) {
        parentPath = null;
    }
    return {
        parent: parentPath,
        key
    };
}

/**
 * 
 * @param {string} path 
 * @param {string|number} key 
 * @returns {string}
 */
function getChildPath(path, key) {
    path = path.replace(/^\//, ""); // Remove leading slash
    key = typeof key === "string" ? key.replace(/^\//, "") : key; // Remove leading slash
    if (path.length === 0) {
        if (typeof key === "number") { throw new TypeError("Cannot add array index to root path!"); }
        return key;
    }
    if (typeof key === "string" && key.length === 0) {
        return path;
    }
    if (typeof key === "number") {
        return `${path}[${key}]`;
    }
    return `${path}/${key}`;
}
//const _pathVariableRegex =  /^\$(\{[a-z0-9]+\})$/i;

class PathInfo {
    /** @returns {PathInfo} */
    static get(path) {
        return new PathInfo(path);
    }

    /** @returns {string} */
    static getChildPath(path, childKey) {
        return getChildPath(path, childKey);
    }

    /** @returns {Array<string|number>} */
    static getPathKeys(path) {
        return getPathKeys(path);
    }

    /**
     * @param {string} path 
     */
    constructor(path) {
        this.path = path;
    }

    /** @type {string|number} */
    get key() {
        return getPathInfo(this.path).key;
    }

    /** @type {string} */
    get parentPath() {
        return getPathInfo(this.path).parent;
    }

    /** 
     * @param {string|number} childKey
     * @returns {string} 
     * */
    childPath(childKey) {
        return getChildPath(`${this.path}`, childKey);
    }

    /** @returns {Array<string|number>} */
    get pathKeys() {
        return getPathKeys(this.path);
    }

    // /**
    //  * If varPath contains variables or wildcards, it will return them with the values found in fullPath
    //  * @param {string} varPath 
    //  * @param {string} fullPath 
    //  * @returns {Array<{ name?: string, value: string|number }>}
    //  * @example
    //  * PathInfo.extractVariables('users/$uid/posts/$postid', 'users/ewout/posts/post1/title') === [
    //  *  { name: '$uid', value: 'ewout' },
    //  *  { name: '$postid', value: 'post1' }
    //  * ];
    //  * 
    //  * PathInfo.extractVariables('users/*\/posts/*\/$property', 'users/ewout/posts/post1/title') === [
    //  *  { value: 'ewout' },
    //  *  { value: 'post1' },
    //  *  { name: '$property', value: 'title' }
    //  * ]
    //  */
    // static extractVariables(varPath, fullPath) {
    //     if (varPath.indexOf('*') < 0 && varPath.indexOf('$') < 0) { 
    //         return []; 
    //     }
    //     // if (!this.equals(fullPath)) {
    //     //     throw new Error(`path does not match with the path of this PathInfo instance: info.equals(path) === false!`)
    //     // }
    //     const keys = getPathKeys(varPath);
    //     const pathKeys = getPathKeys(fullPath);
    //     const variables = [];
    //     keys.forEach((key, index) => {
    //         const pathKey = pathKeys[index];
    //         if (key === '*') {
    //             variables.push({ value: pathKey });
    //         }
    //         else if (typeof key === 'string' && key[0] === '$') {
    //             variables.push({ name: key, value: pathKey });
    //         }
    //     });
    //     return variables;
    // }

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
    static extractVariables(varPath, fullPath) {
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
     * @param {string} varPath 
     * @param {string} fullPath 
     * @returns {string}
     * @example
     * PathInfo.fillVariables('users/$uid/posts/$postid', 'users/ewout/posts/post1/title') === 'users/ewout/posts/post1'
     */
    static fillVariables(varPath, fullPath) {
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
                throw new Error(`Path "${fullPath}" cannot be used to fill variables of path "${this.path}" because they do not match`);
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
     * @param {string} varPath path containing variables
     * @param {object} vars variables object such as one gotten from PathInfo.extractVariables
     */
    static fillVariables2(varPath, vars) {
        if (typeof vars !== 'object' || Object.keys(vars).length === 0) {
            return varPath; // Nothing to fill
        }
        let pathKeys = getPathKeys(varPath);
        let n = 0;
        const targetPath = pathKeys.reduce((path, key) => { 
            if (key === '*' || key.startsWith('$')) {
                key = vars[n++];
            }
            if (typeof key === 'number') {
                return `${path}[${key}]`;
            }
            else {
                return `${path}/${key}`;
            }
        }, '');
        return targetPath;
    }

    /**
     * Checks if a given path matches this path, eg "posts/*\/title" matches "posts/12344/title" and "users/123/name" matches "users/$uid/name"
     * @param {string} otherPath 
     * @returns {boolean}
     */
    equals(otherPath) {
        if (this.path === otherPath) { return true; } // they are identical
        const keys = this.pathKeys;
        const otherKeys = getPathKeys(otherPath);
        if (keys.length !== otherKeys.length) { return false; }
        return keys.every((key, index) => {
            const otherKey = otherKeys[index];
            return otherKey === key 
                || (typeof otherKey === 'string' && (otherKey === "*" || otherKey[0] === '$'))
                || (typeof key === 'string' && (key === "*" ||  key[0] === '$'));
        });
    }

    /**
     * Checks if a given path is an ancestor, eg "posts" is an ancestor of "posts/12344/title"
     * @param {string} otherPath 
     * @returns {boolean}
     */
    isAncestorOf(descendantPath) {
        if (descendantPath === '' || this.path === descendantPath) { return false; }
        if (this.path === '') { return true; }
        const ancestorKeys = this.pathKeys;
        const descendantKeys = getPathKeys(descendantPath);
        if (ancestorKeys.length >= descendantKeys.length) { return false; }
        return ancestorKeys.every((key, index) => {
            const otherKey = descendantKeys[index];
            return otherKey === key 
                || (typeof otherKey === 'string' && (otherKey === "*" || otherKey[0] === '$'))
                || (typeof key === 'string' && (key === "*" ||  key[0] === '$'));
        });
    }

    /**
     * Checks if a given path is a descendant, eg "posts/1234/title" is a descendant of "posts"
     * @param {string} otherPath 
     * @returns {boolean}
     */
    isDescendantOf(ancestorPath) {
        if (this.path === '' || this.path === ancestorPath) { return false; }
        if (ancestorPath === '') { return true; }
        const ancestorKeys = getPathKeys(ancestorPath);
        const descendantKeys = this.pathKeys;
        if (ancestorKeys.length >= descendantKeys.length) { return false; }
        return ancestorKeys.every((key, index) => {
            const otherKey = descendantKeys[index];
            return otherKey === key 
                || (typeof otherKey === 'string' && (otherKey === "*" || otherKey[0] === '$'))
                || (typeof key === 'string' && (key === "*" ||  key[0] === '$'));
        });
    }

    /**
     * Checks if the other path is on the same trail as this path. Paths on the same trail if they share a
     * common ancestor. Eg: "posts" is on the trail of "posts/1234/title" and vice versa.
     * @param {string} otherPath 
     */
    isOnTrailOf(otherPath) {
        if (this.path.length === 0 || otherPath.length === 0) { return true; }
        if (this.path === otherPath) { return true; }
        const otherKeys = getPathKeys(otherPath);
        return this.pathKeys.every((key, index) => {
            if (index >= otherKeys.length) { return true; }
            const otherKey = otherKeys[index];
            return otherKey === key 
                || (typeof otherKey === 'string' && (otherKey === "*" || otherKey[0] === '$'))
                || (typeof key === 'string' && (key === "*" ||  key[0] === '$'));
        });
    }

    /**
     * Checks if a given path is a direct child, eg "posts/1234/title" is a child of "posts/1234"
     * @param {string} otherPath 
     * @returns {boolean}
     */
    isChildOf(otherPath) {
        if (this.path === '') { return false; } // If our path is the root, it's nobody's child...
        const parentInfo = PathInfo.get(this.parentPath);
        return parentInfo.equals(otherPath);
    }

    /**
     * Checks if a given path is its parent, eg "posts/1234" is the parent of "posts/1234/title"
     * @param {string} otherPath 
     * @returns {boolean}
     */
    isParentOf(otherPath) {
        if (otherPath === '') { return false; } // If the other path is the root, this path cannot be its parent...
        const parentInfo = PathInfo.get(PathInfo.get(otherPath).parentPath);
        return parentInfo.equals(this.path);
    }
}

module.exports = { getPathInfo, getChildPath, getPathKeys, PathInfo };