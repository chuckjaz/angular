/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import * as ts from 'typescript';
import * as o from '../../src/output/output_ast';
import {AotCompilerHost, AotCompilerOptions, AotSummaryResolver, CompileDirectiveMetadata, CompileIdentifierMetadata, CompileMetadataResolver, CompileNgModuleMetadata, CompilePipeSummary, CompileTypeMetadata, CompilerConfig, DEFAULT_INTERPOLATION_CONFIG, DirectiveNormalizer, DirectiveResolver, DomElementSchemaRegistry, HtmlParser, Lexer, NgModuleResolver, ParseError, Parser, PipeResolver, StaticReflector, StaticSymbol, StaticSymbolCache, StaticSymbolResolver, TemplateParser, TypeScriptEmitter, analyzeNgModules, createAotUrlResolver, templateSourceUrl} from '@angular/compiler';
import {NgAnalyzedModules} from '../../src/aot/compiler';
import {ConstantPool} from '../../src/constant_pool';
import {ViewEncapsulation} from '@angular/core';
import {OutputContext, escapeRegExp} from '../../src/util';
import {BindingParser} from '../../src/template_parser/binding_parser';
import {MockAotCompilerHost, MockCompilerHost, MockData, MockDirectory, arrayToMockDir, expectNoDiagnostics, settings, toMockFileArray} from '../aot/test_util';
import * as html from '../../src/ml_parser/ast';

import {HtmlToTemplateTransform} from '../../src/render3/r3_template_transform';
import {compileComponent, compileDirective} from '../../src/render3/r3_view_compiler_2';
import {compilePipe} from '../../src/render3/r3_pipe_compiler';
import { OutputMode } from '../../src/render3/r3_types';
import {compileModuleFactory} from '../../src/render3/r3_module_factory_compiler';

export {expectEmit} from './mock_compile';

 function doCompile(
    data: MockDirectory, angularFiles: MockData, options: AotCompilerOptions = {},
    errorCollector: (error: any, fileName?: string) => void = error => { throw error; },
    compileAction: (
        outputCtx: OutputContext, analyzedModules: NgAnalyzedModules,
        resolver: CompileMetadataResolver, htmlParser: HtmlParser, templateParser: TemplateParser,
        hostBindingParser: BindingParser, reflector: StaticReflector) => void) {
  const testFiles = toMockFileArray(data);
  const scripts = testFiles.map(entry => entry.fileName);
  const angularFilesArray = toMockFileArray(angularFiles);
  const files = arrayToMockDir([...testFiles, ...angularFilesArray]);
  const mockCompilerHost = new MockCompilerHost(scripts, files);
  const compilerHost = new MockAotCompilerHost(mockCompilerHost);

  const program = ts.createProgram(scripts, {...settings}, mockCompilerHost);
  expectNoDiagnostics(program);

  // TODO(chuckj): Replace with a variant of createAotCompiler() when the r3_view_compiler is
  // integrated

  const urlResolver = createAotUrlResolver(compilerHost);
  const symbolCache = new StaticSymbolCache();
  const summaryResolver = new AotSummaryResolver(compilerHost, symbolCache);
  const symbolResolver = new StaticSymbolResolver(compilerHost, symbolCache, summaryResolver);
  const staticReflector =
      new StaticReflector(summaryResolver, symbolResolver, [], [], errorCollector);
  const htmlParser = new HtmlParser();
  const config = new CompilerConfig({
    defaultEncapsulation: ViewEncapsulation.Emulated,
    useJit: false,
    missingTranslation: options.missingTranslation,
    preserveWhitespaces: options.preserveWhitespaces,
    strictInjectionParameters: options.strictInjectionParameters,
  });
  const normalizer = new DirectiveNormalizer(
      {get: (url: string) => compilerHost.loadResource(url)}, urlResolver, htmlParser, config);
  const expressionParser = new Parser(new Lexer());
  const elementSchemaRegistry = new DomElementSchemaRegistry();
  const templateParser = new TemplateParser(
      config, staticReflector, expressionParser, elementSchemaRegistry, htmlParser, console, []);
  const resolver = new CompileMetadataResolver(
      config, htmlParser, new NgModuleResolver(staticReflector),
      new DirectiveResolver(staticReflector), new PipeResolver(staticReflector), summaryResolver,
      elementSchemaRegistry, normalizer, console, symbolCache, staticReflector, errorCollector);

  // Create the TypeScript program
  const sourceFiles = program.getSourceFiles().map(sf => sf.fileName);

  // Analyze the modules
  // TODO(chuckj): Eventually this should not be necessary as the ts.SourceFile should be sufficient
  // to generate a template definition.
  const analyzedModules = analyzeNgModules(sourceFiles, compilerHost, symbolResolver, resolver);

  const pipesOrDirectives = Array.from(analyzedModules.ngModuleByPipeOrDirective.keys());

  const fakeOutputContext: OutputContext = {
    genFilePath: 'fakeFactory.ts',
    statements: [],
    importExpr(symbol: StaticSymbol, typeParams: o.Type[]) {
      if (!(symbol instanceof StaticSymbol)) {
        if (!symbol) {
          throw new Error('Invalid: undefined passed to as a symbol');
        }
        throw new Error(`Invalid: ${(symbol as any).constructor.name} is not a symbol`);
      }
      return (symbol.members || [])
          .reduce(
              (expr, member) => expr.prop(member),
              <o.Expression>o.importExpr(new o.ExternalReference(symbol.filePath, symbol.name)));
    },
    constantPool: new ConstantPool()
  };

  const errors: ParseError[] = [];

  const hostBindingParser = new BindingParser(
      expressionParser, DEFAULT_INTERPOLATION_CONFIG, elementSchemaRegistry, [], errors);

  // Load all directives and pipes
  for (const pipeOrDirective of pipesOrDirectives) {
    const module = analyzedModules.ngModuleByPipeOrDirective.get(pipeOrDirective) !;
    resolver.loadNgModuleDirectiveAndPipeMetadata(module.type.reference, true);
  }

  compileAction(
      fakeOutputContext, analyzedModules, resolver, htmlParser, templateParser, hostBindingParser,
      staticReflector);

  fakeOutputContext.statements.unshift(...fakeOutputContext.constantPool.statements);

  const emitter = new TypeScriptEmitter();

  const moduleName = compilerHost.fileNameToModuleName(
      fakeOutputContext.genFilePath, fakeOutputContext.genFilePath);

  const result = emitter.emitStatementsAndContext(
      fakeOutputContext.genFilePath, fakeOutputContext.statements, '', false,
      /* referenceFilter */ undefined,
      /* importFilter */ e => e.moduleName != null && e.moduleName.startsWith('/app'));

  if (errors.length) {
    throw new Error('Unexpected errors:' + errors.map(e => e.toString()).join(', '));
  }

  return {source: result.sourceText, outputContext: fakeOutputContext};
}

export function compile(
    data: MockDirectory, angularFiles: MockData, options: AotCompilerOptions = {},
    errorCollector: (error: any, fileName?: string) => void = error => { throw error;}) {
  return doCompile(
      data, angularFiles, options, errorCollector,
      (outputCtx: OutputContext, analyzedModules: NgAnalyzedModules,
       resolver: CompileMetadataResolver, htmlParser: HtmlParser, templateParser: TemplateParser,
       hostBindingParser: BindingParser, reflector: StaticReflector) => {
        const pipesOrDirectives = Array.from(analyzedModules.ngModuleByPipeOrDirective.keys());
        for (const pipeOrDirective of pipesOrDirectives) {
          const module = analyzedModules.ngModuleByPipeOrDirective.get(pipeOrDirective);
          if (!module || !module.type.reference.filePath.startsWith('/app')) {
            continue;
          }
          if (resolver.isDirective(pipeOrDirective)) {
            const metadata = resolver.getDirectiveMetadata(pipeOrDirective);
            if (metadata.isComponent) {
              const fakeUrl = 'ng://fake-template-url.html';
              const htmlAst = htmlParser.parse(metadata.template !.template !, fakeUrl);

              const directives = module.transitiveModule.directives.map(
                  dir => resolver.getDirectiveSummary(dir.reference));

              const transform = new HtmlToTemplateTransform(hostBindingParser);
              const nodes = html.visitAll(transform, htmlAst.rootNodes, null);
              compileComponent(
                  outputCtx, metadata, nodes, reflector, hostBindingParser,
                  OutputMode.PartialClass);
            } else {
              compileDirective(
                  outputCtx, metadata, reflector, hostBindingParser, OutputMode.PartialClass);
            }
          } else if (resolver.isPipe(pipeOrDirective)) {
            const metadata = resolver.getPipeMetadata(pipeOrDirective);
            if (metadata) {
              compilePipe(outputCtx, metadata, reflector, OutputMode.PartialClass);
            }
          }
        }

      });
}
