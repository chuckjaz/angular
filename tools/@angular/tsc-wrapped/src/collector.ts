import * as ts from 'typescript';

import {Evaluator, ImportMetadata, ImportSpecifierMetadata, errorSymbol, isPrimitive} from './evaluator';
import {ClassMetadata, ConstructorMetadata, MemberMetadata, MetadataError, MetadataMap, MetadataSymbolicExpression, MetadataSymbolicReferenceExpression, MetadataValue, MethodMetadata, ModuleMetadata, VERSION, isMetadataError, isMetadataSymbolicReferenceExpression} from './schema';
import {Symbols} from './symbols';

/**
 * Collect decorator metadata from a TypeScript module.
 */
export class MetadataCollector {
  private ts: typeof ts;

  constructor(typescript: typeof ts) { this.ts = typescript; }

  /**
   * Returns a JSON.stringify friendly form describing the decorators of the exported classes from
   * the source file that is expected to correspond to a module.
   */
  public getMetadata(sourceFile: ts.SourceFile): ModuleMetadata {
    const locals = new Symbols(this.ts, sourceFile);
    const evaluator = new Evaluator(this.ts, locals);
    let metadata: {[name: string]: MetadataValue | ClassMetadata}|undefined;

    function objFromDecorator(decoratorNode: ts.Decorator): MetadataSymbolicExpression {
      return <MetadataSymbolicExpression>evaluator.evaluateNode(decoratorNode.expression);
    }

    const errorSym = (message: string, node?: ts.Node, context?: {[name: string]: string}) =>
        errorSymbol(this.ts, message, node, context, sourceFile);

    const classMetadataOf = (classDeclaration: ts.ClassDeclaration): ClassMetadata => {
      let result: ClassMetadata = {__symbolic: 'class'};

      function getDecorators(decorators: ts.Decorator[]): MetadataSymbolicExpression[] {
        if (decorators && decorators.length)
          return decorators.map(decorator => objFromDecorator(decorator));
        return undefined;
      }

      function referenceFrom(node: ts.Node): MetadataSymbolicReferenceExpression|MetadataError {
        const result = evaluator.evaluateNode(node);
        if (isMetadataError(result) || isMetadataSymbolicReferenceExpression(result)) {
          return result;
        } else {
          return errorSym('Symbol reference expected', node);
        }
      }

      // Add class decorators
      if (classDeclaration.decorators) {
        result.decorators = getDecorators(classDeclaration.decorators);
      }

      // member decorators
      let members: MetadataMap = null;
      function recordMember(name: string, metadata: MemberMetadata) {
        if (!members) members = {};
        let data = members.hasOwnProperty(name) ? members[name] : [];
        data.push(metadata);
        members[name] = data;
      }
      for (const member of classDeclaration.members) {
        let isConstructor = false;
        switch (member.kind) {
          case this.ts.SyntaxKind.Constructor:
            isConstructor = true;
          // fallthrough
          case this.ts.SyntaxKind.MethodDeclaration:
            const method = <ts.MethodDeclaration|ts.ConstructorDeclaration>member;
            const methodDecorators = getDecorators(method.decorators);
            const parameters = method.parameters;
            const parameterDecoratorData: (MetadataSymbolicExpression | MetadataError)[][] = [];
            const parametersData: (MetadataSymbolicReferenceExpression | MetadataError | null)[] =
                [];
            let hasDecoratorData: boolean = false;
            let hasParameterData: boolean = false;
            for (const parameter of parameters) {
              const parameterData = getDecorators(parameter.decorators);
              parameterDecoratorData.push(parameterData);
              hasDecoratorData = hasDecoratorData || !!parameterData;
              if (isConstructor) {
                if (parameter.type) {
                  parametersData.push(referenceFrom(parameter.type));
                } else {
                  parametersData.push(null);
                }
                hasParameterData = true;
              }
            }
            const data: MethodMetadata = {__symbolic: isConstructor ? 'constructor' : 'method'};
            const name = isConstructor ? '__ctor__' : evaluator.nameOf(member.name);
            if (methodDecorators) {
              data.decorators = methodDecorators;
            }
            if (hasDecoratorData) {
              data.parameterDecorators = parameterDecoratorData;
            }
            if (hasParameterData) {
              (<ConstructorMetadata>data).parameters = parametersData;
            }
            if (!isMetadataError(name)) {
              recordMember(name, data);
            }
            break;
          case this.ts.SyntaxKind.PropertyDeclaration:
          case this.ts.SyntaxKind.GetAccessor:
          case this.ts.SyntaxKind.SetAccessor:
            const property = <ts.PropertyDeclaration>member;
            const propertyDecorators = getDecorators(property.decorators);
            if (propertyDecorators) {
              let name = evaluator.nameOf(property.name);
              if (!isMetadataError(name)) {
                recordMember(name, {__symbolic: 'property', decorators: propertyDecorators});
              }
            }
            break;
        }
      }
      if (members) {
        result.members = members;
      }

      return result.decorators || members ? result : undefined;
    };

    // Predeclare classes
    this.ts.forEachChild(sourceFile, node => {
      switch (node.kind) {
        case this.ts.SyntaxKind.ClassDeclaration:
          const classDeclaration = <ts.ClassDeclaration>node;
          const className = classDeclaration.name.text;
          if (node.flags & this.ts.NodeFlags.Export) {
            locals.define(className, {__symbolic: 'reference', name: className});
          } else {
            locals.define(
                className, errorSym('Reference to non-exported class', node, {className}));
          }
          break;
      }
    });
    this.ts.forEachChild(sourceFile, node => {
      switch (node.kind) {
        case this.ts.SyntaxKind.ClassDeclaration:
          const classDeclaration = <ts.ClassDeclaration>node;
          const className = classDeclaration.name.text;
          if (node.flags & this.ts.NodeFlags.Export) {
            if (classDeclaration.decorators) {
              if (!metadata) metadata = {};
              metadata[className] = classMetadataOf(classDeclaration);
            }
          }
          // Otherwise don't record metadata for the class.
          break;
        case this.ts.SyntaxKind.VariableStatement:
          const variableStatement = <ts.VariableStatement>node;
          for (let variableDeclaration of variableStatement.declarationList.declarations) {
            if (variableDeclaration.name.kind == this.ts.SyntaxKind.Identifier) {
              let nameNode = <ts.Identifier>variableDeclaration.name;
              let varValue: MetadataValue;
              if (variableDeclaration.initializer) {
                varValue = evaluator.evaluateNode(variableDeclaration.initializer);
              } else {
                varValue = errorSym('Variable not initialized', nameNode);
              }
              if (variableStatement.flags & this.ts.NodeFlags.Export ||
                  variableDeclaration.flags & this.ts.NodeFlags.Export) {
                if (!metadata) metadata = {};
                metadata[nameNode.text] = varValue;
              }
              if (isPrimitive(varValue)) {
                locals.define(nameNode.text, varValue);
              }
            } else {
              // Destructuring (or binding) declarations are not supported,
              // var {<identifier>[, <identifer>]+} = <expression>;
              //   or
              // var [<identifier>[, <identifier}+] = <expression>;
              // are not supported.
              const report = (nameNode: ts.Node) => {
                switch (nameNode.kind) {
                  case this.ts.SyntaxKind.Identifier:
                    const name = <ts.Identifier>nameNode;
                    const varValue = errorSym('Destructuring not supported', nameNode);
                    locals.define(name.text, varValue);
                    if (node.flags & this.ts.NodeFlags.Export) {
                      if (!metadata) metadata = {};
                      metadata[name.text] = varValue;
                    }
                    break;
                  case this.ts.SyntaxKind.BindingElement:
                    const bindingElement = <ts.BindingElement>nameNode;
                    report(bindingElement.name);
                    break;
                  case this.ts.SyntaxKind.ObjectBindingPattern:
                  case this.ts.SyntaxKind.ArrayBindingPattern:
                    const bindings = <ts.BindingPattern>nameNode;
                    bindings.elements.forEach(report);
                    break;
                }
              };
              report(variableDeclaration.name);
            }
          }
          break;
      }
    });

    return metadata && {__symbolic: 'module', version: VERSION, metadata};
  }
}
