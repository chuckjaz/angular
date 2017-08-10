/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

// TODO(chuckj): Remove the requirment for a fake 'reflect` implementation from
// the compiler
import 'reflect-metadata';
import {ngc} from '@angular/compiler-cli';
import * as fs from 'fs';
import * as ts from 'typescript';

// Note, the tsc_wrapped module comes from rules_typescript, not from @angular/tsc-wrapped
import {parseTsconfig, CompilerHost, UncachedFileLoader} from 'tsc_wrapped';

function main(args: string[]) {
  const [configuration, errors] = parseTsconfig(args[1]);

  if (errors && errors.length) {
    console.error(ts.formatDiagnostics(errors, {
      getCurrentDirectory() { return process.cwd(); },
      getCanonicalFileName(fileName: string) { return fileName; },
      getNewLine(): string { return '\n'; }
    }));
    return 1;
  }

  const {options, bazelOpts, files, config} = configuration;
  const ngOptions: {expectedOut: string[]} = (config as any).angularCompilerOptions;

  const compilerHost = new CompilerHost(files, options, bazelOpts, ts.createCompilerHost(options), new UncachedFileLoader());
  const result = ngc(args, undefined, files, options, ngOptions, compilerHost);

  if (result === 0) {
    // Ensure that expected output files exist.
    if (ngOptions && ngOptions.expectedOut) {
      for (const out of ngOptions.expectedOut) {
        fs.appendFileSync(out, '', 'utf-8');
      }
    }
  }

  return result;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}