import {CompileDirectiveMetadata} from '@angular/compiler';
import {MetadataCollector, StaticReflector, StaticReflectorHost} from '@angular/compiler-cli';
import {Lexer} from '@angular/compiler/src/expression_parser/lexer';
import {Parser} from '@angular/compiler/src/expression_parser/parser';
import {HtmlAst, HtmlElementAst} from '@angular/compiler/src/html_ast';
import {HtmlParser} from '@angular/compiler/src/html_parser';
import {NAMED_ENTITIES} from '@angular/compiler/src/html_tags';
import {CompileMetadataResolver} from '@angular/compiler/src/metadata_resolver';
import {ParseError, ParseSourceSpan} from '@angular/compiler/src/parse_util';
import {DomElementSchemaRegistry} from '@angular/compiler/src/schema/dom_element_schema_registry';
import {TemplateAst} from '@angular/compiler/src/template_ast';
import {TemplateParser} from '@angular/compiler/src/template_parser';
import {Type} from '@angular/core';

import {attributeNames, elementNames} from './html_info';
import {HtmlAstPath} from './html_path';
import {inSpan, offsetSpan, spanOf} from './utils';

export interface Span {
  start: number;
  end: number;
}

export interface TemplateSource {
  source: string;
  version: string;
  span: Span;
  type: Type;
}

export type TemplateSources = TemplateSource[] | undefined;

interface AstResult {
  htmlAst?: HtmlAst[];
  templateAst?: TemplateAst[];
  parseErrors?: ParseError[];
  errors?: Error[];
}

interface TemplateInfo {
  template: TemplateSource;
  htmlAst: HtmlAst[];
  templateAst: TemplateAst[];
}

export interface Error {
  span: Span;
  message: string;
}
export type Errors = Error[] | undefined;

export interface LanguageServiceHost {
  readonly resolver: CompileMetadataResolver;

  getTemplateAt(fileName: string, position: number): TemplateSource|undefined;
  getTemplates(fileName: string): TemplateSources;
}

export interface Completion {
  kind: 'element'|'attribute'|'entity'|'member';
  name: string;
  sort: string;
}

export type Completions = Completion[] | undefined;

export interface LanguageService {
  getDiagnostics(fileName: string): Errors;
  getCompletionsAt(fileName: string, position: number): Completions;
}

export function createLanguageService(host: LanguageServiceHost): LanguageService {
  return new LanguageServiceImpl(host);
}

class LanguageServiceImpl implements LanguageService {
  constructor(private host: LanguageServiceHost) {}

  private get metadataResolver(): CompileMetadataResolver { return this.host.resolver; }

  getDiagnostics(fileName: string): Errors {
    let results: Errors = undefined;
    let templates = this.host.getTemplates(fileName);
    if (templates && templates.length) {
      for (const template of templates) {
        const ast = this.getTemplateAst(template);
        results =
            (ast.parseErrors || [])
                .map<Error>(
                    e => ({span: offsetSpan(spanOf(e.span), template.span.start), message: e.msg}))
                .concat(ast.errors || []);
      }
    }
    return results;
  }

  getCompletionsAt(fileName: string, position: number): Completions {
    let result: Completions = undefined;
    let templateInfo = this.getTemplateAstAtPosition(fileName, position);
    if (templateInfo) {
      let {htmlAst, templateAst, template} = templateInfo;
      // The templateNode starts at the delimiter character so we add 1 to skip it.
      let templatePosition = position - template.span.start;
      let path = new HtmlAstPath(htmlAst, templatePosition);
      let mostSpecific = path.tail;
      if (!path.empty) {
        let astPosition = templatePosition - mostSpecific.sourceSpan.start.offset;
        let _this = this;
        mostSpecific.visit(
            {
              visitElement(ast) {
                let startTagSpan = spanOf(ast.sourceSpan);
                let tagLen = ast.name.length;
                if (templatePosition <=
                    startTagSpan.start + tagLen + 1 /* 1 for the opening angle bracked */) {
                  // If we are in the tag then return the element completions.
                  result = _this.elementCompletions(templateInfo, path);
                } else if (templatePosition < startTagSpan.end) {
                  // We are in the attribute section of the element (but not in an attribute).
                  // Return
                  // the attribute completions.
                  result = _this.attributeCompletions(templateInfo, path);
                }
              },
              visitAttr(ast) {
                if (!inSpan(templatePosition, spanOf(ast.valueSpan))) {
                  // We are in the name of an attribute. Show attribute completions.
                  result = _this.attributeCompletions(templateInfo, path);
                }
              },
              visitText(ast) {
                // Check if we are in a entity.
                result = _this.entityCompletions(getSourceText(template, spanOf(ast)), astPosition);
                if (!result) {
                  // Show element completions.
                  result = _this.elementCompletions(templateInfo, path);
                }
              },
              visitComment(ast) {},
              visitExpansion(ast) {},
              visitExpansionCase(ast) {}
            },
            null);
      }
    }
    return result;
  }

  private entityCompletions(value: string, position: number): Completions {
    // Look for entity completions
    const re = /&[A-Za-z]*;?(?!\d)/g;
    let found: RegExpExecArray|null;
    let result: Completions;
    while (found = re.exec(value)) {
      let len = found[0].length;
      if (position >= found.index && position < (found.index + len)) {
        result = Object.keys(NAMED_ENTITIES)
                     .map<Completion>(name => ({kind: 'entity', name: `&${name};`, sort: name}));
        break;
      }
    }
    return result;
  }

  private elementCompletions(info: TemplateInfo, path: HtmlAstPath): Completions {
    // Return all HTML elements.
    return elementNames().map<Completion>(
        name => ({kind: 'element', name: `<${name}`, sort: name}));
  }

  private attributeCompletions(templateInfo: TemplateInfo, path: HtmlAstPath): Completions {
    let element = path.tail instanceof HtmlElementAst ? path.tail : path.parentOf(path.tail);
    if (element instanceof HtmlElementAst) {
      let names = attributeNames(element.name);
      if (names) {
        return names.map<Completion>(name => ({kind: 'attribute', name, sort: name}));
      }
    }
    return undefined;
  }

  private getTemplateAstAtPosition(fileName: string, position: number): TemplateInfo|undefined {
    let template = this.host.getTemplateAt(fileName, position);
    if (template) {
      let astResult = this.getTemplateAst(template);
      if (astResult.htmlAst && astResult.templateAst)
        return {template, htmlAst: astResult.htmlAst, templateAst: astResult.templateAst};
    }
    return undefined;
  }

  private getTemplateAst(template: TemplateSource): AstResult {
    let result: AstResult;
    let htmlParser = new HtmlParser();
    let parser = new TemplateParser(
        new Parser(new Lexer()), new DomElementSchemaRegistry(), htmlParser, null, []);
    let directive = this.metadataResolver.maybeGetDirectiveMetadata(template.type);
    if (directive) {
      try {
        let htmlResult = htmlParser.parse(template.source, '');
        let parseResult = parser.tryParseHtml(
            htmlResult, directive, template.source,
            this.metadataResolver.getViewDirectivesMetadata(template.type),
            this.metadataResolver.getViewPipesMetadata(template.type), '');
        result = {
          htmlAst: htmlResult.rootNodes,
          templateAst: parseResult.templateAst,
          parseErrors: parseResult.errors
        };
      } catch (e) {
        result = {errors: [{message: e.stack, span: template.span}]};
      }
    }
    return result;
  }
}

function getSourceText(template: TemplateSource, span: Span): string {
  return template.source.substring(span.start, span.end);
}