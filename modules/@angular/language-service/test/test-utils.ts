import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

export type MockData = string | MockDirectory;

export type MockDirectory = {
  [name: string]: MockData | undefined;
}

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
    let content: string|undefined;
    const names = fileName.split(path.sep);
    let basename = path.basename(fileName);
    if (/^lib.*\.d\.ts$/.test(basename)) {
      let libPath = ts.getDefaultLibFilePath(this.getCompilationSettings());
      content = fs.readFileSync(path.join(path.dirname(libPath), basename), 'utf8');
    } else {
      let effectiveName = this.getEffectiveName(fileName);
      if (effectiveName === fileName)
        content = open(fileName, this.data);
      else if (fs.existsSync(effectiveName)) {
        content = fs.readFileSync(effectiveName, 'utf8');
      }
    }
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

  private getEffectiveName(name: string): string {
    const node_modules = 'node_modules';
    if (name.startsWith('/' + node_modules)) {
      if (this.nodeModulesPath) {
        let result = path.join(this.nodeModulesPath, name.substr(node_modules.length + 1));
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