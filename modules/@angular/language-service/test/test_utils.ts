/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

/// <reference path="../../../../node_modules/@types/node/index.d.ts" />
/// <reference path="../../../../node_modules/@types/jasmine/index.d.ts" />

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import {Diagnostic, Diagnostics, Span} from '../src/types';

export type MockData = string | MockDirectory;

export type MockDirectory = {
  [name: string]: MockData | undefined;
}

const angularts = /@angular\/(\w|\/|-)+\.tsx?$/;
const rxjsts = /rxjs\/(\w|\/)+\.tsx?$/;
const rxjsmetadata = /rxjs\/(\w|\/)+\.metadata\.json?$/;
const tsxfile = /\.tsx$/;

/* The missing cache does two things. First it improves performance of the
   tests as it reduces the number of OS calls made during testing. Also it
   improves debugging experience as fewer exceptions are raised allow you
   to use stopping on all exceptions. */
const missingCache = new Map<string, boolean>();

missingCache.set('/node_modules/events.ts', true);
missingCache.set('/node_modules/events.d.ts', true);
missingCache.set('/node_modules/events/index.ts', true);
missingCache.set('/node_modules/events/index.d.ts', true);
missingCache.set('/node_modules/@types/events.ts', true);
missingCache.set('/node_modules/@types/events.d.ts', true);
missingCache.set('/node_modules/net.ts', true);
missingCache.set('/node_modules/net.d.ts', true);
missingCache.set('/node_modules/@types/net.ts', true);
missingCache.set('/node_modules/@types/net.d.ts', true);
missingCache.set('/node_modules/stream.ts', true);
missingCache.set('/node_modules/stream.d.ts', true);
missingCache.set('/node_modules/@types/stream.ts', true);
missingCache.set('/node_modules/@types/stream.d.ts', true);
missingCache.set('/node_modules/child_process.ts', true);
missingCache.set('/node_modules/child_process.d.ts', true);
missingCache.set('/node_modules/@types/child_process.ts', true);
missingCache.set('/node_modules/@types/child_process.d.ts', true);
missingCache.set('/node_modules/tls.ts', true);
missingCache.set('/node_modules/tls.d.ts', true);
missingCache.set('/node_modules/@types/tls.ts', true);
missingCache.set('/node_modules/@types/tls.d.ts', true);
missingCache.set('/node_modules/http.ts', true);
missingCache.set('/node_modules/http.d.ts', true);
missingCache.set('/node_modules/@types/http.ts', true);
missingCache.set('/node_modules/@types/http.d.ts', true);
missingCache.set('/node_modules/crypto.ts', true);
missingCache.set('/node_modules/crypto.d.ts', true);
missingCache.set('/node_modules/@types/crypto.ts', true);
missingCache.set('/node_modules/@types/crypto.d.ts', true);
missingCache.set('/node_modules/@types/node/index.metadata.json', true);
missingCache.set('/node_modules/@angular/core.d.ts', true);
missingCache.set('/node_modules/@angular/core/package.json', true);
missingCache.set('/node_modules/@angular/core/src/di/provider.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/di/reflective_provider.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/error_handler.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/facade/errors.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/facade/collection.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/animation/animation_output.metadata.json', true);
missingCache.set(
    '/node_modules/@angular/core/src/animation/animation_transition_event.metadata.json', true);
missingCache.set(
    '/node_modules/@angular/core/src/linker/animation_view_context.metadata.json', true);
missingCache.set('/node_modules/@angular/http.d.ts', true);
missingCache.set('/node_modules/@angular/http/package.json', true);
missingCache.set('/node_modules/@angular/platform-browser.d.ts', true);
missingCache.set('/node_modules/@angular/platform-browser/package.json', true);
missingCache.set('/node_modules/@angular/common.d.ts', true);
missingCache.set('/node_modules/@angular/common/package.json', true);
missingCache.set('/node_modules/@angular/router-deprecated.d.ts', true);
missingCache.set('/node_modules/@angular/router-deprecated/package.json', true);
missingCache.set(
    '/node_modules/@angular/common/src/location/platform_location.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/di/metadata.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/di/forward_ref.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/di/reflective_key.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/di/reflective_injector.metadata.json', true);
missingCache.set(
    '/node_modules/@angular/core/src/facade/base_wrapped_exception.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/facade/exception_handler.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/di/reflective_exceptions.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/di/opaque_token.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/di.metadata.json', true);
missingCache.set(
    '/node_modules/@angular/core/src/change_detection/change_detector_ref.metadata.json', true);
missingCache.set(
    '/node_modules/@angular/core/src/change_detection/differs/iterable_differs.metadata.json',
    true);
missingCache.set(
    '/node_modules/@angular/core/src/change_detection/differs/keyvalue_differs.metadata.json',
    true);
missingCache.set(
    '/node_modules/@angular/core/src/change_detection/differs/default_iterable_differ.metadata.json',
    true);
missingCache.set(
    '/node_modules/@angular/core/src/change_detection/differs/default_keyvalue_differ.metadata.json',
    true);
missingCache.set(
    '/node_modules/@angular/core/src/change_detection/pipe_transform.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/metadata/directives.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/util/decorators.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/util.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/linker/element_ref.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/facade/promise.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/facade/async.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/linker/query_list.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/animation/animation_styles.metadata.json', true);
missingCache.set(
    '/node_modules/@angular/core/src/animation/animation_keyframe.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/animation/animation_player.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/render/api.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/linker/view_ref.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/linker/debug_context.metadata.json', true);
missingCache.set(
    '/node_modules/@angular/core/src/animation/view_animation_map.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/linker/view.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/linker/template_ref.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/linker/view_container_ref.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/linker/element.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/linker/component_factory.metadata.json', true);
missingCache.set(
    '/node_modules/@angular/core/src/linker/component_factory_resolver.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/linker/ng_module_factory.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/zone/ng_zone_impl.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/zone/ng_zone.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/zone.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/render.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/linker/component_resolver.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/linker/exceptions.metadata.json', true);
missingCache.set(
    '/node_modules/@angular/core/src/linker/ng_module_factory_loader.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/linker.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/change_detection.metadata.json', true);
missingCache.set(
    '/node_modules/@angular/core/src/animation/animation_group_player.metadata.json', true);
missingCache.set(
    '/node_modules/@angular/core/src/animation/animation_sequence_player.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/debug/debug_renderer.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/profile/wtf_init.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/reflection/types.metadata.json', true);
missingCache.set(
    '/node_modules/@angular/core/src/reflection/platform_reflection_capabilities.metadata.json',
    true);
missingCache.set('/node_modules/@angular/core/src/reflection/reflector_reader.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/reflection/reflector.metadata.json', true);
missingCache.set(
    '/node_modules/@angular/core/src/reflection/reflection_capabilities.metadata.json', true);
missingCache.set('/node_modules/@angular/core/src/linker/view_container.metadata.json', true);
missingCache.set(
    '/node_modules/@angular/core/src/animation/animation_transition.metadata.json', true);
missingCache.set('/node_modules/@angular/core/index.metadata.json', true);
missingCache.set('/node_modules/@angular/http/src/headers.metadata.json', true);
missingCache.set('/node_modules/@angular/http/src/body.metadata.json', true);
missingCache.set('/node_modules/@angular/http/src/static_request.metadata.json', true);
missingCache.set('/node_modules/@angular/http/src/url_search_params.metadata.json', true);
missingCache.set('/node_modules/@angular/http/src/interfaces.metadata.json', true);
missingCache.set('/node_modules/@angular/http/src/static_response.metadata.json', true);
missingCache.set('/node_modules/@angular/http/index.metadata.json', true);
missingCache.set(
    '/node_modules/@angular/platform-browser/src/dom/animation_driver.metadata.json', true);
missingCache.set('/node_modules/@angular/common/src/facade/promise.metadata.json', true);
missingCache.set('/node_modules/@angular/common/src/facade/async.metadata.json', true);
missingCache.set('/node_modules/@angular/common/src/localization.metadata.json', true);
missingCache.set('/node_modules/@angular/common/src/pipes.metadata.json', true);
missingCache.set('/node_modules/@angular/common/src/directives.metadata.json', true);
missingCache.set(
    '/node_modules/@angular/common/src/forms-deprecated/directives/abstract_control_directive.metadata.json',
    true);
missingCache.set(
    '/node_modules/@angular/common/src/forms-deprecated/directives/ng_control.metadata.json', true);
missingCache.set(
    '/node_modules/@angular/common/src/forms-deprecated/directives/form_interface.metadata.json',
    true);
missingCache.set(
    '/node_modules/@angular/common/src/forms-deprecated/directives/control_container.metadata.json',
    true);
missingCache.set('/node_modules/@angular/common/src/location.metadata.json', true);
missingCache.set('/node_modules/@angular/platform-browser/src/browser/title.metadata.json', true);
missingCache.set(
    '/node_modules/@angular/platform-browser/src/browser/tools/tools.metadata.json', true);
missingCache.set('/node_modules/@angular/platform-browser/src/dom/debug/by.metadata.json', true);
missingCache.set(
    '/node_modules/@angular/platform-browser/src/dom/events/hammer_common.metadata.json', true);
missingCache.set('/node_modules/@angular/platform-browser/src/facade/promise.metadata.json', true);
missingCache.set('/node_modules/@angular/platform-browser/src/facade/async.metadata.json', true);
missingCache.set(
    '/node_modules/@angular/platform-browser/src/web_workers/shared/message_bus.metadata.json',
    true);
missingCache.set('/node_modules/@angular/platform-browser/index.metadata.json', true);
missingCache.set('/node_modules/@angular/router-deprecated/src/facade/promise.metadata.json', true);
missingCache.set('/node_modules/@angular/router-deprecated/src/facade/async.metadata.json', true);
missingCache.set(
    '/node_modules/@angular/router-deprecated/src/rules/route_paths/route_path.metadata.json',
    true);
missingCache.set(
    '/node_modules/@angular/router-deprecated/src/rules/route_paths/regex_route_path.metadata.json',
    true);
missingCache.set(
    '/node_modules/@angular/router-deprecated/src/route_definition.metadata.json', true);
missingCache.set(
    '/node_modules/@angular/router-deprecated/src/route_config/route_config_impl.metadata.json',
    true);
missingCache.set('/node_modules/@angular/router-deprecated/src/interfaces.metadata.json', true);
missingCache.set('/node_modules/@angular/router-deprecated/index.metadata.json', true);
missingCache.set('/node_modules/@angular/forms.d.ts', true);
missingCache.set(
    '/node_modules/@angular/forms/src/directives/abstract_control_directive.metadata.json', true);
missingCache.set('/node_modules/@angular/forms/src/directives/ng_control.metadata.json', true);
missingCache.set('/node_modules/@angular/forms/src/directives/form_interface.metadata.json', true);
missingCache.set(
    '/node_modules/@angular/forms/src/directives/control_container.metadata.json', true);
missingCache.set(
    '/node_modules/@angular/forms/src/directives/abstract_form_group_directive.metadata.json',
    true);

export class MockTypescriptHost implements ts.LanguageServiceHost {
  private angularPath: string;
  private nodeModulesPath: string;
  private scriptVersion = new Map<string, number>();
  private overrides = new Map<string, string>();
  private projectVersion = 0;

  constructor(private scriptNames: string[], private data: MockData) {
    let angularIndex = module.filename.indexOf('@angular');
    if (angularIndex >= 0)
      this.angularPath =
          module.filename.substr(0, angularIndex).replace('/all/', '/packages-dist/');
    let distIndex = module.filename.indexOf('/dist/all');
    if (distIndex >= 0)
      this.nodeModulesPath = path.join(module.filename.substr(0, distIndex), 'node_modules');
  }

  override(fileName: string, content: string) {
    this.scriptVersion.set(fileName, (this.scriptVersion.get(fileName) || 0) + 1);
    if (fileName.endsWith('.ts')) {
      this.projectVersion++;
    }
    if (content) {
      this.overrides.set(fileName, content);
    } else {
      this.overrides.delete(fileName);
    }
  }

  getCompilationSettings(): ts.CompilerOptions {
    return {
      target: ts.ScriptTarget.ES5,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      emitDecoratorMetadata: true,
      experimentalDecorators: true,
      removeComments: false,
      noImplicitAny: false,
      lib: ['lib.es2015.d.ts', 'lib.dom.d.ts'],
    };
  }

  getProjectVersion(): string { return this.projectVersion.toString(); }

  getScriptFileNames(): string[] { return this.scriptNames; }

  getScriptVersion(fileName: string): string {
    return (this.scriptVersion.get(fileName) || 0).toString();
  }

  getScriptSnapshot(fileName: string): ts.IScriptSnapshot {
    const content = this.getFileContent(fileName);
    if (content) return ts.ScriptSnapshot.fromString(content);
    return undefined;
  }

  getCurrentDirectory(): string { return '/'; }

  getDefaultLibFileName(options: ts.CompilerOptions): string { return 'lib.d.ts'; }

  directoryExists(directoryName: string): boolean {
    let effectiveName = this.getEffectiveName(directoryName);
    if (effectiveName === directoryName)
      return directoryExists(directoryName, this.data);
    else
      return fs.existsSync(effectiveName);
  }

  getMarkerLocations(fileName: string): {[name: string]: number}|undefined {
    let content = this.getRawFileContent(fileName);
    if (content) {
      return getLocationMarkers(content);
    }
  }

  getReferenceMarkers(fileName: string): ReferenceResult {
    let content = this.getRawFileContent(fileName);
    if (content) {
      return getReferenceMarkers(content);
    }
  }

  getFileContent(fileName: string): string {
    const content = this.getRawFileContent(fileName);
    if (content) return removeReferenceMarkers(removeLocationMarkers(content));
  }

  private getRawFileContent(fileName: string): string {
    if (this.overrides.has(fileName)) {
      return this.overrides.get(fileName);
    }
    let basename = path.basename(fileName);
    if (/^lib.*\.d\.ts$/.test(basename)) {
      let libPath = ts.getDefaultLibFilePath(this.getCompilationSettings());
      return fs.readFileSync(path.join(path.dirname(libPath), basename), 'utf8');
    } else {
      if (missingCache.has(fileName)) {
        return undefined;
      }
      let effectiveName = this.getEffectiveName(fileName);
      if (effectiveName === fileName)
        return open(fileName, this.data);
      else if (
          !fileName.match(angularts) && !fileName.match(rxjsts) && !fileName.match(rxjsmetadata) &&
          !fileName.match(tsxfile)) {
        if (fs.existsSync(effectiveName)) {
          return fs.readFileSync(effectiveName, 'utf8');
        } else {
          missingCache.set(fileName, true);
          console.log(`MISSING: ${fileName} missing`);
        }
      }
    }
  }

  private getEffectiveName(name: string): string {
    const node_modules = 'node_modules';
    const at_angular = '/@angular';
    if (name.startsWith('/' + node_modules)) {
      if (this.nodeModulesPath && !name.startsWith('/' + node_modules + at_angular)) {
        let result = path.join(this.nodeModulesPath, name.substr(node_modules.length + 1));
        if (!name.match(rxjsts))
          if (fs.existsSync(result)) {
            return result;
          }
      }
      if (this.angularPath && name.startsWith('/' + node_modules + at_angular)) {
        return path.join(
            this.angularPath, name.substr(node_modules.length + at_angular.length + 1));
      }
    }
    return name;
  }
}

function find(fileName: string, data: MockData): MockData|undefined {
  let names = fileName.split('/');
  if (names.length && !names[0].length) names.shift();
  let current = data;
  for (let name of names) {
    if (typeof current === 'string')
      return undefined;
    else
      current = (<MockDirectory>current)[name];
    if (!current) return undefined;
  }
  return current;
}

function open(fileName: string, data: MockData): string|undefined {
  let result = find(fileName, data);
  if (typeof result === 'string') {
    return result;
  }
  return undefined;
}

function directoryExists(dirname: string, data: MockData): boolean {
  let result = find(dirname, data);
  return result && typeof result !== 'string';
}

const locationMarker = /\~\{(\w+(-\w+)*)\}/g;

function removeLocationMarkers(value: string): string {
  return value.replace(locationMarker, '');
}

function getLocationMarkers(value: string): {[name: string]: number} {
  value = removeReferenceMarkers(value);
  let result: {[name: string]: number} = {};
  let adjustment = 0;
  value.replace(locationMarker, (match: string, name: string, _: any, index: number): string => {
    result[name] = index - adjustment;
    adjustment += match.length;
    return '';
  });
  return result;
}

const referenceMarker = /«(((\w|\-)+)|([^∆]*∆(\w+)∆.[^»]*))»/g;
const definitionMarkerGroup = 1;
const nameMarkerGroup = 2;

export type ReferenceMarkers = {
  [name: string]: Span[]
};
export interface ReferenceResult {
  text: string;
  definitions: ReferenceMarkers;
  references: ReferenceMarkers;
}

function getReferenceMarkers(value: string): ReferenceResult {
  const references: ReferenceMarkers = {};
  const definitions: ReferenceMarkers = {};
  value = removeLocationMarkers(value);

  let adjustment = 0;
  const text = value.replace(
      referenceMarker, (match: string, text: string, reference: string, _: string,
                        definition: string, definitionName: string, index: number): string => {
        const result = reference ? text : text.replace(/∆/g, '');
        const span: Span = {start: index - adjustment, end: index - adjustment + result.length};
        const markers = reference ? references : definitions;
        const name = reference || definitionName;
        (markers[name] = (markers[name] || [])).push(span);
        adjustment += match.length - result.length;
        return result;
      });

  return {text, definitions, references};
}

function removeReferenceMarkers(value: string): string {
  return value.replace(referenceMarker, (match, text) => text.replace(/∆/g, ''));
}

export function noDiagnostics(diagnostics: Diagnostics) {
  if (diagnostics && diagnostics.length) {
    throw new Error(`Unexpected diagnostics: \n  ${diagnostics.map(d => d.message).join('\n  ')}`);
  }
}

export function includeDiagnostic(
    diagnostics: Diagnostics, message: string, text?: string, len?: string): void;
export function includeDiagnostic(
    diagnostics: Diagnostics, message: string, at?: number, len?: number): void;
export function includeDiagnostic(diagnostics: Diagnostics, message: string, p1?: any, p2?: any) {
  expect(diagnostics).toBeDefined();
  if (diagnostics) {
    const diagnostic = diagnostics.find(d => d.message.indexOf(message) >= 0) as Diagnostic;
    expect(diagnostic).toBeDefined();
    if (diagnostic && p1 != null) {
      const at = typeof p1 === 'number' ? p1 : p2.indexOf(p1);
      const len = typeof p2 === 'number' ? p2 : p1.length;
      expect(diagnostic.span.start).toEqual(at);
      if (len != null) {
        expect(diagnostic.span.end - diagnostic.span.start).toEqual(len);
      }
    }
  }
}