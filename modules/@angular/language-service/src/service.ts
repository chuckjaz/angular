import {CompileDirectiveMetadata, CompilePipeMetadata} from '@angular/compiler';
import {MetadataCollector, StaticReflector, StaticReflectorHost, StaticSymbol} from '@angular/compiler-cli';
import {Lexer} from '@angular/compiler/src/expression_parser/lexer';
import {Parser} from '@angular/compiler/src/expression_parser/parser';
import {HtmlAst, HtmlElementAst} from '@angular/compiler/src/html_ast';
import {HtmlParser} from '@angular/compiler/src/html_parser';
import {HtmlTagContentType, NAMED_ENTITIES, getHtmlTagDefinition, splitNsName} from '@angular/compiler/src/html_tags';
import {CompileMetadataResolver} from '@angular/compiler/src/metadata_resolver';
import {ParseError, ParseSourceSpan} from '@angular/compiler/src/parse_util';
import {DomElementSchemaRegistry} from '@angular/compiler/src/schema/dom_element_schema_registry';
import {CssSelector, SelectorMatcher} from '@angular/compiler/src/selector';
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
  type: StaticSymbol|Type;
}

export type TemplateSources = TemplateSource[] | undefined;

interface AstResult {
  htmlAst?: HtmlAst[];
  templateAst?: TemplateAst[];
  directive?: CompileDirectiveMetadata, directives?: CompileDirectiveMetadata[],
      pipes?: CompilePipeMetadata[], parseErrors?: ParseError[];
  errors?: Error[];
}

interface TemplateInfo {
  template: TemplateSource;
  htmlAst: HtmlAst[];
  directive: CompileDirectiveMetadata, directives: CompileDirectiveMetadata[],
      pipes: CompilePipeMetadata[], templateAst: TemplateAst[];
}

interface AttrInfo {
  name: string;
  input: boolean;
  output: boolean;
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
  getPlatformDirectives?(): StaticSymbol[];
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
                  let element = path.first(HtmlElementAst);
                  if (element) {
                    let definition = getHtmlTagDefinition(element.name);
                    if (definition.contentType === HtmlTagContentType.PARSABLE_DATA) {
                      // If the element can hold content Show element completions.
                      result = _this.elementCompletions(templateInfo, path);
                    }
                  } else {
                    // If no element container, implies parsable data so show elements.
                    result = _this.elementCompletions(templateInfo, path);
                  }
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
    let htmlNames = elementNames().filter(name => !(name in hiddenHtmlElements));

    // Collect the elements referenced by the selectors
    let directiveElements =
        this.getSelectors(info).selectors.map(selector => selector.element).filter(name => !!name);

    // Return all HTML elements.
    return directiveElements.concat(htmlNames).map<Completion>(
        name => ({kind: 'element', name: `<${name}`, sort: name}));
  }

  private attributeCompletions(info: TemplateInfo, path: HtmlAstPath): Completions {
    let item = path.tail instanceof HtmlElementAst ? path.tail : path.parentOf(path.tail);
    if (item instanceof HtmlElementAst) {
      let element = item;
      let attributes: AttrInfo[] = [];

      // Add html attributes
      let htmlAttributes = attributeNames(element.name) || [];
      if (htmlAttributes) {
        attributes.push(
            ...htmlAttributes.map<AttrInfo>(name => ({name, input: false, output: false})));
      }

      let {selectors, map: selectorMap} = this.getSelectors(info);
      if (selectors && selectors.length) {
        // All the attributes that are selectable should be shown.
        let attrs =
            flatten(
                selectors.filter(selector => !selector.element || selector.element == element.name)
                    .map(selector => selector.attrs.filter(a => !!a)))
                .map<AttrInfo>(name => ({name, input: false, output: false}));

        // All input and output properties of the matching directives should be added.
        let elementSelector = createElementCssSelector(element);
        let matcher = new SelectorMatcher();
        matcher.addSelectables(selectors);
        matcher.match(elementSelector, selector => {
          let directive = selectorMap.get(selector);
          if (directive) {
            attrs.push(
                ...Object.keys(directive.inputs).map(name => ({name, input: true, output: false})));
            attrs.push(...Object.keys(directive.outputs)
                           .map(name => ({name, input: false, output: true})));
          }
        });

        // If a name shows up twice, fold it into a single value.
        attrs = foldAttrs(attrs);

        // Now expand them back out to ensure that input/output shows up as well as input and
        // output.
        attributes.push(...flatten(attrs.map(expandedAttr)));
      }

      // Map all the attributes to a completion
      return attributes.map<Completion>(
          attr => ({kind: 'attribute', name: nameOfAttr(attr), sort: attr.name}));
    }
    return undefined;
  }

  private getSelectors(info: TemplateInfo):
      {selectors: CssSelector[], map: Map<CssSelector, CompileDirectiveMetadata>} {
    let map = new Map<CssSelector, CompileDirectiveMetadata>();
    let selectors = flatten(info.directives.map(directive => {
      let selectors = CssSelector.parse(directive.selector);
      selectors.forEach(selector => map.set(selector, directive));
      return selectors;
    }));
    return {selectors, map};
  }

  private getTemplateAstAtPosition(fileName: string, position: number): TemplateInfo|undefined {
    let template = this.host.getTemplateAt(fileName, position);
    if (template) {
      let astResult = this.getTemplateAst(template);
      if (astResult && astResult.htmlAst && astResult.templateAst)
        return {
          template,
          htmlAst: astResult.htmlAst,
          directive: astResult.directive,
          directives: astResult.directives,
          pipes: astResult.pipes,
          templateAst: astResult.templateAst
        };
    }
    return undefined;
  }

  private getTemplateAst(template: TemplateSource): AstResult {
    let result: AstResult;
    let htmlParser = new HtmlParser();
    let parser = new TemplateParser(
        new Parser(new Lexer()), new DomElementSchemaRegistry(), htmlParser, null, []);
    let directive = this.metadataResolver.maybeGetDirectiveMetadata(<Type>template.type);
    if (directive) {
      try {
        let htmlResult = htmlParser.parse(template.source, '');
        let directives = this.metadataResolver.getViewDirectivesMetadata(<Type>template.type);
        let pipes = this.metadataResolver.getViewPipesMetadata(<Type>template.type);
        let parseResult =
            parser.tryParseHtml(htmlResult, directive, template.source, directives, pipes, '');
        result = {
          htmlAst: htmlResult.rootNodes,
          templateAst: parseResult.templateAst, directive, directives, pipes,
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

const hiddenHtmlElements = {
  html: true,
  script: true,
  noscript: true,
  base: true,
  body: true,
  title: true,
  head: true,
  link: true,
}

function
flatten<T>(a: T[][]) {
  return (<T[]>[]).concat(...a);
}

function expandedAttr(attr: AttrInfo): AttrInfo[] {
  if (attr.input && attr.output) {
    return [
      attr, {name: attr.name, input: true, output: false},
      {name: attr.name, input: false, output: true}
    ];
  }
  return [attr];
}

function removeSuffix(value: string, suffix: string) {
  if (value.endsWith(suffix)) return value.substring(0, value.length - suffix.length);
  return value;
}
function nameOfAttr(attr: AttrInfo): string {
  let name = attr.name;
  if (attr.output) {
    name = removeSuffix(name, 'Events');
    name = removeSuffix(name, 'Changed');
  }
  let result = [name];
  if (attr.input) {
    result.unshift('[');
    result.push(']');
  }
  if (attr.output) {
    result.unshift('(');
    result.push(')');
  }
  return result.join('');
}

function foldAttrs(attrs: AttrInfo[]): AttrInfo[] {
  let map = new Map<string, AttrInfo>();
  let result: AttrInfo[] = [];
  attrs.forEach(attr => {
    let duplicate = map.get(attr.name);
    if (duplicate) {
      duplicate.input = duplicate.input || attr.input;
      duplicate.output = duplicate.output || attr.output;
    } else {
      let cloneAttr = {name: attr.name, input: attr.input, output: attr.output};
      result.push(cloneAttr);
      map.set(attr.name, cloneAttr);
    }
  }); 
  return result;
}

const templateAttr = /^(\w+:)?(template$|^\*)/;
function createElementCssSelector(element: HtmlElementAst): CssSelector {
  var cssSelector = new CssSelector();
  let elNameNoNs = splitNsName(element.name)[1];

  cssSelector.setElement(elNameNoNs);

  for (let attr of element.attrs) {
    if (!attr.name.match(templateAttr)) {
      let [_, attrNameNoNs] = splitNsName(attr.name);
      cssSelector.addAttribute(attrNameNoNs, attr.value);
      if (attr.name.toLowerCase() == 'class') {
        var classes = attr.value.split(/s+/g);
        classes.forEach(className => cssSelector.addClassName(className));
      }
    }
  }
  return cssSelector;
}
