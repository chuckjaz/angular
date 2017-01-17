import * as ts from 'typescript';

import {StaticSymbol} from '@angular/compiler';

import {BuiltinType, Definition, Signature, Symbol, SymbolTable} from '../src/types';

import {TypeScriptServiceHost} from '../src/typescript_host';
import {inferrencialType, resolveInferredType, CandidateTypeSets} from '../src/directive_types';

import {MockTypescriptHost} from './test_utils';


fdescribe('directive types', () => {
  let documentRegistry = ts.createDocumentRegistry();
  let i = 1;

  function symbolsOf(content: string, ...names: string[]): Symbol[] {
    const fileName = `test${i++}.ts`;

    const host = new MockTypescriptHost([fileName], { [fileName]: content });
    const service = ts.createLanguageService(host, documentRegistry);

    const ngTsHost = new TypeScriptServiceHost(host, service);
    const query = ngTsHost.getQueryForSource(fileName);
    return names.map(name => query.getTypeSymbol(new StaticSymbol(fileName, name, [])));
  }

  describe('inferrencially type', () => {
    function expectInferredMember(type: Symbol, memberName: string, expressionType: Symbol, expectedType: string) {
      const member = type.members().get(memberName);
      const memberType = member.type;
      const sets: CandidateTypeSets = new Map();
      const canInfer = inferrencialType(memberType, expressionType, sets);
      expect(canInfer).toBe(true);
      expect(inferredType(sets).name).toBe(expectedType);
    }

    it('can infer the type of NgForOf from an array', () => {
      let [ngForOfType, peopleSymbol] = symbolsOf(`
        export class NgForOf<T> {
          ngForOf: T[];
        }

        export class Person {
          name: string;
        }

        export let people: Person[];
      `, 'NgForOf', 'people');

      expectInferredMember(ngForOfType, 'ngForOf', peopleSymbol.type, 'Person');
    });

    it('can infer a type from a union', () => {
      let [AType, nSymbol] = symbolsOf(`
        export class A<T> {
          a: T | string;
        }
        export let n: number;
      `, 'A', 'n');
      expectInferredMember(AType, 'a', nSymbol.type, 'number');
    });

    it('can infer a type from an intersection', () => {
      let [AType, nSymbol] = symbolsOf(`
        export class A<T> {
          a: T & number;
        }
        export let n: number;
      `, 'A', 'n');
      expectInferredMember(AType, 'a', nSymbol.type, 'number');
    });

    it('can infer a from an object type', () => {
      let [AType, oSymbol] = symbolsOf(`
        export class A<T> {
          a: { b: T };
        }
        export let o: { b: number };
      `, 'A', 'o');
      expectInferredMember(AType, 'a', oSymbol.type, 'number');
    });
  });

  describe('resolve inferred type', () => {
    it('should not resolve a type for disjoint types', () => {
      let types = toSet(symbolsOf(`export let a: number; export let b: string`, 'a', 'b').map(p => p.type));
      let resolved = resolveInferredType(types);
      expect(resolved).toBeUndefined();
    });

    it('infer a union from constiuents', () => {
      let [unionType, stringType, numberType] = symbolsOf(`export let a: number | string; export let b: string; export let c: number;`, 'a', 'b', 'c').map(p => p.type);
      let types = toSet([unionType, stringType, numberType]);
      let resolved = resolveInferredType(types);
      expect(resolved).toBe(unionType);
    });

    it('infer a constiuent from a intersection', () => {
      let [intersectionType, stringType] = symbolsOf(`export let a: number & string; export let b: string`, 'a', 'b').map(p => p.type);
      let types = toSet([intersectionType, stringType]);
      let resolved = resolveInferredType(types);
      expect(resolved).toBe(stringType);
    });

    it('infer a base type from itself and a descendant type', () => {
      let [baseType, descendentType] = symbolsOf(`
        export class A {}
        export class B extends A { }
        export let a: A;
        export let b: B;`, 'a', 'b').map(p => p.type);
      let types = toSet([baseType, descendentType]);
      let resolved = resolveInferredType(types);
      expect(resolved).toBe(baseType);
    });

    it('infer a base type from deeply derived class', () => {
      let symbols = symbolsOf(`
        export class A {}
        export class B extends A { }
        export class C extends B { }
        export class D extends C { }
        export class E extends D { }
        export let a: A;
        export let b: B;
        export let c: C;
        export let d: D;
        export let e: E;`, 'a', 'b', 'c', 'd', 'e').map(p => p.type);
      let [baseType] = symbols;

      for (let s of permutations(Array.from(symbols))) {
        let types = toSet(s);
        let resolved = resolveInferredType(types);
        expect(resolved).toBe(baseType);
      }
    });
  });
});

function error(message: string): never {
  throw new Error(message);
}

function inferredType(sets: CandidateTypeSets): Symbol {
  if (sets.size != 1) error(`Unexpected number of inferred types parameters`);
  const set = Array.from(sets.values())[0];
  if (set.size != 1) error(`Unexpected number of inferred types for parameter`);
  return Array.from(set.values())[0];
}

function toSet<T>(items: T[]): Set<T> {
  let result = new Set<T>();
  for (let item of items) {
    result.add(item);
  }
  return result;
}

function permutations<T>(inputArr: T[]): T[][] {
  var results: T[][] = [];

  function permute(arr: T[], memo: T[]) {
    let cur: T[];

    for (var i = 0; i < arr.length; i++) {
      cur = arr.splice(i, 1);
      if (arr.length === 0) {
        results.push(memo.concat(cur));
      }
      permute(arr.slice(), memo.concat(cur));
      arr.splice(i, 0, cur[0]);
    }

    return results;
  }

  return permute(inputArr, []);
}