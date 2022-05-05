# AceBase core components

This package contains shared functionality that is used by other AceBase packages, no need to install manually. See [acebase](https://www.npmjs.com/package/acebase), [acebase-client](https://www.npmjs.com/package/acebase-client) and [acebase-server](https://www.npmjs.com/package/acebase-server) for more information.

## ESM and CJS bundles

All AceBase packages are currently being refactored to TypeScript, allowing them to be transpiled to both ESM and CommonJS modules. This `acebase-core` package (v1.15.0+) now contains a distribution for both module systems, but only the CommonJS version is used until all AceBase packages have been migrated to TypeScript. The reason for this is to prevent both distributions of the `acebase-core` package to be used at the same time, introducing the so-called ["Dual package hazard"](https://nodejs.org/api/packages.html#packages_dual_package_hazard). Issues might arise if the `acebase-core` package is imported by multiple isolated packages, for example if both `acebase-client` and `acebase` packages are used in a project. They both have a dependency on `acebase-core` and depending on their version, both might be using different `acebase-core` module distributions.

To prevent possible issues, the CommonJS distribution will be used for both `require` and `import` statements until _all_ AceBase packages have ESM distributions. If you use `acebase-core` in your own project and want to explicitly use the ESM distribution, import from "acebase-core/esm" instead of from "acebase-core".

To check current ESM support for each AceBase package, see the [ESM module support](https://github.com/appy-one/acebase/discussions/98) discussion on GitHub.

## Webpack / browserify browser replacements

To provide browser support, some source files have a browser-specific counterpart which were previously specified in the main _package.json_. Since there are now multiple distributions, these browser replacements have moved to the _package.json_ files in the dist/cjs and dist/esm directories.