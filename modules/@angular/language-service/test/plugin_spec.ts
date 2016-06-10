import 'reflect-metadata';

import {describe, expect, it} from '@angular/core/testing';
import * as ts from 'typescript';

import {LanguageServicePlugin} from '../src/plugin';

import {toh} from './test-data';
import {MockTypescriptHost} from './test-utils';

describe('plugin', () => {
  let mockHost = new MockTypescriptHost(['app/main.ts'], toh);
  let service = ts.createLanguageService(mockHost);
  let program = service.getProgram();

  it('should not report errors on tour of heroes', () => {
    expectNoDiagnostics(
        service.getCompilerOptionsDiagnostics()) for (let source of program.getSourceFiles()) {
      expectNoDiagnostics(service.getSyntacticDiagnostics(source.fileName));
      expectNoDiagnostics(service.getSemanticDiagnostics(source.fileName));
    }
  });

  it('should not report template errors on tour of heroes', () => {
    let plugin = new LanguageServicePlugin(mockHost, service);
    for (let source of program.getSourceFiles()) {
      expectNoDiagnostics(plugin.getSemanticDiagnosticsFilter(source.fileName, []));
    }
  });
});

function expectNoDiagnostics(diagnostics: ts.Diagnostic[]) {
  for (const diagnostic of diagnostics) {
    let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    if (diagnostic.start) {
      let {line, character} = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      console.log(`${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
    } else {
      console.log(`${message}`);
    }
  }
  expect(diagnostics.length).toBe(0);
}
