import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

export type MockData = string | MockDirectory;

export type MockDirectory = {
  [name: string]: MockData | undefined;
}

const angularts = /@angular\/(\w|\/|-)+\.tsx?$/;
const rxjsts = /rxjs\/(\w|\/)+\.tsx?$/;

/* The missing cache does two things. First it improves performance of the
   tests as it reduces the number of OS calls made during testing. Also it
   improves debugging experience as fewer exceptions are raised allow you
   to use stopping on all exceptions. */
const missingCache = new Map<string, boolean>();
missingCache.set('/node_modules/@angular/core.d.ts', true);
missingCache.set('/node_modules/@angular/core/package.json', true);
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
missingCache.set('/node_modules/@angular/core/src/linker/view_container_ref.metadata.json', true);

export class MockTypescriptHost implements ts.LanguageServiceHost {
  private angularPath: string;
  private nodeModulesPath: string;
  constructor(private scriptNames: string[], private data: MockData) {
    let angularIndex = module.filename.indexOf('@angular');
    if (angularIndex >= 0) this.angularPath = module.filename.substr(0, angularIndex);
    let distIndex = module.filename.indexOf('/dist/all');
    if (distIndex >= 0)
      this.nodeModulesPath = path.join(module.filename.substr(0, distIndex), 'node_modules');
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

  getProjectVersion(): string { return '0'; }

  getScriptFileNames(): string[] { return this.scriptNames; }

  getScriptVersion(fileName: string): string { return '1'; }

  getScriptSnapshot(fileName: string): ts.IScriptSnapshot {
    let content = this.getFileContent(fileName);
    if (content) return ts.ScriptSnapshot.fromString(removeLocationMarkers(content));
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
    let content = this.getFileContent(fileName);
    if (content) {
      return getLocationMarkers(content);
    }
    return undefined;
  }

  private getFileContent(fileName: string): string {
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
      else if (!fileName.match(angularts) && !fileName.match(rxjsts)) {
        if (fs.existsSync(effectiveName)) {
          return fs.readFileSync(effectiveName, 'utf8');
        } else {
          missingCache.set(fileName, true);
          console.log(`MISSING: ${fileName} missing`);
        }
      }
    }
    return undefined;
  }

  private getEffectiveName(name: string): string {
    const node_modules = 'node_modules';
    if (name.startsWith('/' + node_modules)) {
      if (this.nodeModulesPath && !name.startsWith('/' + node_modules + '/@angular')) {
        let result = path.join(this.nodeModulesPath, name.substr(node_modules.length + 1));
        if (!name.match(rxjsts))
          if (fs.existsSync(result)) {
            return result;
          }
      }
      if (this.angularPath) {
        return path.join(this.angularPath, name.substr(node_modules.length + 1));
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
  let result: {[name: string]: number} = {};
  let adjustment = 0;
  value.replace(locationMarker, (match: string, name: string, _: any, index: number): string => {
    result[name] = index - adjustment;
    adjustment += match.length;
    return '';
  });
  return result;
}
