// This information is derived from https://www.w3.org/TR/html4/strict.dtd

type attrType = string | string[];
type hash<T> = {
  [name: string]: T
};

const values: attrType[] = [
  'ID',
  'CDATA',
  'NAME',
  ['ltr', 'rtl'],
  ['rect', 'circle', 'poly', 'default'],
  'NUMBER',
  ['nohref'],
  ['ismap'],
  ['declare'],
  ['DATA', 'REF', 'OBJECT'],
  ['GET', 'POST'],
  'IDREF',
  ['TEXT', 'PASSWORD', 'CHECKBOX', 'RADIO', 'SUBMIT', 'RESET', 'FILE', 'HIDDEN', 'IMAGE', 'BUTTON'],
  ['checked'],
  ['disabled'],
  ['readonly'],
  ['multiple'],
  ['selected'],
  ['button', 'submit', 'reset'],
  ['void', 'above', 'below', 'hsides', 'lhs', 'rhs', 'vsides', 'box', 'border'],
  ['none', 'groups', 'rows', 'cols', 'all'],
  ['left', 'center', 'right', 'justify', 'char'],
  ['top', 'middle', 'bottom', 'baseline'],
  'IDREFS',
  ['row', 'col', 'rowgroup', 'colgroup'],
  ['defer']
];

const groups: hash<number>[] =
    [
      {id: 0},
      {
        onclick: 1,
        ondblclick: 1,
        onmousedown: 1,
        onmouseup: 1,
        onmouseover: 1,
        onmousemove: 1,
        onmouseout: 1,
        onkeypress: 1,
        onkeydown: 1,
        onkeyup: 1
      },
      {lang: 2, dir: 3},
      {onload: 1, onunload: 1},
      {name: 1},
      {href: 1},
      {type: 1},
      {alt: 1},
      {tabindex: 5},
      {media: 1},
      {nohref: 6},
      {usemap: 1},
      {src: 1},
      {onfocus: 1, onblur: 1},
      {charset: 1},
      {declare: 8, classid: 1, codebase: 1, data: 1, codetype: 1, archive: 1, standby: 1},
      {title: 1},
      {value: 1},
      {cite: 1},
      {datetime: 1},
      {accept: 1},
      {shape: 4, coords: 1},
      { for: 11
      },
      {action: 1, method: 10, enctype: 1, onsubmit: 1, onreset: 1, 'accept-charset': 1},
      {valuetype: 9},
      {longdesc: 1},
      {width: 1},
      {disabled: 14},
      {readonly: 15, onselect: 1},
      {accesskey: 1},
      {size: 5, multiple: 16},
      {onchange: 1},
      {label: 1},
      {selected: 17},
      {type: 12, checked: 13, size: 1, maxlength: 5},
      {rows: 5, cols: 5},
      {type: 18},
      {height: 1},
      {
        summary: 1,
        border: 1,
        frame: 19,
        rules: 20,
        cellspacing: 1,
        cellpadding: 1,
        datapagesize: 1
      },
      {align: 21, char: 1, charoff: 1, valign: 22},
      {span: 5},
      {abbr: 1, axis: 1, headers: 23, scope: 24, rowspan: 5, colspan: 5},
      {profile: 1},
      {'http-equiv': 2, name: 2, content: 1, scheme: 1},
      {class: 1, style: 1},
      {hreflang: 2, rel: 1, rev: 1},
      {ismap: 7},
      { defer: 25, event: 1, for : 1 }
    ]

    const elements: {[name: string]: number[]} = {
      TT: [0, 1, 2, 16, 44],
      I: [0, 1, 2, 16, 44],
      B: [0, 1, 2, 16, 44],
      BIG: [0, 1, 2, 16, 44],
      SMALL: [0, 1, 2, 16, 44],
      EM: [0, 1, 2, 16, 44],
      STRONG: [0, 1, 2, 16, 44],
      DFN: [0, 1, 2, 16, 44],
      CODE: [0, 1, 2, 16, 44],
      SAMP: [0, 1, 2, 16, 44],
      KBD: [0, 1, 2, 16, 44],
      VAR: [0, 1, 2, 16, 44],
      CITE: [0, 1, 2, 16, 44],
      ABBR: [0, 1, 2, 16, 44],
      ACRONYM: [0, 1, 2, 16, 44],
      SUB: [0, 1, 2, 16, 44],
      SUP: [0, 1, 2, 16, 44],
      SPAN: [0, 1, 2, 16, 44],
      BDO: [0, 2, 16, 44],
      BR: [0, 16, 44],
      BODY: [0, 1, 2, 3, 16, 44],
      ADDRESS: [0, 1, 2, 16, 44],
      DIV: [0, 1, 2, 16, 44],
      A: [0, 1, 2, 4, 5, 6, 8, 13, 14, 16, 21, 29, 44, 45],
      MAP: [0, 1, 2, 4, 16, 44],
      AREA: [0, 1, 2, 5, 7, 8, 10, 13, 16, 21, 29, 44],
      LINK: [0, 1, 2, 5, 6, 9, 14, 16, 44, 45],
      IMG: [0, 1, 2, 4, 7, 11, 12, 16, 25, 26, 37, 44, 46],
      OBJECT: [0, 1, 2, 4, 6, 8, 11, 15, 16, 26, 37, 44],
      PARAM: [0, 4, 6, 17, 24],
      HR: [0, 1, 2, 16, 44],
      P: [0, 1, 2, 16, 44],
      H1: [0, 1, 2, 16, 44],
      H2: [0, 1, 2, 16, 44],
      H3: [0, 1, 2, 16, 44],
      H4: [0, 1, 2, 16, 44],
      H5: [0, 1, 2, 16, 44],
      H6: [0, 1, 2, 16, 44],
      PRE: [0, 1, 2, 16, 44],
      Q: [0, 1, 2, 16, 18, 44],
      BLOCKQUOTE: [0, 1, 2, 16, 18, 44],
      INS: [0, 1, 2, 16, 18, 19, 44],
      DEL: [0, 1, 2, 16, 18, 19, 44],
      DL: [0, 1, 2, 16, 44],
      DT: [0, 1, 2, 16, 44],
      DD: [0, 1, 2, 16, 44],
      OL: [0, 1, 2, 16, 44],
      UL: [0, 1, 2, 16, 44],
      LI: [0, 1, 2, 16, 44],
      FORM: [0, 1, 2, 4, 16, 20, 23, 44],
      LABEL: [0, 1, 2, 13, 16, 22, 29, 44],
      INPUT: [0, 1, 2, 4, 7, 8, 11, 12, 13, 16, 17, 20, 27, 28, 29, 31, 34, 44, 46],
      SELECT: [0, 1, 2, 4, 8, 13, 16, 27, 30, 31, 44],
      OPTGROUP: [0, 1, 2, 16, 27, 32, 44],
      OPTION: [0, 1, 2, 16, 17, 27, 32, 33, 44],
      TEXTAREA: [0, 1, 2, 4, 8, 13, 16, 27, 28, 29, 31, 35, 44],
      FIELDSET: [0, 1, 2, 16, 44],
      LEGEND: [0, 1, 2, 16, 29, 44],
      BUTTON: [0, 1, 2, 4, 8, 13, 16, 17, 27, 29, 36, 44],
      TABLE: [0, 1, 2, 16, 26, 38, 44],
      CAPTION: [0, 1, 2, 16, 44],
      COLGROUP: [0, 1, 2, 16, 26, 39, 40, 44],
      COL: [0, 1, 2, 16, 26, 39, 40, 44],
      THEAD: [0, 1, 2, 16, 39, 44],
      TBODY: [0, 1, 2, 16, 39, 44],
      TFOOT: [0, 1, 2, 16, 39, 44],
      TR: [0, 1, 2, 16, 39, 44],
      TH: [0, 1, 2, 16, 39, 41, 44],
      TD: [0, 1, 2, 16, 39, 41, 44],
      HEAD: [2, 42],
      TITLE: [2],
      BASE: [5],
      META: [2, 43],
      STYLE: [2, 6, 9, 16],
      SCRIPT: [6, 12, 14, 47],
      NOSCRIPT: [0, 1, 2, 16, 44],
      HTML: [2]
    };

export function elementNames(): string[] {
  return Object.keys(elements).sort().map(v => v.toLowerCase());
}

function compose(indexes: number[] | undefined): hash<attrType> {
  var result: hash<attrType> = {};
  if (indexes) {
    for (let index of indexes) {
      Object.assign(result, groups[index])
    }
  }
  return result;
}

export function attributeNames(element: string): string[] {
  return Object.keys(compose(elements[element.toUpperCase()])).sort();
}

export function attributeType(element: string, attribute: string): string|string[]|undefined {
  return compose(elements[element.toUpperCase()])[attribute.toLowerCase()];
}