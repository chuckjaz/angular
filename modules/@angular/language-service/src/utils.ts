import {ParseSourceSpan} from '@angular/compiler/src/parse_util';
import {Span} from './service';

export interface SpanHolder {
  sourceSpan: ParseSourceSpan;
  endSourceSpan?: ParseSourceSpan;
  children?: SpanHolder[];
}

export function isParseSourceSpan(value: any): value is ParseSourceSpan {
  return value && !!value.start;
}

export function spanOf(span: SpanHolder | ParseSourceSpan): Span {
  if (isParseSourceSpan(span)) {
    return {start: span.start.offset, end: span.end.offset};
  } else {
    if (span.endSourceSpan) {
      return {start: span.sourceSpan.start.offset, end: span.endSourceSpan.end.offset};
    } else if (span.children && span.children.length) {
      return {
        start: span.sourceSpan.start.offset,
        end: spanOf(span.children[span.children.length - 1]).end
      };
    }
    return {start: span.sourceSpan.start.offset, end: span.sourceSpan.end.offset};
  }
}

export function inSpan(position: number, span: Span): boolean {
  return position >= span.start && position < span.end;
}

export function offsetSpan(span: Span, amount: number): Span {
  return {start: span.start + amount, end: span.end + amount};
}
