/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import * as ts from 'typescript';

interface Options extends ts.CompilerOptions {
  // Absolute path to a directory where generated file structure is written.
  // If unspecified, generated files will be written alongside sources.
  genDir?: string;

  // Path to the directory containing the tsconfig.json file.
  basePath?: string;

  // Don't produce .metadata.json files (they don't work for bundled emit with --out)
  skipMetadataEmit?: boolean;

  // Produce an error if the metadata written for a class would produce an error if used.
  strictMetadataEmit?: boolean;

  // Don't produce .ngfactory.ts or .ngstyle.ts files
  skipTemplateCodegen?: boolean;

  // Whether to generate a flat module index of the given name and the corresponding
  // flat module metadata. This option is intended to be used when creating flat
  // modules similar to how `@angular/core` and `@angular/common` are packaged.
  // When this option is used the `package.json` for the library should referred to the
  // generated flat module index instead of the library index file. When using this
  // option only one .metadata.json file is produced that contains all the metadata
  // necessary for symbols exported from the library index.
  // In the generated .ngfactory.ts files flat module index is used to import symbols
  // includes both the public API from the library index as well as shrowded internal
  // symbols.
  // By default the .ts file supplied in the `files` files field is assumed to be
  // library index. If more than one is specified, uses `libraryIndex` to select the
  // file to use. If more than on .ts file is supplied and no `libraryIndex` is supplied
  // an error is produced.
  // A flat module index .d.ts and .js will be created with the given `flatModuleOutFile`
  // name in the same location as the library index .d.ts file is emitted.
  // For example, if a library uses `public_api.ts` file as the library index of the
  // module the `tsconfig.json` `files` field would be `["public_api.ts"]`. The
  // `flatModuleOutFile` options could then be set to, for example `"index.js"`, which
  // produces `index.d.ts` and  `index.metadata.json` files. The library's
  // `package.json`'s `module` field would be `"index.js"` and the `typings` field would
  // be `"index.d.ts"`.
  flatModuleOutFile?: string;

  flatModuleIndex?: string[];

  // Preferred module id to use for importing flat module. References generated by `ngc`
  // will use this module name when importing symbols from the flat module. This is only
  // meaningful when `flatModuleOutFile` is also supplied. It is otherwise ignored.
  flatModuleId?: string;

  // Whether to generate code for library code.
  // If true, produce .ngfactory.ts and .ngstyle.ts files for .d.ts inputs.
  // Default is true.
  generateCodeForLibraries?: boolean;

  // Insert JSDoc type annotations needed by Closure Compiler
  annotateForClosureCompiler?: boolean;

  // Modify how angular annotations are emitted to improve tree-shaking.
  // Default is static fields.
  // decorators: Leave the Decorators in-place. This makes compilation faster.
  //             TypeScript will emit calls to the __decorate helper.
  //             `--emitDecoratorMetadata` can be used for runtime reflection.
  //             However, the resulting code will not properly tree-shake.
  // static fields: Replace decorators with a static field in the class.
  //                Allows advanced tree-shakers like Closure Compiler to remove
  //                unused classes.
  annotationsAs?: 'decorators'|'static fields';

  // Print extra information while running the compiler
  trace?: boolean;

  /** @deprecated since v4 this option has no effect anymore. */
  debug?: boolean;

  // Whether to enable support for <template> and the template attribute (true by default)
  enableLegacyTemplate?: boolean;

  // Whether to generate .ngsummary.ts files that allow to use AOTed artifacts
  // in JIT mode. This is off by default.
  enableSummariesForJit?: boolean;

  // Whether to compile generated .ngfacgtory.ts files, even when they are no
  // matched by the `files` / `includes` in the `tsconfig.json`.
  // This is off by default.
  alwaysCompileGeneratedCode?: boolean;

  // Whether to only emit Angular generated files.
  // This is off by default.
  angularFilesOnly?: boolean;
}

export default Options;
