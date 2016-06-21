import 'reflect-metadata';

import {beforeEach, describe, expect, it} from '@angular/core/testing';
import * as ts from 'typescript';

import {LanguageServicePlugin} from '../src/plugin';

import {toh} from './test_data';
import {MockTypescriptHost} from './test_utils';

describe('plugin', () => {
  let documentRegistry = ts.createDocumentRegistry();
  let mockHost = new MockTypescriptHost(['app/main.ts'], toh);
  let service = ts.createLanguageService(mockHost, documentRegistry);
  let program = service.getProgram();

  it('should not report errors on tour of heroes', () => {
    expectNoDiagnostics(service.getCompilerOptionsDiagnostics());
    for (let source of program.getSourceFiles()) {
      expectNoDiagnostics(service.getSyntacticDiagnostics(source.fileName));
      expectNoDiagnostics(service.getSemanticDiagnostics(source.fileName));
    }
  });

  let plugin: LanguageServicePlugin;

  beforeEach(() => { plugin = new LanguageServicePlugin(mockHost, service); });

  it('should not report template errors on tour of heroes', () => {
    for (let source of program.getSourceFiles()) {
      expectNoDiagnostics(plugin.getSemanticDiagnosticsFilter(source.fileName, []));
    }
  });

  it('should be able to get entity completions',
     () => { contains('app/app.component.ts', 'entity-amp', '&amp;', '&gt;', '&lt;', '&iota;'); });

  it('should be able to return html elements', () => {
    let htmlTags = ['<h1', '<h2', '<div', '<span'];
    let locations = ['start-tag-h1', 'h1-content', 'empty', 'start-tag', 'start-tag-after-h'];
    for (let location of locations) {
      contains('app/app.component.ts', location, ...htmlTags);
    }
  });

  it('should be able to return h1 attributes',
     () => { contains('app/app.component.ts', 'h1-after-space', 'id', 'dir', 'lang', 'onclick'); });

  it('should be able to return a attributes (in the name span)',
     () => { contains('app/app.component.ts', 'a-attr-name', 'id', 'dir', 'lang'); });

  function contains(fileName: string, locationMarker: string, ...names: string[]) {
    let location = mockHost.getMarkerLocations(fileName)[locationMarker];
    expectEntries(locationMarker, plugin.getCompletionsAtPosition(fileName, location), ...names);
  }
});


function expectEntries(locationMarker: string, info: ts.CompletionInfo, ...names: string[]) {
  let entries: {[name: string]: boolean} = {};
  if (!info) {
    throw new Error(
        `Expected result from ${locationMarker} to include ${names.join(', ')} but no result provided`);
  } else {
    for (let entry of info.entries) {
      entries[entry.name] = true;
    }
    let missing = names.filter(name => !entries[name]);
    if (missing.length) {
      throw new Error(
          `Expected result from ${locationMarker} to include at least one of the following, ${missing.join(', ')}, in the list of entries ${info.entries.map(entry => entry.name).join(', ')}`);
    }
  }
}

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
