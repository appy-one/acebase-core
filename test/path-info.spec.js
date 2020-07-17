const { PathInfo } = require('../src/path-info');

describe('PathInfo tests', function() {

    const pathInfo = PathInfo.get('users/ewout/posts');

    it('isOnTrailOf must return the right results', function() {
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