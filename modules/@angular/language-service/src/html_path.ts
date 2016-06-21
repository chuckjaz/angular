import {HtmlAst, HtmlChildVisitor, HtmlElementAst, htmlVisitAll} from '@angular/compiler/src/html_ast';

import {inSpan, spanOf} from './utils';

export class HtmlAstPath {
  private path: HtmlAst[];

  constructor(ast: HtmlAst[], public position: number) {
    let visitor = new HtmlAstPathBuilder(position);
    htmlVisitAll(visitor, ast);
    this.path = visitor.getPath();
  }

  get empty(): boolean { return !this.path || !this.path.length; }

  get head(): HtmlAst|undefined { return this.path[0]; }

  get tail(): HtmlAst|undefined { return this.path[this.path.length - 1]; }

  parentOf(node: HtmlAst): HtmlAst|undefined { return this.path[this.path.indexOf(node) - 1]; }

  childOf(node: HtmlAst): HtmlAst|undefined { return this.path[this.path.indexOf(node) + 1]; }
}

class HtmlAstPathBuilder extends HtmlChildVisitor {
  private path: HtmlAst[] = [];

  constructor(private position: number) { super(); }

  visit(ast: HtmlAst, context: any): any {
    let span = spanOf(ast);
    if (inSpan(this.position, span)) {
      this.path.push(ast);
    } else {
      // Returning a value here will result in the children being skipped.
      return true;
    }
  }

  getPath(): HtmlAst[] { return this.path; }
}
