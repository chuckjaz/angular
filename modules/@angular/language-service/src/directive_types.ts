/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */


import {Symbol} from './types';

function setOfMany<T>(lists: T[][]): Set<T> {
  const result = new Set<T>();
  for (const items of lists) {
    for (const item of items) {
      result.add(item);
    }
  }
  return result;
}

// TODO: Consider an Iterable<[A, B]> and yield.
function zip<A, B>(a: A[] | undefined, b: B[] | undefined): [A, B][] {
  const result: [A, B][] = [];
  if (a && b) {
    let len = a.length < b.length ? a.length : b.length;
    for (let i = 0; i < len; i++) {
      result.push([a[i], b[i]]);
    }
  }
  return result;
}

function typeParametersOf(types: Symbol[]): Set<Symbol> {
  return setOfMany(types.map(type => type.typeArguments() || []));
}

function inputPropertiesOf(types: Symbol[]): Set<Symbol> {
  return setOfMany(types.map(type => type.members().values().filter(m => m.inputProperty)));
}

interface Typing {
  inputProperty: Symbol;
  valueType: Symbol;
}

export type CandidateTypeSets = Map<Symbol, Set<Symbol>>;

export function inferrencialType(t: Symbol, s: Symbol, sets: CandidateTypeSets): boolean {
  let inferrenceMade: boolean = false;

  function addCandidate(t: Symbol, s: Symbol) {
    let candidateSet = sets.get(t);
    if (!candidateSet) {
      candidateSet = new Set<Symbol>();
      sets.set(t, candidateSet);
    }
    candidateSet.add(s);
    inferrenceMade = true;
  }

  if (t.openTypeParameter) {
    addCandidate(t, s);
  } else {
    const genericOfT = t.genericType();
    const genericOfS = t.genericType();
    if (genericOfS && genericOfS == genericOfT) {
      for (const [a, b] of zip(t.typeArguments(), s.typeArguments())) {
        inferrenceMade = inferrencialType(a, b, sets) || inferrenceMade;
      }
    } else {
      if (t.unionType || t.intersectionType) {
        const constituentTypes = t.constituentTypes();
        const subInferenceMade = constituentTypes.reduce((previous, type) => {
          if (type.openTypeParameter) return previous;
          return inferrencialType(type, s, sets) || previous;
        }, false);
        if (!subInferenceMade) {
          const openTypes = constituentTypes.filter(type => type.openTypeParameter);
          if (openTypes.length == 1) {
            addCandidate(openTypes[0], s);
          }
        } else {
          inferrenceMade = true;
        }
      } else if (s.unionType || s.intersectionType) {
        const constituentTypes = s.constituentTypes();
        inferrenceMade = constituentTypes.reduce((previous, type) => inferrencialType(type, s, sets) || previous, false);
      } else {
        for (const memberOfT of t.members().values()) {
          const memberOfS = s.members().get(memberOfT.name);
          if (memberOfS) {
            inferrenceMade = inferrencialType(memberOfT.type, memberOfS.type, sets) || inferrenceMade;
          }
        }

        // TODO: Signatures
        // TODO: Constructors
        // TODO: Numeric and String indexers
      }
    }
  }

  return inferrenceMade;
}

export function resolveInferredType(set: Set<Symbol>): Symbol | undefined {
  let discarded: Symbol[] = [];
  let candidate: Symbol | undefined = undefined;

  for (const type of Array.from(set.values())) {
    if (!candidate) {
      candidate = type;
    } else if (!candidate.superTypeOf(type)) {
      if (type.superTypeOf(candidate) && discarded.every(t => type.superTypeOf(t))) {
        candidate = type;
        discarded = [];
      } else {
        discarded.push(candidate);
        candidate = type;
      }
    }
  }

  // The candidate is valid if there are no types that are not strict subtypes of the candidate.
  return discarded.length ? undefined : candidate;
}