import {StaticReflector} from '@angular/compiler-cli/src/static_reflector';
import {DirectiveResolver} from '@angular/compiler/src/directive_resolver';
import {CompileMetadataResolver} from '@angular/compiler/src/metadata_resolver';
import {PipeResolver} from '@angular/compiler/src/pipe_resolver';
import {ViewResolver} from '@angular/compiler/src/view_resolver';
import {Type} from '@angular/core';
import * as path from 'path';
import * as ts from 'typescript';

import {ReflectorHost} from './reflector_host';
import {LanguageService, LanguageServiceHost, TemplateSource, TemplateSources, createLanguageService} from './service';
import {spanOf} from './utils';

class ServiceHost implements LanguageServiceHost {
  private ts: typeof ts;
  private _resolver: CompileMetadataResolver;
  private _reflector: StaticReflector;
  private _reflectorHost: ReflectorHost;
  private context: string|undefined;

  constructor(
      typescript: typeof ts, private host: ts.LanguageServiceHost,
      private service: ts.LanguageService) {
    this.ts = typescript;
  }

  /**
   * Angular LanguageServiceHost implementation
   */
  get resolver(): CompileMetadataResolver {
    let result = this._resolver;
    if (!result) {
      const directiveResolver = new DirectiveResolver(this.reflector);
      const pipeResolver = new PipeResolver(this.reflector);
      const viewResolver = new ViewResolver(this.reflector);
      result = this._resolver = new CompileMetadataResolver(
          directiveResolver, pipeResolver, viewResolver, [], [], this.reflector);
    }
    return result;
  }

  getTemplateAt(fileName: string, position: number): TemplateSource|undefined {
    let sourceFile = this.getSourceFile(fileName);
    if (sourceFile) {
      this.context = sourceFile.path;
      let node = this.findNode(sourceFile, position);
      if (node) {
        return this.getSourceFromNode(
            fileName, this.host.getScriptVersion(sourceFile.fileName), node);
      }
    }
  }

  getTemplates(fileName: string): TemplateSources {
    let version = this.host.getScriptVersion(fileName);
    let result: TemplateSource[] = [];

    // Find each template string in the file
    let visit = (child: ts.Node) => {
      let templateSource = this.getSourceFromNode(fileName, version, child);
      if (templateSource) {
        result.push(templateSource);
      } else {
        this.ts.forEachChild(child, visit);
      }
    };

    let sourceFile = this.getSourceFile(fileName);
    if (sourceFile) {
      this.context = sourceFile.path;
      this.ts.forEachChild(sourceFile, visit);
    }
    return result.length ? result : undefined;
  }

  getSourceFile(fileName: string): ts.SourceFile {
    return this.service.getProgram().getSourceFile(fileName);
  }

  private getSourceFromNode(fileName: string, version: string, node: ts.Node): TemplateSource
      |undefined {
    let result: TemplateSource|undefined = undefined;
    let sourceFile = this.getSourceFile(fileName);
    switch (node.kind) {
      case this.ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      case this.ts.SyntaxKind.StringLiteral:
        let [declaration, decorator] = this.getTemplateClassDecl(node);
        if (declaration) {
          return {
            version,
            source: this.stringOf(node),
            span: {start: node.getStart() + 1, end: node.getEnd() - 1},
            type: <Type><any>this.reflectorHost.getStaticSymbol(
                sourceFile.path, declaration.name.text)
          };
        }
        break;
    }
    return result;
  }

  private get reflectorHost(): ReflectorHost {
    let result = this._reflectorHost;
    if (!result) {
      if (!this.context) {
        throw new Error('Internal error: no context');
      }

      // Use the file context's directory as the base directory.
      // The host's getCurrentDirectory() is not reliable as it is always "" in
      // tsserver. We don't need the exact base directory, just one that contains
      // a source file.

      const basePath = path.dirname(this.context);
      result = this._reflectorHost = new ReflectorHost(
          this.ts, this.service.getProgram(), this.host, this.host.getCompilationSettings(),
          basePath);
    }
    return result;
  }

  private get reflector(): StaticReflector {
    let result = this._reflector;
    if (!result) {
      result = this._reflector = new StaticReflector(this.reflectorHost);
    }
    return result;
  }

  /**
   * Given a template string node, see if it is an Angular template string, and if so return the
   * containing class.
   */
  private getTemplateClassDecl(currentToken: ts.Node): [ts.ClassDeclaration, ts.Expression] {
    // Verify we are in a 'template' property assignment, in an object literal, which is an call
    // arg, in a decorator
    const missing = <[ts.ClassDeclaration, ts.Expression]>[];
    let parentNode = currentToken.parent;  // PropertyAssignment
    if (!parentNode) {
      return missing;
    }
    if (parentNode.kind !== this.ts.SyntaxKind.PropertyAssignment) {
      return missing;
    } else {
      // TODO: Is this different for a literal, i.e. a quoted property name like "template"?
      if ((parentNode as any).name.text !== 'template') {
        return missing;
      }
    }
    parentNode = parentNode.parent;  // ObjectLiteralExpression
    if (!parentNode || parentNode.kind !== this.ts.SyntaxKind.ObjectLiteralExpression) {
      return missing;
    }

    parentNode = parentNode.parent;  // CallExpression
    if (!parentNode || parentNode.kind !== this.ts.SyntaxKind.CallExpression) {
      return missing;
    }
    const callTarget = (<ts.CallExpression>parentNode).expression;

    let decorator = parentNode.parent;  // Decorator
    if (!decorator || decorator.kind !== this.ts.SyntaxKind.Decorator) {
      return missing;
    }

    let declaration = <ts.ClassDeclaration>decorator.parent;  // ClassDeclaration
    if (!declaration || declaration.kind !== this.ts.SyntaxKind.ClassDeclaration) {
      return missing;
    }
    return [declaration, callTarget];
  }

  private stringOf(node: ts.Node): string|undefined {
    switch (node.kind) {
      case this.ts.SyntaxKind.NoSubstitutionTemplateLiteral:
        return (<ts.LiteralExpression>node).text;
      case this.ts.SyntaxKind.StringLiteral:
        return (<ts.StringLiteral>node).text;
    }
  }

  private findNode(sourceFile: ts.SourceFile, position: number): ts.Node|undefined {
    let _this = this;

    function find(node: ts.Node): ts.Node|undefined {
      if (position >= node.getStart() && position < node.getEnd()) {
        return _this.ts.forEachChild(node, find) || node;
      }
    }

    return find(sourceFile);
  }
}

export class LanguageServicePlugin {
  private ts: typeof ts;
  private serviceHost: ServiceHost;
  private service: LanguageService;

  /** @internal */
  static __tsCompilerExtensionKind = 'language-service';

  constructor(
      typescript: typeof ts, private host: ts.LanguageServiceHost, service: ts.LanguageService,
      registry?: ts.DocumentRegistry, args?: any) {
    this.ts = typescript;
    this.serviceHost = new ServiceHost(typescript, host, service);
    this.service = createLanguageService(this.serviceHost);
  }

  /**
   * Augment the diagnostics reported by TypeScript with errors from the templates in string
   * literals.
   */
  getSemanticDiagnosticsFilter(fileName: string, previous: ts.Diagnostic[]): ts.Diagnostic[] {
    let errors = this.service.getDiagnostics(fileName);
    if (errors) {
      let file = this.serviceHost.getSourceFile(fileName);
      for (const error of errors) {
        previous.push({
          file,
          start: error.span.start,
          length: error.span.end - error.span.start,
          messageText: error.message,
          category: this.ts.DiagnosticCategory.Error,
          code: 0
        });
      }
    }
    return previous;
  }

  /**
   * Get completions for angular templates if one is at the given position.
   */
  getCompletionsAtPosition(fileName: string, position: number): ts.CompletionInfo {
    let result = this.service.getCompletionsAt(fileName, position);
    if (result) {
      return {
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: result.map<ts.CompletionEntry>(
            entry =>
                ({name: entry.name, kind: entry.kind, kindModifiers: '', sortText: entry.sort}))
      };
    }
  }
}
