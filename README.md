# AceBase core components

This package contains shared functionality that is used by other AceBase packages, no need to install manually. See [acebase](https://www.npmjs.com/package/acebase), [acebase-client](https://www.npmjs.com/package/acebase-client) and [acebase-server](https://www.npmjs.com/package/acebase-server) for more information.

## ESM and CJS bundles

All _AceBase_ packages have been ported to TypeScript, allowing them to be transpiled to both ESM and CommonJS modules. This means that it is now safe for `acebase-core` (v1.25.0+) to export its `ESM` build when used with an `import` statement. If 1 or more _AceBase_ (database, client, server, ipc-server etc) packages are used in a single project they'll use the same _core_ codebase, preventing the so-called ["Dual package hazard"](https://nodejs.org/api/packages.html#packages_dual_package_hazard).

For more info, see the [ESM module support](https://github.com/appy-one/acebase/discussions/98) discussion on GitHub.

## Bundler browser replacements

To provide browser support, some source files have a browser-specific counterpart which were previously only specified in the main _package.json_. Since there are now multiple distributions, the distribution specific  browser replacements have been added to the _package.json_ files in the _dist/cjs_ and _dist/esm_ directories: bundlers like _Webpack_ and _Browserify_ use those instead of the ones in the root _package.json_. _Vite_ (and _Rollup_?) only seem to use the replacements listed in the root _package.json_, that's why they still need to be mentioned there as well.