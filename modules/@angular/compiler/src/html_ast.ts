import {isPresent} from '../src/facade/lang';

import {ParseSourceSpan} from './parse_util';

export interface HtmlAst {
  sourceSpan: ParseSourceSpan;
  visit(visitor: HtmlAstVisitor, context: any): any;
}

export class HtmlTextAst implements HtmlAst {
  constructor(public value: string, public sourceSpan: ParseSourceSpan) {}
  visit(visitor: HtmlAstVisitor, context: any): any { return visitor.visitText(this, context); }
}

export class HtmlExpansionAst implements HtmlAst {
  constructor(
      public switchValue: string, public type: string, public cases: HtmlExpansionCaseAst[],
      public sourceSpan: ParseSourceSpan, public switchValueSourceSpan: ParseSourceSpan) {}
  visit(visitor: HtmlAstVisitor, context: any): any {
    return visitor.visitExpansion(this, context);
  }
}

export class HtmlExpansionCaseAst implements HtmlAst {
  constructor(
      public value: string, public expression: HtmlAst[], public sourceSpan: ParseSourceSpan,
      public valueSourceSpan: ParseSourceSpan, public expSourceSpan: ParseSourceSpan) {}

  visit(visitor: HtmlAstVisitor, context: any): any {
    return visitor.visitExpansionCase(this, context);
  }
}

export class HtmlAttrAst implements HtmlAst {
  constructor(
      public name: string, public value: string, public sourceSpan: ParseSourceSpan,
      public valueSpan?: ParseSourceSpan) {}
  visit(visitor: HtmlAstVisitor, context: any): any { return visitor.visitAttr(this, context); }
}

export class HtmlElementAst implements HtmlAst {
  constructor(
      public name: string, public attrs: HtmlAttrAst[], public children: HtmlAst[],
      public sourceSpan: ParseSourceSpan, public startSourceSpan: ParseSourceSpan,
      public endSourceSpan: ParseSourceSpan) {}
  visit(visitor: HtmlAstVisitor, context: any): any { return visitor.visitElement(this, context); }
}

export class HtmlCommentAst implements HtmlAst {
  constructor(public value: string, public sourceSpan: ParseSourceSpan) {}
  visit(visitor: HtmlAstVisitor, context: any): any { return visitor.visitComment(this, context); }
}

export interface HtmlAstVisitor {
  visit?(ast: HtmlAst, context: any): any;
  visitElement(ast: HtmlElementAst, context: any): any;
  visitAttr(ast: HtmlAttrAst, context: any): any;
  visitText(ast: HtmlTextAst, context: any): any;
  visitComment(ast: HtmlCommentAst, context: any): any;
  visitExpansion(ast: HtmlExpansionAst, context: any): any;
  visitExpansionCase(ast: HtmlExpansionCaseAst, context: any): any;
}

export function htmlVisitAll(visitor: HtmlAstVisitor, asts: HtmlAst[], context: any = null): any[] {
  var result: any[] = [];
  asts.forEach(ast => {
    var astResult = (visitor.visit && visitor.visit(ast, context)) || ast.visit(visitor, context);
    if (isPresent(astResult)) {
      result.push(astResult);
    }
  });
  return result;
}

export function htmlVisitEachChild(
    visitor: HtmlAstVisitor, ast: HtmlAst, context: any = null): any[] {
  return ast.visit(new HtmlChildVisitor(visitor), context);
}

export class HtmlChildVisitor implements HtmlAstVisitor {
  constructor(private visitor?: HtmlAstVisitor) {}

  visitElement(ast: HtmlElementAst, context: any): any {
    this.visitChildren(context, visit => {
      visit(ast.attrs);
      visit(ast.children);
    });
  }

  visitAttr(ast: HtmlAttrAst, context: any): any {}
  visitText(ast: HtmlTextAst, context: any): any {}
  visitComment(ast: HtmlCommentAst, context: any): any {}

  visitExpansion(ast: HtmlExpansionAst, context: any): any {
    this.visitChildren(context, visit => { visit(ast.cases); });
  }

  visitExpansionCase(ast: HtmlExpansionCaseAst, context: any): any {}

  private visitChildren<T extends HtmlAst>(
      context: any, cb: (visit: (<V extends HtmlAst>(children: V[]|undefined) => void)) => void) {
    const visitor = this.visitor || this;
    let results: any[][] = [];
    function visit<T extends HtmlAst>(children: T[] | undefined) {
      if (children) results.push(htmlVisitAll(visitor, children, context));
    }
    cb(visit);
    return [].concat.apply([], results);
  }
}