/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import * as o from './output/output_ast';
import {error} from './parse_util';
import {OutputContext} from './util';

export const enum DefinitionKind {Injector, Directive, Component}

class FixupExpression extends o.Expression {
  constructor(public resolved: o.Expression) { super(resolved.type); }

  shared: boolean;

  visitExpression(visitor: o.ExpressionVisitor, context: any): any {
    this.resolved || error('Visiting an unresolved constant pool fix-up');
    this.resolved !.visitExpression(visitor, context);
  }

  isEquivalent(e: o.Expression): boolean {
    this.resolved || error('Comparing an unresolved constant pool fix-up');
    return e.isEquivalent(this.resolved !) ||
        (e instanceof FixupExpression) && e.resolved !.isEquivalent(this.resolved !);
  }

  fixup(expression: o.Expression) {
    this.resolved = expression;
    this.shared = true;
  }
}

export class ConstantPool {
  statements: o.Statement[] = [];
  private literals = new Map<string, FixupExpression>();
  private injectorDefinitions = new Map<any, FixupExpression>();
  private directiveDefinitions = new Map<any, FixupExpression>();
  private componentDefintions = new Map<any, FixupExpression>();

  private nextNameIndex = 0;

  getConstLiteral(literal: o.Expression): o.Expression {
    const key = this.keyOf(literal);
    let fixup = this.literals.get(key);
    if (!fixup) {
      fixup = new FixupExpression(literal);
      this.literals.set(key, fixup);
    } else if (!fixup.shared) {
      // Replace the expression with a variable
      const name = this.freshName();
      this.statements.push(
          o.variable(name).set(literal).toDeclStmt(o.INFERRED_TYPE, [o.StmtModifier.Final]));
      fixup.fixup(o.variable(name));
    }
    return fixup;
  }

  getDefinition(type: any, kind: DefinitionKind, ctx: OutputContext): o.Expression {
    const declarations = kind == DefinitionKind.Component ?
        this.componentDefintions :
        kind == DefinitionKind.Directive ? this.directiveDefinitions : this.injectorDefinitions;
    let fixup = declarations.get(type);
    if (!fixup) {
      const property = kind == DefinitionKind.Component ?
          'ngComponentDef' :
          kind == DefinitionKind.Directive ? 'ngDirectiveDef' : 'ngInjectorDef';
      fixup = new FixupExpression(ctx.importExpr(type).prop(property));
      declarations.set(type, fixup);
    } else if (!fixup.shared) {
      const name = this.freshName();
      this.statements.push(
          o.variable(name).set(fixup.resolved).toDeclStmt(o.INFERRED_TYPE, [o.StmtModifier.Final]));
      fixup.fixup(o.variable(name));
    }
    return fixup;
  }

  uniqueName(prefix: string): string { return `${prefix}${this.nextNameIndex++}`; }

  private freshName(): string { return this.uniqueName(`_$`); }

  private keyOf(expression: o.Expression) {
    return expression.visitExpression(new KeyVisitor(), null);
  }
}

class KeyVisitor implements o.ExpressionVisitor {
  visitLiteralExpr(ast: o.LiteralExpr): string { return `${ast.value}`; }
  visitLiteralArrayExpr(ast: o.LiteralArrayExpr): string {
    return ast.entries.map(entry => entry.visitExpression(this, null)).join(',');
  }

  visitLiteralMapExpr(ast: o.LiteralMapExpr): string {
    return `{${ast.entries.map(entry => ` ${entry.key}: $ {
      entry.value.visitExpression(this, null)
    }
    `).join(',')}`;
  }

  visitReadVarExpr = invalid;
  visitWriteVarExpr = invalid;
  visitWriteKeyExpr = invalid;
  visitWritePropExpr = invalid;
  visitInvokeMethodExpr = invalid;
  visitInvokeFunctionExpr = invalid;
  visitInstantiateExpr = invalid;
  visitExternalExpr = invalid;
  visitConditionalExpr = invalid;
  visitNotExpr = invalid;
  visitAssertNotNullExpr = invalid;
  visitCastExpr = invalid;
  visitFunctionExpr = invalid;
  visitBinaryOperatorExpr = invalid;
  visitReadPropExpr = invalid;
  visitReadKeyExpr = invalid;
  visitCommaExpr = invalid;
}

function invalid<T>(arg: o.Expression | o.Statement): never {
  throw new Error(
      `Invalid state: Visitor ${this.constructor.name} doesn't handle ${o.constructor.name}`);
}
