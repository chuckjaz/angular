/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {CssRule, ShadowCss, processRules} from '@angular/compiler/src/shadow_css';
import {normalizeCSS} from '@angular/platform-browser/testing/browser_util';

export function main() {
  describe('ShadowCss', function() {

    function s(css: string, contentAttr: string, hostAttr: string = '') {
      const shadowCss = new ShadowCss();
      const shim = shadowCss.shimCssText(css, contentAttr, hostAttr);
      const nlRegexp = /\n/g;
      return normalizeCSS(shim.replace(nlRegexp, ''));
    }

    it('should handle empty string', () => { expect(s('', 'a')).toEqual(''); });

    it('should add an attribute to every rule', () => {
      const css = 'one {color: red;}two {color: red;}';
      const expected = 'one[a] {color:red;}two[a] {color:red;}';
      expect(s(css, 'a')).toEqual(expected);
    });

    it('should handle invalid css', () => {
      const css = 'one {color: red;}garbage';
      const expected = 'one[a] {color:red;}garbage';
      expect(s(css, 'a')).toEqual(expected);
    });

    it('should add an attribute to every selector', () => {
      const css = 'one, two {color: red;}';
      const expected = 'one[a], two[a] {color:red;}';
      expect(s(css, 'a')).toEqual(expected);
    });

    it('should support newlines in the selector and content ', () => {
      const css = 'one, \ntwo {\ncolor: red;}';
      const expected = 'one[a], two[a] {color:red;}';
      expect(s(css, 'a')).toEqual(expected);
    });

    it('should handle media rules', () => {
      const css = '@media screen and (max-width:800px, max-height:100%) {div {font-size:50px;}}';
      const expected =
          '@media screen and (max-width:800px, max-height:100%) {div[a] {font-size:50px;}}';
      expect(s(css, 'a')).toEqual(expected);
    });

    it('should handle media rules with simple rules', () => {
      const css = '@media screen and (max-width: 800px) {div {font-size: 50px;}} div {}';
      const expected = '@media screen and (max-width:800px) {div[a] {font-size:50px;}} div[a] {}';
      expect(s(css, 'a')).toEqual(expected);
    });

    it('should handle support rules', () => {
      const css = '@supports (display: flex) {section {display: flex;}}';
      const expected = '@supports (display:flex) {section[a] {display:flex;}}';
      expect(s(css, 'a')).toEqual(expected);
    });

    // Check that the browser supports unprefixed CSS animation
    it('should handle keyframes rules', () => {
      const css = '@keyframes foo {0% {transform:translate(-50%) scaleX(0);}}';
      expect(s(css, 'a')).toEqual(css);
    });

    it('should handle -webkit-keyframes rules', () => {
      const css = '@-webkit-keyframes foo {0% {-webkit-transform:translate(-50%) scaleX(0);}}';
      expect(s(css, 'a')).toEqual(css);
    });

    it('should handle complicated selectors', () => {
      expect(s('one::before {}', 'a')).toEqual('one[a]::before {}');
      expect(s('one two {}', 'a')).toEqual('one[a] two[a] {}');
      expect(s('one > two {}', 'a')).toEqual('one[a] > two[a] {}');
      expect(s('one + two {}', 'a')).toEqual('one[a] + two[a] {}');
      expect(s('one ~ two {}', 'a')).toEqual('one[a] ~ two[a] {}');
      const res = s('.one.two > three {}', 'a');  // IE swap classes
      expect(res == '.one.two[a] > three[a] {}' || res == '.two.one[a] > three[a] {}')
          .toEqual(true);
      expect(s('one[attr="value"] {}', 'a')).toEqual('one[attr="value"][a] {}');
      expect(s('one[attr=value] {}', 'a')).toEqual('one[attr="value"][a] {}');
      expect(s('one[attr^="value"] {}', 'a')).toEqual('one[attr^="value"][a] {}');
      expect(s('one[attr$="value"] {}', 'a')).toEqual('one[attr$="value"][a] {}');
      expect(s('one[attr*="value"] {}', 'a')).toEqual('one[attr*="value"][a] {}');
      expect(s('one[attr|="value"] {}', 'a')).toEqual('one[attr|="value"][a] {}');
      expect(s('one[attr~="value"] {}', 'a')).toEqual('one[attr~="value"][a] {}');
      expect(s('one[attr="va lue"] {}', 'a')).toEqual('one[attr="va lue"][a] {}');
      expect(s('one[attr] {}', 'a')).toEqual('one[attr][a] {}');
      expect(s('[is="one"] {}', 'a')).toEqual('[is="one"][a] {}');
    });

    it('should handle :host', () => {
      expect(s(':host {}', 'a', 'a-host')).toEqual('[a-host] {}');

      expect(s(':host(.x,.y) {}', 'a', 'a-host')).toEqual('[a-host].x, [a-host].y {}');

      expect(s(':host(.x,.y) > .z {}', 'a', 'a-host'))
          .toEqual('[a-host].x > .z[a], [a-host].y > .z[a] {}');
    });

    it('should handle :host-context', () => {
      expect(s(':host-context(.x) {}', 'a', 'a-host')).toEqual('[a-host].x, .x [a-host] {}');
      expect(s(':host-context(.x) > .y {}', 'a', 'a-host'))
          .toEqual('[a-host].x > .y[a], .x [a-host] > .y[a] {}');
    });

    it('should support polyfill-next-selector', () => {
      let css = s('polyfill-next-selector {content: \'x > y\'} z {}', 'a');
      expect(css).toEqual('x[a] > y[a]{}');

      css = s('polyfill-next-selector {content: "x > y"} z {}', 'a');
      expect(css).toEqual('x[a] > y[a]{}');
    });

    it('should support polyfill-unscoped-rule', () => {
      let css = s('polyfill-unscoped-rule {content: \'#menu > .bar\';color: blue;}', 'a');
      expect(css).toContain('#menu > .bar {;color:blue;}');

      css = s('polyfill-unscoped-rule {content: "#menu > .bar";color: blue;}', 'a');
      expect(css).toContain('#menu > .bar {;color:blue;}');
    });

    it('should support multiple instances polyfill-unscoped-rule', () => {
      const css =
          s('polyfill-unscoped-rule {content: \'foo\';color: blue;}' +
                'polyfill-unscoped-rule {content: \'bar\';color: blue;}',
            'a');
      expect(css).toContain('foo {;color:blue;}');
      expect(css).toContain('bar {;color:blue;}');
    });

    it('should support polyfill-rule', () => {
      let css = s('polyfill-rule {content: \':host.foo .bar\';color: blue;}', 'a', 'a-host');
      expect(css).toEqual('[a-host].foo .bar[a] {;color:blue;}');

      css = s('polyfill-rule {content: ":host.foo .bar";color:blue;}', 'a', 'a-host');
      expect(css).toEqual('[a-host].foo .bar[a] {;color:blue;}');
    });

    it('should handle ::shadow', () => {
      const css = s('x::shadow > y {}', 'a');
      expect(css).toEqual('x[a] > y[a] {}');
    });

    it('should handle /deep/', () => {
      const css = s('x /deep/ y {}', 'a');
      expect(css).toEqual('x[a] y {}');
    });

    it('should handle >>>', () => {
      const css = s('x >>> y {}', 'a');
      expect(css).toEqual('x[a] y {}');
    });

    it('should pass through @import directives', () => {
      const styleStr = '@import url("https://fonts.googleapis.com/css?family=Roboto");';
      const css = s(styleStr, 'a');
      expect(css).toEqual(styleStr);
    });

    it('should shim rules after @import', () => {
      const styleStr = '@import url("a"); div {}';
      const css = s(styleStr, 'a');
      expect(css).toEqual('@import url("a"); div[a] {}');
    });

    it('should leave calc() unchanged', () => {
      const styleStr = 'div {height:calc(100% - 55px);}';
      const css = s(styleStr, 'a');
      expect(css).toEqual('div[a] {height:calc(100% - 55px);}');
    });

    it('should strip comments', () => { expect(s('/* x */b {c}', 'a')).toEqual('b[a] {c}'); });

    it('should ignore special characters in comments',
       () => { expect(s('/* {;, */b {c}', 'a')).toEqual('b[a] {c}'); });

    it('should support multiline comments',
       () => { expect(s('/* \n */b {c}', 'a')).toEqual('b[a] {c}'); });

    it('should keep sourceMappingURL comments', () => {
      expect(s('b {c}/*# sourceMappingURL=data:x */', 'a'))
          .toEqual('b[a] {c}/*# sourceMappingURL=data:x */');
      expect(s('b {c}/* #sourceMappingURL=data:x */', 'a'))
          .toEqual('b[a] {c}/* #sourceMappingURL=data:x */');
    });
  });

  describe('processRules', () => {
    describe('parse rules', () => {
      function captureRules(input: string): CssRule[] {
        const result: any[] /** TODO #9100 */ = [];
        processRules(input, (cssRule: any /** TODO #9100 */) => {
          result.push(cssRule);
          return cssRule;
        });
        return result;
      }

      it('should work with empty css', () => { expect(captureRules('')).toEqual([]); });

      it('should capture a rule without body',
         () => { expect(captureRules('a;')).toEqual([new CssRule('a', '')]); });

      it('should capture css rules with body',
         () => { expect(captureRules('a {b}')).toEqual([new CssRule('a', 'b')]); });

      it('should capture css rules with nested rules', () => {
        expect(captureRules('a {b {c}} d {e}')).toEqual([
          new CssRule('a', 'b {c}'), new CssRule('d', 'e')
        ]);
      });

      it('should capture multiple rules where some have no body', () => {
        expect(captureRules('@import a ; b {c}')).toEqual([
          new CssRule('@import a', ''), new CssRule('b', 'c')
        ]);
      });
    });

    describe('modify rules', () => {
      it('should allow to change the selector while preserving whitespaces', () => {
        expect(processRules(
                   '@import a; b {c {d}} e {f}', (cssRule: any /** TODO #9100 */) => new CssRule(
                                                     cssRule.selector + '2', cssRule.content)))
            .toEqual('@import a2; b2 {c {d}} e2 {f}');
      });

      it('should allow to change the content', () => {
        expect(processRules(
                   'a {b}', (cssRule: any /** TODO #9100 */) =>
                                new CssRule(cssRule.selector, cssRule.content + '2')))
            .toEqual('a {b2}');
      });
    });
  });
}
