import {CompileDirectiveMetadata, DirectiveAst, DirectiveResolver, ElementAst, EmbeddedTemplateAst, PipeResolver, ProviderAst, TemplateAst, ViewResolver} from '@angular/compiler';
import {MetadataCollector, StaticReflector, StaticReflectorHost} from '@angular/compiler-cli';
import {HtmlAst, HtmlAstVisitor, HtmlChildVisitor, HtmlElementAst, htmlVisitAll} from '@angular/compiler/src/html_ast';
import {HtmlParseTreeResult} from '@angular/compiler/src/html_parser';
import {NAMED_ENTITIES} from '@angular/compiler/src/html_tags';
import {NgContentAst, TemplateAstChildVisitor, templateVisitAll} from '@angular/compiler/src/template_ast';
import {Type} from '@angular/core';
import * as ts from 'typescript';

import {CompileMetadataResolver, DomElementSchemaRegistry, HtmlParser, Lexer, ParseError, ParseLocation, ParseSourceSpan, Parser, TemplateParseResult, TemplateParser} from './compiler-private';
import {attributeNames, elementNames} from './html-info';
import {ReflectorHost} from './reflector-host';

interface TemplateNode {
  templateString: ts.Node;
  declaration: ts.ClassDeclaration;
  decorator: ts.Expression;
}

interface AstResult {
  htmlAst?: HtmlAst[];
  templateAst?: TemplateAst[];
  parseErrors?: ParseError[];
  directive?: CompileDirectiveMetadata;
  errors?: {msg: string, node: ts.Node}[];
}

interface TemplateInfo {
  sourceFile: ts.SourceFile;
  htmlAst: HtmlAst[];
  templateNode: ts.Node;
  templateAst: TemplateAst[];
}

export class LanguageServicePlugin {
  private nodesCache = new Map<ts.SourceFile, {templates: TemplateNode[], version: string}>();
  private astCache = new Map<ts.SourceFile, Map<TemplateNode, AstResult>>();
  private _metadataResolver: CompileMetadataResolver;
  private _reflector: StaticReflector;
  private _refletorHost: ReflectorHost;

  constructor(private host: ts.LanguageServiceHost, private service: ts.LanguageService) {}

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

  /**
   * Get completions for angular templates if one is at the given position.
   */
  getCompletionsAtPosition(fileName: string, position: number): ts.CompletionInfo {
    let templateInfo = this.getTemplateAstAtPosition(fileName, position);
    if (templateInfo) {
      let {htmlAst, templateAst, templateNode} = templateInfo;
      // The templateNode starts at the delimiter character so we add 1 to skip it.
      let stringPosition = position - (templateNode.getStart() + 1);
      let path = new HtmlAstPath(htmlAst, stringPosition);
      let mostSpecific = path.tail;
      if (!path.empty) {
        let astPosition = stringPosition - mostSpecific.sourceSpan.start.offset;
        let result: ts.CompletionInfo = undefined;
        let _this = this;
        mostSpecific.visit(
            {
              visitElement(ast) {
                let startTagSpan = spanOf(ast.sourceSpan);
                let tagLen = ast.name.length;
                if (stringPosition <=
                    startTagSpan.start + tagLen + 1 /* 1 for the opening angle bracked */) {
                  // If we are in the tag then return the element completions.
                  result = _this.elementCompletions();
                } else if (stringPosition < startTagSpan.end) {
                  result = _this.attributeCompletions(stringPosition, path);
                }
              },
              visitAttr(ast) {
                if (!inSpan(stringPosition, spanOf(ast.valueSpan))) {
                  result = _this.attributeCompletions(stringPosition, path);
                }
              },
              visitText(ast) {
                result =
                    _this.entityCompletions(getSourceText(templateInfo, spanOf(ast)), astPosition);
                if (!result) {
                  result = _this.elementCompletions();
                }
              },
              visitComment(ast) {},
              visitExpansion(ast) {},
              visitExpansionCase(ast) {}
            },
            null);
        return result;
      }
    }
    return undefined;
  }

  private entityCompletions(value: string, position: number): ts.CompletionInfo|undefined {
    // Look for entity completions
    const re = /&[A-Za-z]*;?(?!\d)/g;
    let found: RegExpExecArray|null;
    let result: ts.CompletionInfo = undefined;
    while (found = re.exec(value)) {
      let len = found[0].length;
      if (position >= found.index && position < (found.index + len)) {
        result = {
          isMemberCompletion: false,
          isNewIdentifierLocation: false,
          entries:
              Object.keys(NAMED_ENTITIES)
                  .map(
                      name => (
                          {name: `&${name};`, kind: 'entity', kindModifiers: '', sortText: name}))
        };
        break;
      }
    }
    return result;
  }

  private elementCompletions(): ts.CompletionInfo|undefined {
    // Return all HTML elements.
    let entries = elementNames().map(
        (name) => ({name: `<${name}>`, kind: 'entity', kindModifiers: '', sortText: name}));
    return {isMemberCompletion: false, isNewIdentifierLocation: false, entries};
  }

  private attributeCompletions(offset: number, path: HtmlAstPath): ts.CompletionInfo|undefined {
    let element = path.tail instanceof HtmlElementAst ? path.tail : path.parentOf(path.tail);
    if (element instanceof HtmlElementAst) {
      let entries =
          attributeNames(element.name)
              .map(name => ({name, kind: 'attribute', kindModifiers: '', sortText: name}));
      return {isMemberCompletion: false, isNewIdentifierLocation: false, entries};
    }
  }

  private get program(): ts.Program { return this.service.getProgram(); }

  private get reflectorHost(): ReflectorHost {
    let result = this._refletorHost;
    if (!result) {
      result = this._refletorHost = new ReflectorHost(
          this.program, this.host, this.host.getCompilationSettings(),
          this.host.getCurrentDirectory());
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
          directiveResolver, pipeResolver, viewResolver, [], [], this.reflector);
    }
    return result;
  }

  private getSourceFile(fileName: string): ts.SourceFile {
    return this.program.getSourceFile(fileName);
  }

  private getTemplateNodeAtPosition(fileName: string, position: number):
      {sourceFile: ts.SourceFile, node: TemplateNode}|undefined {
    const sourceFile = this.getSourceFile(fileName);
    if (sourceFile) {
      const astNodes = this.getTemplateStrings(sourceFile);
      for (const node of astNodes) {
        if (node.templateString.pos <= position && node.templateString.end > position) {
          return {sourceFile, node};
        }
      }
    }
    return undefined;
  }

  private getTemplateAstAtPosition(fileName: string, position: number): TemplateInfo|undefined {
    let nodeResult = this.getTemplateNodeAtPosition(fileName, position);
    if (nodeResult) {
      let {node, sourceFile} = nodeResult;
      if (node) {
        let astResult = this.getTemplateAst(sourceFile, node);
        if (astResult) {
          let {htmlAst, templateAst} = astResult;
          if (htmlAst && templateAst) {
            return {sourceFile, templateNode: node.templateString, htmlAst, templateAst};
          }
        }
      }
    }
    return undefined;
  }

  /**
   * Retrieve the nodes that contain templates for the current file.
   */
  private getTemplateStrings(sourceFile: ts.SourceFile): TemplateNode[] {
    let result = this.nodesCache.get(sourceFile);
    let version: string = this.host.getScriptVersion(sourceFile.fileName);
    if (!result || result.version != version) {
      result = {templates: [], version};

      // Find each template string in the file
      let visit = (child: ts.Node) => {
        switch (child.kind) {
          case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
          case ts.SyntaxKind.StringLiteral:
            let [declaration, decorator] = this.getTemplateClassDecl(child);
            if (declaration) {
              result.templates.push({templateString: child, declaration, decorator});
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
      if ((parentNode as any).name.text !== 'template') {
        return missing;
      }
    }
    parentNode = parentNode.parent;  // ObjectLiteralExpression
    if (!parentNode || parentNode.kind !== ts.SyntaxKind.ObjectLiteralExpression) {
      return missing;
    }

    parentNode = parentNode.parent;  // CallExpression
    if (!parentNode || parentNode.kind !== ts.SyntaxKind.CallExpression) {
      return missing;
    }
    const callTarget = (<ts.CallExpression>parentNode).expression;

    let decorator = parentNode.parent;  // Decorator
    if (!decorator || decorator.kind !== ts.SyntaxKind.Decorator) {
      return missing;
    }

    let declaration = <ts.ClassDeclaration>decorator.parent;  // ClassDeclaration
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
      let htmlParser = new HtmlParser();
      let parser = new TemplateParser(
          new Parser(new Lexer()), new DomElementSchemaRegistry(), htmlParser, null, []);
      const type =
          this.reflectorHost.getStaticSymbol(sourceFile.fileName, node.declaration.name.text);
      let directive = this.metadataResolver.maybeGetDirectiveMetadata(<any>type);
      if (directive) {
        try {
          let templateString = this.stringOf(node.templateString);
          let htmlResult = htmlParser.parse(templateString, '');
          let parseResult = parser.tryParseHtml(
              htmlResult, directive, this.stringOf(node.templateString),
              this.metadataResolver.getViewDirectivesMetadata(type as any as Type),
              this.metadataResolver.getViewPipesMetadata(type as any as Type), '');
          result = {
            htmlAst: htmlResult.rootNodes,
            templateAst: parseResult.templateAst,
            parseErrors: parseResult.errors
          };
        } catch (e) {
          result = {errors: [{msg: e.stack, node: node.decorator}]};
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
      let r: {value?: ts.SourceFile; done?: boolean};
      for (var i = this.nodesCache.keys(); r = i.next(), !r.done;) {
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

class HtmlAstPath {
  private path: HtmlAst[];

  constructor(ast: HtmlAst[], position: number, node?: ts.Node) {
    let pos = node ? position - node.pos - 1 : position;
    let visitor = new HtmlAstPathBuilder(pos);
    htmlVisitAll(visitor, ast);
    this.path = visitor.getPath();
  }

  get empty(): boolean { return !this.path || !this.path.length; }

  get head(): HtmlAst|undefined { return this.path[0]; }

  get tail(): HtmlAst|undefined { return this.path[this.path.length - 1]; }

  parentOf(node: HtmlAst): HtmlAst|undefined { return this.path[this.path.indexOf(node) - 1]; }

  childOf(node: HtmlAst): HtmlAst|undefined { return this.path[this.path.indexOf(node) + 1]; }
}

class HtmlAstPathBuilder extends HtmlChildVisitor {
  private path: HtmlAst[] = [];

  constructor(private position: number) { super(); }

  visit(ast: HtmlAst, context: any): any {
    let span = spanOf(ast);
    if (inSpan(this.position, span)) {
      this.path.push(ast);
    } else {
      // Returning a value here will result in the children being skipped.
      return true;
    }
  }

  getPath(): HtmlAst[] { return this.path; }
}

class TemplateAstPath {
  private path: TemplateAst[];

  constructor(ast: TemplateAst[], position: number, node?: ts.Node) {
    let pos = node ? position - node.pos - 1 : position;
    let visitor = new TemplateAstPathBuilder(pos);
    templateVisitAll(visitor, ast);
    this.path = visitor.getPath();
  }

  get empty(): boolean { return !this.path || !this.path.length; }

  get head(): TemplateAst|undefined { return this.path[0]; }

  get tail(): TemplateAst|undefined { return this.path[this.path.length - 1]; }

  parentOf(node: TemplateAst): TemplateAst|undefined {
    return this.path[this.path.indexOf(node) - 1];
  }

  childOf(node: TemplateAst): TemplateAst|undefined {
    return this.path[this.path.indexOf(node) + 1];
  }
}

interface Span {
  start: number;
  end: number;
}

class TemplateAstPathBuilder extends TemplateAstChildVisitor {
  private path: TemplateAst[] = [];

  constructor(private position: number) { super(); }

  visit(ast: TemplateAst, context: any): any {
    let span = spanOf(ast);
    if (inSpan(this.position, span)) {
      if (ast instanceof ProviderAst) {
        // Ignore the ProviderAst.
        return true;
      }
      this.path.push(ast);
    } else {
      // Returning a value here will result in the children being skipped.
      return true;
    }
  }

  visitDirective(ast: DirectiveAst) {
    // The content of a directive AST is information about the referenced directive. We only
    // want the refrence not the directive itself (at this level); so ignore the children.
    return true;
  }

  getPath(): TemplateAst[] { return this.path; }
}

interface SpanHolder {
  sourceSpan: ParseSourceSpan;
  endSourceSpan?: ParseSourceSpan;
}

function isParseSourceSpan(value: any): value is ParseSourceSpan {
  return value && !!value.start;
}

function spanOf(span: SpanHolder | ParseSourceSpan): Span {
  if (isParseSourceSpan(span)) {
    return {start: span.start.offset, end: span.end.offset};
  } else {
    if (span.endSourceSpan) {
      return {start: span.sourceSpan.start.offset, end: span.endSourceSpan.end.offset};
    }
    return {start: span.sourceSpan.start.offset, end: span.sourceSpan.end.offset};
  }
}

function inSpan(position: number, span: Span): boolean {
  return position >= span.start && position < span.end;
}

function getSourceText(info: TemplateInfo, span: Span): string {
  let stringStart = info.templateNode.getStart() + 1;
  return info.sourceFile.text.substring(stringStart + span.start, stringStart + span.end);
}
