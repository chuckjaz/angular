/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {MockDirectory, setup} from '../aot/test_util';
import {compile, expectEmit} from './mock_compile_2';

describe('r3_view_compiler_2', () => {
  const angularFiles = setup({
    compileAngular: true,
    compileAnimations: false,
    compileCommon: true,
  });

  fdescribe('elements', () => {
    it('should translate DOM structure', () => {
      const files = {
        app: {
          'spec.ts': `
              import {Component, NgModule} from '@angular/core';

              @Component({
                selector: 'my-component',
                template: \`<div class="my-app" title="Hello">Hello <b>World</b>!</div>\`
              })
              export class MyComponent {}

              @NgModule({declarations: [MyComponent]})
              export class MyModule {}
          `
        }
      };

      // The factory should look like this:
      const factory = 'factory: function MyComponent_Factory() { return new MyComponent(); }';

      // The template should look like this (where IDENT is a wild card for an identifier):
      const template = `
        const $c1$ = ['class', 'my-app', 'title', 'Hello'];
        …
        template: function MyComponent_Template(ctx: IDENT, cm: IDENT) {
          if (cm) {
            $r3$.ɵE(0, 'div', $c1$);
            $r3$.ɵT(1, 'Hello ');
            $r3$.ɵE(2, 'b');
            $r3$.ɵT(3, 'World');
            $r3$.ɵe();
            $r3$.ɵT(4, '!');
            $r3$.ɵe();
          }
        }
      `;


      const result = compile(files, angularFiles);

      expectEmit(result.source, factory, 'Incorrect factory');
      expectEmit(result.source, template, 'Incorrect template');
    });
  });
  
  describe('hello world', () => {
    it('should be able to generate the hello world component', () => {
      const files: MockDirectory = {
        app: {
          'hello.ts': `
           import {Component, NgModule} from '@angular/core';

           @Component({
             selector: 'hello-world',
             template: 'Hello, world!'
           })
           export class HelloWorldComponent {

           }

           @NgModule({
             declarations: [HelloWorldComponent]
           })
           export class HelloWorldModule {}
        `
        }
      };
      compile(files, angularFiles);
    });
  });

  it('should be able to generate the example', () => {
    const files: MockDirectory = {
      app: {
        'example.ts': `
        import {Component, OnInit, OnDestroy, ElementRef, Input, NgModule} from '@angular/core';
        import {CommonModule} from '@angular/common';

        @Component({
          selector: 'my-app',
          template: '<todo [data]="list"></todo>'
        })
        export class MyApp implements OnInit {

          list: any[] = [];

          constructor(public elementRef: ElementRef) {}

          ngOnInit(): void {
          }
        }

        @Component({
          selector: 'todo',
          template: '<ul class="list" [title]="myTitle"><li *ngFor="let item of data">{{data}}</li></ul>'
        })
        export class TodoComponent implements OnInit, OnDestroy {

          @Input()
          data: any[] = [];

          myTitle: string;

          constructor(public elementRef: ElementRef) {}

          ngOnInit(): void {}

          ngOnDestroy(): void {}
        }

        @NgModule({
          declarations: [TodoComponent, MyApp],
          imports: [CommonModule]
        })
        export class TodoModule{}
        `
      }
    };
    const result = compile(files, angularFiles);
    expect(result.source).toContain('@angular/core');
  });

  describe('interpolations', () => {
    // Regression #21927
    it('should generate a correct call to bV with more than 8 interpolations', () => {
      const files: MockDirectory = {
        app: {
          'example.ts': `
          import {Component, NgModule} from '@angular/core';

          @Component({
            selector: 'my-app',
            template: ' {{list[0]}} {{list[1]}} {{list[2]}} {{list[3]}} {{list[4]}} {{list[5]}} {{list[6]}} {{list[7]}} {{list[8]}} '
          })
          export class MyApp {
            list: any[] = [];
          }

          @NgModule({declarations: [MyApp]})
          export class MyModule {}`
        }
      };

      const bV_call = `$r3$.ɵiV([' ',ctx.list[0],' ',ctx.list[1],' ',ctx.list[2],' ',ctx.list[3],
        ' ',ctx.list[4],' ',ctx.list[5],' ',ctx.list[6],' ',ctx.list[7],' ',ctx.list[8],
        ' '])`;
      const result = compile(files, angularFiles);
      expectEmit(result.source, bV_call, 'Incorrect bV call');
    });
  });
});
