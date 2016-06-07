import {Type} from '@angular/core';
import {TemplateAst, DirectiveResolver, ViewResolver, PipeResolver} from '@angular/compiler';
import {StaticReflector, StaticReflectorHost, MetadataCollector} from '@angular/compiler-cli';

import {
  CompileMetadataResolver,
  DomElementSchemaRegistry,
  HtmlParser,
  Lexer,
  Parser,
  ParseError,
  ParseSourceSpan,
  ParseLocation,
  TemplateParser,
  TemplateParseResult
} from './compiler-private';

import * as ts from 'typescript';

import {ReflectorHost} from './reflector-host';

interface TemplateNode {
  templateString: ts.Node;
  declaration: ts.ClassDeclaration;
  decorator: ts.Expression;
}

interface AstResult {
  templateAst?: TemplateAst[];
  parseErrors?: ParseError[];
  errors?: { msg: string, node: ts.Node}[];
}

export class LanguageServicePlugin {
  private nodesCache = new Map<ts.SourceFile, {templates: TemplateNode[], version: string}>();
  private astCache = new Map<ts.SourceFile, Map<TemplateNode, AstResult>>();
  private _metadataResolver: CompileMetadataResolver;
  private _reflector: StaticReflector;
  private _refletorHost: ReflectorHost;

  constructor(
    private host: ts.LanguageServiceHost,
    private service: ts.LanguageService) {}

  /**
   * Augment the diagnostics reported by TypeScript with errors from the templates in string
   * literals.
   */
  getSemanticDiagnosticsFilter(fileName: string, previous: ts.Diagnostic[]): ts.Diagnostic[] {
    let result = previous;
    if (result) {
      const sourceFile = this.getSourceFile(fileName);
      if (sourceFile) {
        const astNodes = this.getTemplateStrings(sourceFile);
        for (const node of astNodes) {
          const ast = this.getTemplateAst(sourceFile, node);
          if (ast.parseErrors) {
            for (const error of ast.parseErrors) {
              result.push({
                file: sourceFile,
                start: error.span.start.offset + node.templateString.pos + 1,
                length: error.span.end.offset - error.span.start.offset,
                messageText: error.msg,
                category: ts.DiagnosticCategory.Error,
                code: 0
              });
            }
          }
          if (ast.errors) {
            for (const error of ast.errors) {
              result.push({
                file: sourceFile,
                start: error.node.getStart(),
                length: error.node.getEnd() - error.node.getStart(),
                messageText: error.msg,
                category: ts.DiagnosticCategory.Error,
                code: 0
              });
            }
          }
        }
      }
    }
    return result;
  }

  private get program(): ts.Program {
    return this.service.getProgram();
  }

  private get reflectorHost(): ReflectorHost {
    let result = this._refletorHost;
    if (!result) {
      result = this._refletorHost = new ReflectorHost(
        this.program,
        this.host,
        this.host.getCompilationSettings(),
        this.host.getCurrentDirectory()
      );
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

 private get metadataResolver(): CompileMetadataResolver {
    let result = this._metadataResolver;
    if (!result) {
      const directiveResolver = new DirectiveResolver(this.reflector);
      const pipeResolver = new PipeResolver(this.reflector);
      const viewResolver = new ViewResolver(this.reflector);
      result = this._metadataResolver = new CompileMetadataResolver(
        directiveResolver,
        pipeResolver,
        viewResolver,
        [], [], this.reflector);
    }
    return result;
  }

  private getSourceFile(fileName: string): ts.SourceFile {
    return this.program.getSourceFile(fileName);
  }

  /**
   * Retrieve the nodes that contain templates for the current file.
   */
  private getTemplateStrings(sourceFile: ts.SourceFile) : TemplateNode[] {
    let result = this.nodesCache.get(sourceFile);
    let version: string = this.host.getScriptVersion(sourceFile.fileName);
    if (!result || result.version != version) {
      result = { templates: [], version };

      // Find each template string in the file
      let visit = (child: ts.Node) => {
        switch (child.kind) {
          case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
          case ts.SyntaxKind.StringLiteral:
            let [declaration, decorator] = this.getTemplateClassDecl(child);
            if (declaration) {
              result.templates.push({templateString: child, declaration, decorator });
            }
            break;
          default:
            ts.forEachChild(child, visit);
        }
      };
      ts.forEachChild(sourceFile, visit);
      this.invalidateCaches(sourceFile);
      this.nodesCache.set(sourceFile, result);
    }
    return result.templates;
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
    if (parentNode.kind !== ts.SyntaxKind.PropertyAssignment) {
      return missing;
    } else {
      // TODO: Is this different for a literal, i.e. a quoted property name like "template"?
      if((parentNode as any).name.text !== 'template'){
        return missing;
      }
    }
    parentNode = parentNode.parent; // ObjectLiteralExpression
    if (!parentNode || parentNode.kind !== ts.SyntaxKind.ObjectLiteralExpression) {
      return missing;
    }

    parentNode = parentNode.parent; // CallExpression
    if (!parentNode || parentNode.kind !== ts.SyntaxKind.CallExpression) {
      return missing;
    }
    const callTarget = (<ts.CallExpression>parentNode).expression;

    let decorator = parentNode.parent; // Decorator
    if (!decorator || decorator.kind !== ts.SyntaxKind.Decorator) {
      return missing;
    }

    let declaration = <ts.ClassDeclaration>decorator.parent; // ClassDeclaration
    if (!declaration || declaration.kind !== ts.SyntaxKind.ClassDeclaration) {
      return missing;
    }
    return [declaration, callTarget];
  }

  /**
   * Retrieve the parsed result of a particular template. Caches the result to multiple calls
   * for the same node are fast.
   */
  private getTemplateAst(sourceFile: ts.SourceFile, node: TemplateNode): AstResult {
    let sourceAstCache = this.astCache.get(sourceFile);
    let result: AstResult;
    if (sourceAstCache) {
      result = sourceAstCache.get(node);
    }
    if (!result) {
      let parser = new TemplateParser(new Parser(new Lexer()),
         new DomElementSchemaRegistry(), new HtmlParser(), null, []);
      const type = this.reflectorHost.getStaticSymbol(sourceFile.fileName, node.declaration.name.text);
      let directive = this.metadataResolver.maybeGetDirectiveMetadata(<any>type);
      if (directive) {
        try {
          let parseResult = parser.tryParse(
            directive,
            this.stringOf(node.templateString),
            this.metadataResolver.getViewDirectivesMetadata(type as any as Type),
            this.metadataResolver.getViewPipesMetadata(type as any as Type), '');
          result = { templateAst: parseResult.templateAst, parseErrors: parseResult.errors };
        } catch (e) {
          result = { errors: [{ msg: e.stack, node: node.decorator }]};
        }
        if (!sourceAstCache) {
          sourceAstCache = new Map<TemplateNode, AstResult>();
          this.astCache.set(sourceFile, sourceAstCache);
        }
      }
      sourceAstCache.set(node, result);
    }
    return result;
  }

  private invalidateCaches(sourceFile?: ts.SourceFile) {
    if (sourceFile) {
      this._reflector = null;
      this._metadataResolver = null;
      this.nodesCache.delete(sourceFile);
      this.astCache.delete(sourceFile);
    } else {
      let r: { value?: ts.SourceFile; done?: boolean };
      for (var i = this.nodesCache.keys(); r = i.next(), !r.done; ) {
        const key = r.value;
        if (key) {
          this.invalidateCaches(key);
        }
      }
    }
  }

  stringOf(node: ts.Node): string {
    switch (node.kind) {
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
        return (<ts.LiteralExpression>node).text;
      case ts.SyntaxKind.StringLiteral:
        return (<ts.StringLiteral>node).text;
    }
  }
}