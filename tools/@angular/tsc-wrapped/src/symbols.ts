import * as ts from 'typescript';

import {MetadataValue} from './schema';

export class Symbols {
  private ts: typeof ts;
  private _symbols: Map<string, MetadataValue>;

  constructor(typescript: typeof ts, private sourceFile: ts.SourceFile) { this.ts = typescript; }

  resolve(name: string): MetadataValue|undefined { return this.symbols.get(name); }

  define(name: string, value: MetadataValue) { this.symbols.set(name, value); }

  has(name: string): boolean { return this.symbols.has(name); }

  private get symbols(): Map<string, MetadataValue> {
    let result = this._symbols;
    if (!result) {
      result = this._symbols = new Map();
      populateBuiltins(result);
      this.buildImports();
    }
    return result;
  }

  private buildImports(): void {
    let symbols = this._symbols;
    // Collect the imported symbols into this.symbols
    const stripQuotes = (s: string) => s.replace(/^['"]|['"]$/g, '');
    const visit = (node: ts.Node) => {
      switch (node.kind) {
        case this.ts.SyntaxKind.ImportEqualsDeclaration:
          const importEqualsDeclaration = <ts.ImportEqualsDeclaration>node;
          if (importEqualsDeclaration.moduleReference.kind ===
              this.ts.SyntaxKind.ExternalModuleReference) {
            const externalReference =
                <ts.ExternalModuleReference>importEqualsDeclaration.moduleReference;
            // An `import <identifier> = require(<module-specifier>);
            const from = stripQuotes(externalReference.expression.getText());
            symbols.set(importEqualsDeclaration.name.text, {__symbolic: 'reference', module: from});
          } else {
            symbols.set(
                importEqualsDeclaration.name.text,
                {__symbolic: 'error', message: `Unsupported import syntax`});
          }
          break;
        case this.ts.SyntaxKind.ImportDeclaration:
          const importDecl = <ts.ImportDeclaration>node;
          if (!importDecl.importClause) {
            // An `import <module-specifier>` clause which does not bring symbols into scope.
            break;
          }
          const from = stripQuotes(importDecl.moduleSpecifier.getText());
          if (importDecl.importClause.name) {
            // An `import <identifier> form <module-specifier>` clause. Record the defualt symbol.
            symbols.set(
                importDecl.importClause.name.text,
                {__symbolic: 'reference', module: from, default: true});
          }
          const bindings = importDecl.importClause.namedBindings;
          if (bindings) {
            switch (bindings.kind) {
              case this.ts.SyntaxKind.NamedImports:
                // An `import { [<identifier> [, <identifier>] } from <module-specifier>` clause
                for (let binding of (<ts.NamedImports>bindings).elements) {
                  symbols.set(binding.name.text, {
                    __symbolic: 'reference',
                    module: from,
                    name: binding.propertyName ? binding.propertyName.text : binding.name.text
                  });
                }
                break;
              case this.ts.SyntaxKind.NamespaceImport:
                // An `input * as <identifier> from <module-specifier>` clause.
                symbols.set(
                    (<ts.NamespaceImport>bindings).name.text,
                    {__symbolic: 'reference', module: from});
                break;
            }
          }
          break;
      }
      this.ts.forEachChild(node, visit);
    };
    if (this.sourceFile) {
      this.ts.forEachChild(this.sourceFile, visit);
    }
  }
}

function populateBuiltins(symbols: Map<string, MetadataValue>) {
  // From lib.core.d.ts (all "define const")
  ['Object', 'Function', 'String', 'Number', 'Array', 'Boolean', 'Map', 'NaN', 'Infinity', 'Math',
   'Date', 'RegExp', 'Error', 'Error', 'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError',
   'TypeError', 'URIError', 'JSON', 'ArrayBuffer', 'DataView', 'Int8Array', 'Uint8Array',
   'Uint8ClampedArray', 'Uint16Array', 'Int16Array', 'Int32Array', 'Uint32Array', 'Float32Array',
   'Float64Array']
      .forEach(name => symbols.set(name, {__symbolic: 'reference', name}));
}