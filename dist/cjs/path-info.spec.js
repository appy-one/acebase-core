"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path_info_1 = require("./path-info");
describe('PathInfo', function () {
    it('should remove start/end slashes', () => {
        expect(path_info_1.PathInfo.get('/').path).toEqual('');
        expect(path_info_1.PathInfo.get('/users/ewout/').path).toEqual('users/ewout');
    });
    it('.key', () => {
        expect(path_info_1.PathInfo.get('').key).toBeNull();
        expect(path_info_1.PathInfo.get('users').key).toEqual('users');
        expect(path_info_1.PathInfo.get('users/ewout').key).toEqual('ewout');
        expect(path_info_1.PathInfo.get('users/ewout/posts').key).toEqual('posts');
        expect(path_info_1.PathInfo.get('songs/song1/tags[0]').key).toEqual(0);
        expect(path_info_1.PathInfo.get('songs/song1/tags[0]/text').key).toEqual('text');
        expect(path_info_1.PathInfo.get('users/ewout/*').key).toEqual('*');
        expect(path_info_1.PathInfo.get('users/ewout/$var').key).toEqual('$var');
    });
    it('.parent', () => {
        const pathInfo = path_info_1.PathInfo.get('users/ewout/posts');
        expect(pathInfo.parent.path).toEqual('users/ewout');
        expect(path_info_1.PathInfo.get('').parent).toBeNull();
    });
    it('.parentPath', () => {
        const pathInfo = path_info_1.PathInfo.get('users/ewout/posts');
        expect(pathInfo.parentPath).toEqual('users/ewout');
        expect(path_info_1.PathInfo.get('').parentPath).toBeNull();
    });
    it('.child', () => {
        const pathInfo = path_info_1.PathInfo.get('users/ewout/posts');
        expect(pathInfo.child('post1').path).toEqual('users/ewout/posts/post1');
        expect(pathInfo.child('post1/title').path).toEqual('users/ewout/posts/post1/title');
        expect(pathInfo.child('/post1/title').path).toEqual('users/ewout/posts/post1/title');
        expect(pathInfo.child('/post1/title/').path).toEqual('users/ewout/posts/post1/title');
        expect(pathInfo.child(0).path).toEqual('users/ewout/posts[0]');
        expect(pathInfo.child('[0]/title').path).toEqual('users/ewout/posts[0]/title');
        expect(pathInfo.child('*').path).toEqual('users/ewout/posts/*');
    });
    it('.childPath', () => {
        const pathInfo = path_info_1.PathInfo.get('users/ewout/posts');
        expect(pathInfo.childPath('post1')).toEqual('users/ewout/posts/post1');
        expect(pathInfo.childPath('/post1')).toEqual('users/ewout/posts/post1');
        expect(pathInfo.childPath('/post1/')).toEqual('users/ewout/posts/post1');
        expect(pathInfo.childPath('post1/title')).toEqual('users/ewout/posts/post1/title');
        expect(pathInfo.childPath('*/title')).toEqual('users/ewout/posts/*/title');
    });
    it('.equals', () => {
        const pathInfo = path_info_1.PathInfo.get('users/ewout/posts');
        expect(pathInfo.equals('users/ewout/posts')).toBeTrue();
        expect(pathInfo.equals(path_info_1.PathInfo.get('users/ewout/posts'))).toBeTrue();
        expect(pathInfo.equals('users/ewout/address')).toBeFalse();
        expect(pathInfo.equals(path_info_1.PathInfo.get('users/ewout/address'))).toBeFalse();
        expect(pathInfo.equals('users/*/posts')).toBeTrue();
        expect(pathInfo.equals(path_info_1.PathInfo.get('users/*/posts'))).toBeTrue();
        expect(pathInfo.equals('users/*/$var')).toBeTrue();
        expect(pathInfo.equals(path_info_1.PathInfo.get('users/*/$var'))).toBeTrue();
    });
    it('.isParentOf', () => {
        const pathInfo = path_info_1.PathInfo.get('users/ewout/posts');
        expect(pathInfo.isParentOf('users')).toBeFalse();
        expect(pathInfo.isParentOf('users/ewout')).toBeFalse();
        expect(pathInfo.isParentOf('users/ewout/posts')).toBeFalse();
        expect(pathInfo.isParentOf('users/ewout/posts/post1')).toBeTrue();
        expect(pathInfo.isParentOf('users/ewout/posts/post1/title')).toBeFalse();
        // Wildcards:
        expect(pathInfo.isParentOf('*')).toBeFalse();
        expect(pathInfo.isParentOf('users/*')).toBeFalse();
        expect(pathInfo.isParentOf('users/*/posts')).toBeFalse();
        expect(pathInfo.isParentOf('users/*/posts/post1')).toBeTrue();
        expect(pathInfo.isParentOf('users/*/posts/post1/title')).toBeFalse();
        expect(pathInfo.isParentOf('users/ewout/*')).toBeFalse();
        expect(pathInfo.isParentOf('users/ewout/*/post1')).toBeTrue();
        expect(pathInfo.isParentOf('users/ewout/*/post1/title')).toBeFalse();
        // Variables:
        expect(pathInfo.isParentOf('$prop')).toBeFalse();
        expect(pathInfo.isParentOf('users/$uid')).toBeFalse();
        expect(pathInfo.isParentOf('users/$uid/posts')).toBeFalse();
        expect(pathInfo.isParentOf('users/$uid/posts/post1')).toBeTrue();
        expect(pathInfo.isParentOf('users/$uid/posts/post1/title')).toBeFalse();
        expect(pathInfo.isParentOf('users/ewout/$prop')).toBeFalse();
        expect(pathInfo.isParentOf('users/ewout/$prop/post1')).toBeTrue();
        expect(pathInfo.isParentOf('users/ewout/$prop/post1/title')).toBeFalse();
    });
    it('.isChildOf', () => {
        const pathInfo = path_info_1.PathInfo.get('users/ewout/posts');
        expect(pathInfo.isChildOf('users')).toBeFalse();
        expect(pathInfo.isChildOf('users/ewout')).toBeTrue();
        expect(pathInfo.isChildOf('users/ewout/posts')).toBeFalse();
        expect(pathInfo.isChildOf('users/ewout/posts/post1')).toBeFalse();
        // Wildcards:
        expect(pathInfo.isChildOf('*')).toBeFalse();
        expect(pathInfo.isChildOf('users/*')).toBeTrue();
        expect(pathInfo.isChildOf('users/*/posts')).toBeFalse();
        expect(pathInfo.isChildOf('*/ewout')).toBeTrue();
        expect(pathInfo.isChildOf('*/ewout/posts')).toBeFalse();
        // Variables:
        expect(pathInfo.isChildOf('$prop')).toBeFalse();
        expect(pathInfo.isChildOf('users/$uid')).toBeTrue();
        expect(pathInfo.isChildOf('users/$uid/posts')).toBeFalse();
        expect(pathInfo.isChildOf('$prop/ewout')).toBeTrue();
        expect(pathInfo.isChildOf('$prop/ewout/posts')).toBeFalse();
    });
    it('.isAncestorOf', () => {
        const pathInfo = path_info_1.PathInfo.get('users/ewout/posts');
        expect(pathInfo.isAncestorOf('users')).toBeFalse();
        expect(pathInfo.isAncestorOf('users/ewout')).toBeFalse();
        expect(pathInfo.isAncestorOf('users/ewout/posts')).toBeFalse();
        expect(pathInfo.isAncestorOf('users/ewout/posts/post1')).toBeTrue();
        expect(pathInfo.isAncestorOf('users/ewout/posts/post1/title')).toBeTrue();
        // Wildcards:
        expect(pathInfo.isAncestorOf('*')).toBeFalse();
        expect(pathInfo.isAncestorOf('users/*')).toBeFalse();
        expect(pathInfo.isAncestorOf('users/*/posts')).toBeFalse();
        expect(pathInfo.isAncestorOf('users/*/posts/post1')).toBeTrue();
        expect(pathInfo.isAncestorOf('users/*/posts/*/title')).toBeTrue();
        // Variables:
        expect(pathInfo.isAncestorOf('*')).toBeFalse();
        expect(pathInfo.isAncestorOf('users/$uid')).toBeFalse();
        expect(pathInfo.isAncestorOf('users/$uid/posts')).toBeFalse();
        expect(pathInfo.isAncestorOf('users/$uid/posts/post1')).toBeTrue();
        expect(pathInfo.isAncestorOf('users/$uid/posts/$post/title')).toBeTrue();
    });
    it('.isDescendantOf', () => {
        const pathInfo = path_info_1.PathInfo.get('users/ewout/posts');
        expect(pathInfo.isDescendantOf('')).toBeTrue();
        expect(pathInfo.isDescendantOf('users')).toBeTrue();
        expect(pathInfo.isDescendantOf('users/ewout')).toBeTrue();
        expect(pathInfo.isDescendantOf('users/ewout/posts')).toBeFalse();
        expect(pathInfo.isDescendantOf('users/ewout/posts/post1')).toBeFalse();
        // Wildcards:
        expect(pathInfo.isDescendantOf('*')).toBeTrue();
        expect(pathInfo.isDescendantOf('users/*')).toBeTrue();
        expect(pathInfo.isDescendantOf('users/*/posts')).toBeFalse();
        expect(pathInfo.isDescendantOf('*/ewout')).toBeTrue();
        expect(pathInfo.isDescendantOf('*/ewout/posts')).toBeFalse();
        // Variables:
        expect(pathInfo.isDescendantOf('$prop')).toBeTrue();
        expect(pathInfo.isDescendantOf('users/$uid')).toBeTrue();
        expect(pathInfo.isDescendantOf('users/$uid/posts')).toBeFalse();
        expect(pathInfo.isDescendantOf('$prop/ewout')).toBeTrue();
        expect(pathInfo.isDescendantOf('$prop/ewout/posts')).toBeFalse();
    });
    it('.isOnTrailOf', function () {
        const pathInfo = path_info_1.PathInfo.get('users/ewout/posts');
        expect(pathInfo.isOnTrailOf('')).toBe(true);
        expect(pathInfo.isOnTrailOf('users')).toBe(true);
        expect(pathInfo.isOnTrailOf('users/ewout')).toBe(true);
        expect(pathInfo.isOnTrailOf('users/ewout/posts')).toBe(true);
        expect(pathInfo.isOnTrailOf('users/ewout/posts/post1')).toBe(true);
        expect(pathInfo.isOnTrailOf('users/ewout/posts/post1/title')).toBe(true);
        expect(pathInfo.isOnTrailOf('users/ewout/archived/post1/title')).toBe(false);
        expect(pathInfo.isOnTrailOf('users/annet/posts/post1/title')).toBe(false);
        expect(pathInfo.isOnTrailOf('users/ewout/posts/post2/title')).toBe(true);
        expect(pathInfo.isOnTrailOf('users/ewout/posts/post1/date')).toBe(true);
        expect(pathInfo.isOnTrailOf('users/ewout/posts/post1')).toBe(true);
        expect(pathInfo.isOnTrailOf('users/ewout/posts')).toBe(true);
        expect(pathInfo.isOnTrailOf('users/annet')).toBe(false);
        expect(pathInfo.isOnTrailOf('users')).toBe(true);
        expect(pathInfo.isOnTrailOf('userss/ewout')).toBe(false);
        expect(pathInfo.isOnTrailOf('userss')).toBe(false);
        expect(pathInfo.isOnTrailOf('*')).toBe(true);
        expect(pathInfo.isOnTrailOf('$any')).toBe(true);
        expect(pathInfo.isOnTrailOf('users/$uid')).toBe(true);
        expect(pathInfo.isOnTrailOf('users/*')).toBe(true);
        expect(pathInfo.isOnTrailOf('users/$uid/messages')).toBe(false);
        expect(pathInfo.isOnTrailOf('users/$uid/posts/post1/title')).toBe(true);
        expect(pathInfo.isOnTrailOf('users/*/posts/post1/title')).toBe(true);
    });
});
//# sourceMappingURL=path-info.spec.js.map