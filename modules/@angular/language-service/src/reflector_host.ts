/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {StaticReflectorHost, StaticSymbol} from '@angular/compiler-cli/src/static_reflector';
import {AssetUrl} from '@angular/compiler/src/output/path_util';
import {MetadataCollector} from '@angular/tsc-wrapped/src/collector';
import {ModuleMetadata} from '@angular/tsc-wrapped/src/schema';
import * as path from 'path';
import * as ts from 'typescript';

const EXT = /(\.ts|\.d\.ts|\.js|\.jsx|\.tsx)$/;
const DTS = /\.d\.ts$/;

let serialNumber = 0;

class ReflectorModuleModuleResolutionHost implements ts.ModuleResolutionHost {
  private forceExists: string[] = [];

  constructor(private host: ts.LanguageServiceHost) {
    if (host.directoryExists)
      this.directoryExists = directoryName => this.host.directoryExists(directoryName);
  }

  fileExists(fileName: string): boolean {
    return !!this.host.getScriptSnapshot(fileName) || this.forceExists.indexOf(fileName) >= 0;
  }

  readFile(fileName: string): string {
    let snapshot = this.host.getScriptSnapshot(fileName);
    if (snapshot) {
      return snapshot.getText(0, snapshot.getLength());
    }
  }

  directoryExists: (directoryName: string) => boolean;

  forceExist(fileName: string): void { this.forceExists.push(fileName); }
}

export class ReflectorHost implements StaticReflectorHost {
  private metadataCollector: MetadataCollector;
  private moduleResolverHost: ReflectorModuleModuleResolutionHost;
  private _typeChecker: ts.TypeChecker;
  private metadataCache = new Map<string, MetadataCacheEntry>();

  constructor(
      private getProgram: () => ts.Program, private serviceHost: ts.LanguageServiceHost,
      private options: ts.CompilerOptions, private basePath: string) {
    this.moduleResolverHost = new ReflectorModuleModuleResolutionHost(serviceHost);
    this.metadataCollector = new MetadataCollector();
  }

  angularImportLocations() {
    return {
      coreDecorators: '@angular/core/src/metadata',
      diDecorators: '@angular/core/src/di/metadata',
      diMetadata: '@angular/core/src/di/metadata',
      diOpaqueToken: '@angular/core/src/di/opaque_token',
      animationMetadata: '@angular/core/src/animation/metadata',
      provider: '@angular/core/src/di/provider'
    };
  }

  getCanonicalFileName(fileName: string): string { return fileName; }

  private get program() { return this.getProgram(); }

  private resolve(m: string, containingFile: string) {
    m = m.replace(EXT, '');
    const resolved = ts.resolveModuleName(m, containingFile, this.options, this.moduleResolverHost)
                         .resolvedModule;
    return resolved ? resolved.resolvedFileName : null;
  };

  private normalizeAssetUrl(url: string): string {
    let assetUrl = AssetUrl.parse(url);
    return assetUrl ? `${assetUrl.packageName}/${assetUrl.modulePath}` : null;
  }

  private resolveAssetUrl(url: string, containingFile: string): string {
    let assetUrl = this.normalizeAssetUrl(url);
    if (assetUrl) {
      return this.resolve(assetUrl, containingFile);
    }
    return url;
  }

  /**
   * We want a moduleId that will appear in import statements in the generated code.
   * These need to be in a form that system.js can load, so absolute file paths don't work.
   * Relativize the paths by checking candidate prefixes of the absolute path, to see if
   * they are resolvable by the moduleResolution strategy from the CompilerHost.
   */
  getImportPath(containingFile: string, importedFile: string) {
    importedFile = this.resolveAssetUrl(importedFile, containingFile);
    containingFile = this.resolveAssetUrl(containingFile, '');

    // TODO(tbosch): if a file does not yet exist (because we compile it later),
    // we still need to create it so that the `resolve` method works!
    if (!this.moduleResolverHost.fileExists(importedFile)) {
      this.moduleResolverHost.forceExist(importedFile);
    }

    const parts = importedFile.replace(EXT, '').split(path.sep).filter(p => !!p);

    for (let index = parts.length - 1; index >= 0; index--) {
      let candidate = parts.slice(index, parts.length).join(path.sep);
      if (this.resolve('.' + path.sep + candidate, containingFile) === importedFile) {
        return `./${candidate}`;
      }
      if (this.resolve(candidate, containingFile) === importedFile) {
        return candidate;
      }
    }
    throw new Error(
        `Unable to find any resolvable import for ${importedFile} relative to ${containingFile}`);
  }

  private get typeChecker(): ts.TypeChecker {
    let result = this._typeChecker;
    if (!result) {
      result = this._typeChecker = this.program.getTypeChecker();
    }
    return result;
  }

  findDeclaration(
      module: string, symbolName: string, containingFile: string,
      containingModule?: string): StaticSymbol {
    if (!containingFile || !containingFile.length) {
      if (module.indexOf('.') === 0) {
        throw new Error('Resolution of relative paths requires a containing file.');
      }

      // Any containing file gives the same result for absolute imports
      containingFile = path.join(this.basePath, 'index.ts');
    }

    try {
      let assetUrl = this.normalizeAssetUrl(module);
      if (assetUrl) {
        module = assetUrl;
      }

      // Special case: if module and containingFile are equal, assume the name is the source file
      // name
      // an import name.
      const filePath = module !== containingFile ? this.resolve(module, containingFile) : module;

      if (!filePath) {
        throw new Error(`Could not resolve module ${module} relative to ${containingFile}`);
      }

      const tc = this.typeChecker;
      const sf = this.program.getSourceFile(filePath);
      if (!sf || !(<any>sf).symbol) {
        return this.getStaticSymbol(filePath, symbolName);
      }

      let symbol = tc.getExportsOfModule((<any>sf).symbol).find(m => m.name === symbolName);
      if (!symbol) {
        throw new Error(`can't find symbol ${symbolName} exported from module ${filePath}`);
      }
      if (symbol &&
          symbol.flags & ts.SymbolFlags.Alias) {  // This is an alias, follow what it aliases
        symbol = tc.getAliasedSymbol(symbol);
      }
      const declaration = symbol.getDeclarations()[0];
      const declarationFile = declaration.getSourceFile().fileName;

      return this.getStaticSymbol(declarationFile, symbol.getName());
    } catch (e) {
      console.error(`can't resolve module ${module} from ${containingFile}`);
      throw e;
    }
  }

  private typeCache = new Map<string, StaticSymbol>();

  /**
   * getStaticSymbol produces a Type whose metadata is known but whose implementation is not loaded.
   * All types passed to the StaticResolver should be pseudo-types returned by this method.
   *
   * @param declarationFile the absolute path of the file where the symbol is declared
   * @param name the name of the type.
   */
  getStaticSymbol(declarationFile: string, name: string): StaticSymbol {
    let key = `"${declarationFile}".${name}`;
    let result = this.typeCache.get(key);
    if (!result) {
      result = new StaticSymbol(declarationFile, name);
      (<any>result).serialNumber = serialNumber++;
      this.typeCache.set(key, result);
    }
    return result;
  }

  // TODO(alexeagle): take a statictype
  getMetadataFor(filePath: string): ModuleMetadata {
    if (!this.moduleResolverHost.fileExists(filePath)) {
      throw new Error(`No such file '${filePath}'`);
    }
    if (DTS.test(filePath)) {
      const metadataPath = filePath.replace(DTS, '.metadata.json');
      if (this.moduleResolverHost.fileExists(metadataPath)) {
        return this.readMetadata(metadataPath);
      }
    }

    let sf = this.program.getSourceFile(filePath);
    if (!sf) {
      throw new Error(`Source file ${filePath} not present in program.`);
    }

    const entry = this.metadataCache.get(sf.path);
    const version = this.serviceHost.getScriptVersion(sf.path);
    if (entry && entry.version == version) {
      return entry.content;
    }
    const metadata = this.metadataCollector.getMetadata(sf);
    this.metadataCache.set(sf.path, {version, content: metadata});
    return metadata;
  }

  readMetadata(filePath: string) {
    try {
      const text = this.moduleResolverHost.readFile(filePath);
      const result = JSON.parse(text);
      return result;
    } catch (e) {
      console.error(`Failed to read JSON file ${filePath}`);
      throw e;
    }
  }
}

interface MetadataCacheEntry {
  version: string;
  content: ModuleMetadata;
}