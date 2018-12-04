
/**
 * 
 * @param {string} path 
 * @returns {Array<string|number>}
 */
function getPathKeys(path) {
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
    if (path.length === 0) {
        if (typeof key === "number") { throw new TypeError("Cannot add array index to root path!"); }
        return key;
    }
    if (typeof key === "number") {
        return `${path}[${key}]`;
    }
    return `${path}/${key}`;
}

class PathInfo {
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

    /**
     * Checks if a given path is an ancestor, eg "posts" is an ancestor of "posts/12344/title"
     * @param {string} otherPath 
     * @returns {boolean}
     */
    isAncestorOf(otherPath) {
        if (otherPath === '' || this.path === otherPath || !otherPath.startsWith(this.path)) { return false; }
        if (this.path === '') { return true; }
        const ancestorKeys = getPathKeys(this.path);
        const descendantKeys = getPathKeys(otherPath);
        if (ancestorKeys.length > descendantKeys.length) { return false; }
        return ancestorKeys.every((key, index) => descendantKeys[index] === key);
    }

    /**
     * Checks if a given path is a descendant, eg "posts/1234/title" is a descendant of "posts"
     * @param {string} otherPath 
     * @returns {boolean}
     */
    isDescendantOf(otherPath) {
        if (this.path === '' || this.path === otherPath || !this.path.startsWith(otherPath)) { return false; }
        if (otherPath === '') { return true; }
        const ancestorKeys = getPathKeys(otherPath);
        const descendantKeys = getPathKeys(this.path);
        if (ancestorKeys.length > descendantKeys.length) { return false; }
        return ancestorKeys.every((key, index) => descendantKeys[index] === key);
    }

    /**
     * Checks if a given path is a direct child, eg "posts/1234/title" is a child of "posts/1234"
     * @param {string} otherPath 
     * @returns {boolean}
     */
    isChildOf(otherPath) {
        return getPathInfo(this.path).parent === otherPath;
    }

    /**
     * Checks if a given path is its parent, eg "posts/1234" is the parent of "posts/1234/title"
     * @param {string} otherPath 
     * @returns {boolean}
     */
    isParentOf(otherPath) {
        return getPathInfo(otherPath).parent === this.path;
    }
}

module.exports = { getPathInfo, getChildPath, getPathKeys, PathInfo };