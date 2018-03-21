/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import * as fs from 'fs';
import * as path from 'path';
import * as shx from 'shelljs';

function main(args: string[]): number {
  // Exit immediately when encountering an error.
  shx.set('-e');

  // This utility expects all of its arguments to be specified in a params file generated by
  // bazel (see https://docs.bazel.build/versions/master/skylark/lib/Args.html#use_param_file).
  const paramFilePath = args[0];

  // Paramaters are specified in the file one per line. Empty params are represented as two
  // single-quotes, so turn these into real empty strings..
  const params =
      fs.readFileSync(paramFilePath, 'utf-8').split('\n').map(s => s === '\'\'' ? '' : s);

  const [
      // Output directory for the npm package.
      out,

      // The package segment of the ng_package rule's label (e.g. 'package/common').
      srcDir,

      // Path to the JS file for the primaery entry point (e.g. 'packages/common/index.js')
      primaryEntryPoint,

      // List of secondary entry-points (e.g. ['http', 'http/testing']).
      secondaryEntryPointsArg,

      // The bazel-bin dir joined with the srcDir (e.g. 'bazel-bin/package.common').
      // This is the intended output location for package artifacts.
      binDir,

      // Path to the package's README.md.
      readmeMd,

      // List of ES2015 files generated by rollup.
      esm2015Arg,

      // List of flattenned, ES5 files generated by rollup.
      esm5Arg,

      // List of all UMD bundles generated by rollup.
      bundlesArg,

      // List of all files in the ng_package rule's srcs.
      srcsArg,

      // Path to the package's LICENSE.
      licenseFile] = params;

  const esm2015 = esm2015Arg.split(',').filter(s => !!s);
  const esm5 = esm5Arg.split(',').filter(s => !!s);
  const bundles = bundlesArg.split(',').filter(s => !!s);
  const srcs = srcsArg.split(',').filter(s => !!s);
  const secondaryEntryPoints = secondaryEntryPointsArg.split(',').filter(s => !!s);

  shx.mkdir('-p', out);

  if (readmeMd) {
    shx.cp(readmeMd, path.join(out, 'README.md'));
  }

  function writeEsmFile(file, suffix, outDir) {
    const root = file.substr(0, file.lastIndexOf(suffix + path.sep) + suffix.length + 1);
    const rel = path.relative(path.join(root, srcDir), file);
    if (!rel.startsWith('..')) {
      writeFile(file, rel, path.join(out, outDir));
    }
  }
  esm2015.forEach(file => writeEsmFile(file, '.es6', 'esm2015'));
  esm5.forEach(file => writeEsmFile(file, '.esm5', 'esm5'));

  const bundlesDir = path.join(out, 'bundles');
  shx.mkdir('-p', bundlesDir);
  bundles.forEach(bundle => { shx.cp(bundle, bundlesDir); });

  const allsrcs = shx.find('-R', binDir);
  allsrcs.filter(hasFileExtension('.d.ts')).forEach((f: string) => {
    const content = fs.readFileSync(f, 'utf-8')
                        // Strip the named AMD module for compatibility with non-bazel users
                        .replace(/^\/\/\/ <amd-module name=.*\/>\n/, '');
    let outputPath: string;
    if (f.endsWith('.bundle_index.d.ts')) {
      outputPath = moveBundleIndex(f);
    } else {
      outputPath = path.join(out, path.relative(binDir, f));
    }
    shx.mkdir('-p', path.dirname(outputPath));
    fs.writeFileSync(outputPath, content);
  });
  allsrcs.filter(hasFileExtension('.bundle_index.js')).forEach((f: string) => {
    const content = fs.readFileSync(f, 'utf-8');
    fs.writeFileSync(moveBundleIndex(f, 'esm5'), content);
    fs.writeFileSync(moveBundleIndex(f, 'esm2015'), content);
  });

  // Root package name (e.g. '@angular/common'), captures as we iterate through sources below.
  let rootPackageName = '';
  const packagesWithExistingPackageJson = new Set<string>();

  // Modify source files as necessary for publishing, including updating the
  // version placeholders and the paths in any package.json files.
  for (const src of srcs) {
    let content = fs.readFileSync(src, 'utf-8');
    if (path.basename(src) === 'package.json') {
      const packageJson = JSON.parse(content);
      content = amendPackageJson(packageJson);

      const packageName = packageJson['name'];
      packagesWithExistingPackageJson.add(packageName);

      // Keep track of the root package name, e.g. "@angular/common". We assume that the
      // root name will be shortest because secondary entry-points will append to it
      // (e.g. "@angular/common/http").
      if (!rootPackageName || packageName.length < rootPackageName.length) {
        rootPackageName = packageJson['name'];
      }
    }
    const outputPath = path.join(out, path.relative(srcDir, src));
    shx.mkdir('-p', path.dirname(outputPath));
    fs.writeFileSync(outputPath, content);
  }

  allsrcs.filter(hasFileExtension('.bundle_index.metadata.json')).forEach((f: string) => {
    fs.writeFileSync(moveBundleIndex(f), fs.readFileSync(f, 'utf-8'));
  });

  const licenseBanner = licenseFile ? fs.readFileSync(licenseFile, 'utf-8') : '';

  // Generate extra files for secondary entry-points.
  for (const secondaryEntryPoint of secondaryEntryPoints) {
    const entryPointName = secondaryEntryPoint.split('/').pop();
    const entryPointPackageName = `${rootPackageName}/${secondaryEntryPoint}`;

    const dirName = path.join(...secondaryEntryPoint.split('/').slice(0, -1));
    const destDir = path.join(out, dirName);

    createMetadataReexportFile(destDir, entryPointName);
    createTypingsReexportFile(destDir, entryPointName, licenseBanner);

    if (!packagesWithExistingPackageJson.has(entryPointPackageName)) {
      createEntryPointPackageJson(path.join(destDir, entryPointName), entryPointPackageName);
    }
  }

  return 0;

  // Copy these bundle_index outputs from the ng_module rules in the deps
  // Mapping looks like:
  //  $bin/_core.bundle_index.d.ts
  //    -> $out/core.d.ts
  //  $bin/testing/_testing.bundle_index.d.ts
  //    -> $out/testing/testing.d.ts
  //  $bin/_core.bundle_index.metadata.json
  //    -> $out/core.metadata.json
  //  $bin/testing/_testing.bundle_index.metadata.json
  //    -> $out/testing/testing.metadata.json
  // JS is a little different, as controlled by the `dir` parameter
  //  $bin/_core.bundle_index.js
  //    -> $out/esm5/core.js
  //  $bin/testing/_testing.bundle_index.js
  //    -> $out/esm5/testing.js
  function moveBundleIndex(f: string, dir = '.') {
    const relative = path.relative(binDir, f);
    return path.join(out, dir, relative.replace(/_(.*)\.bundle_index/, '$1'));
  }
}

/** Gets a predicate function to filter non-generated files with a specified extension. */
function hasFileExtension(ext: string): (path: string) => boolean {
  return f => f.endsWith(ext) && !f.endsWith(`.ngfactory${ext}`) && !f.endsWith(`.ngsummary${ext}`);
}

function writeFile(file: string, relative: string, baseDir: string) {
  const dir = path.join(baseDir, path.dirname(relative));
  shx.mkdir('-p', dir);
  shx.cp(file, dir);
}

function writeFesm(file: string, baseDir: string) {
  const parts = path.basename(file).split('__');
  const entryPointName = parts.join('/').replace(/\..*/, '');
  const filename = parts.splice(-1)[0];
  const dir = path.join(baseDir, ...parts);
  shx.mkdir('-p', dir);
  shx.cp(file, dir);
  shx.mv(path.join(dir, path.basename(file)), path.join(dir, filename));
}

/**
 * Inserts or edits properties into the package.json file(s) in the package so that
 * they point to all the right generated artifacts.
 *
 * @param parsedPackage Parsed package.json content
 */
function amendPackageJson(parsedPackage: object) {
  const packageName = parsedPackage['name'];
  const nameParts = getPackageNameParts(packageName);
  const relativePathToPackageRoot = getRelativePathToPackageRoot(packageName);
  const basename = nameParts[nameParts.length - 1];
  const indexName = [...nameParts, `${basename}.js`].splice(1).join('/');

  parsedPackage['main'] = `${relativePathToPackageRoot}/bundles/${nameParts.join('-')}.umd.js`;
  parsedPackage['module'] = `${relativePathToPackageRoot}/esm5/${indexName}`;
  parsedPackage['es2015'] = `${relativePathToPackageRoot}/esm2015/${indexName}`;
  parsedPackage['typings'] = `./${basename}.d.ts`;
  return JSON.stringify(parsedPackage, null, 2);
}

/** Gets a package name split into parts, omitting the scope if present. */
function getPackageNameParts(fullPackageName: string): string[] {
  const parts = fullPackageName.split('/');
  return fullPackageName.startsWith('@') ? parts.splice(1) : parts;
}

/** Gets the relative path to the package root from a given entry-point import path. */
function getRelativePathToPackageRoot(entryPointPath: string) {
  const parts = getPackageNameParts(entryPointPath);
  const relativePath = Array(parts.length - 1).fill('..').join('/');
  return relativePath || '.';
}

/** Creates metadata re-export file for a secondary entry-point. */
function createMetadataReexportFile(destDir: string, entryPointName: string) {
  fs.writeFileSync(path.join(destDir, `${entryPointName}.metadata.json`), JSON.stringify({
    '__symbolic': 'module',
    'version': 3,
    'metadata': {},
    'exports': [{'from': `./${entryPointName}/${entryPointName}`}],
    'flatModuleIndexRedirect': true
  }) + '\n');
}

/**
 * Creates a typings (d.ts) re-export file for a secondary-entry point,
 * e.g., `export * from './common/common'`
 */
function createTypingsReexportFile(destDir: string, entryPointName: string, license: string) {
  // Format carefully to match existing build.sh output:
  // LICENSE SPACE NEWLINE SPACE EXPORT NEWLINE
  const content = `${license} \n export * from \'./${entryPointName}/${entryPointName}\';\n`;
  fs.writeFileSync(path.join(destDir, `${entryPointName}.d.ts`), content);
}

/**
 * Creates a package.json for a secondary entry-point.
 * @param destDir Directory into which the package.json will be written.
 * @param entryPointPackageName The full package name for the entry point,
 *     e.g. '@angular/common/http'.
 */
function createEntryPointPackageJson(destDir: string, entryPointPackageName: string) {
  const content = amendPackageJson({name: entryPointPackageName});
  fs.writeFileSync(path.join(destDir, 'package.json'), content, 'utf-8');
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
