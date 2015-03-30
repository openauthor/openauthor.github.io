;(function() {

/**
 * Block-Level Grammar
 */

var block = {
  newline: /^\n+/,
  code: /^( {4}[^\n]+\n*)+/,
  fences: noop,
  hr: /^( *[-*_]){3,} *(?:\n+|$)/,
  heading: /^ *(#{1,6}) *([^\n]+?) *#* *(?:\n+|$)/,
  nptable: noop,
  lheading: /^([^\n]+)\n *(=|-){2,} *(?:\n+|$)/,
  blockquote: /^( *>[^\n]+(\n(?!def)[^\n]+)*\n*)+/,
  list: /^( *)(bull) [\s\S]+?(?:hr|def|\n{2,}(?! )(?!\1bull )\n*|\s*$)/,
  html: /^ *(?:comment *(?:\n|\s*$)|closed *(?:\n{2,}|\s*$)|closing *(?:\n{2,}|\s*$))/,
  def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +["(]([^\n]+)[")])? *(?:\n+|$)/,
  table: noop,
  paragraph: /^((?:[^\n]+\n?(?!hr|heading|lheading|blockquote|tag|def))+)\n*/,
  text: /^[^\n]+/
};

block.bullet = /(?:[*+-]|\d+\.)/;
block.item = /^( *)(bull) [^\n]*(?:\n(?!\1bull )[^\n]*)*/;
block.item = replace(block.item, 'gm')
  (/bull/g, block.bullet)
  ();

block.list = replace(block.list)
  (/bull/g, block.bullet)
  ('hr', '\\n+(?=\\1?(?:[-*_] *){3,}(?:\\n+|$))')
  ('def', '\\n+(?=' + block.def.source + ')')
  ();

block.blockquote = replace(block.blockquote)
  ('def', block.def)
  ();

block._tag = '(?!(?:'
  + 'a|em|strong|small|s|cite|q|dfn|abbr|data|time|code'
  + '|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo'
  + '|span|br|wbr|ins|del|img)\\b)\\w+(?!:/|[^\\w\\s@]*@)\\b';

block.html = replace(block.html)
  ('comment', /<!--[\s\S]*?-->/)
  ('closed', /<(tag)[\s\S]+?<\/\1>/)
  ('closing', /<tag(?:"[^"]*"|'[^']*'|[^'">])*?>/)
  (/tag/g, block._tag)
  ();

block.paragraph = replace(block.paragraph)
  ('hr', block.hr)
  ('heading', block.heading)
  ('lheading', block.lheading)
  ('blockquote', block.blockquote)
  ('tag', '<' + block._tag)
  ('def', block.def)
  ();

/**
 * Normal Block Grammar
 */

block.normal = merge({}, block);

/**
 * GFM Block Grammar
 */

block.gfm = merge({}, block.normal, {
  fences: /^ *(`{3,}|~{3,}) *(\S+)? *\n([\s\S]+?)\s*\1 *(?:\n+|$)/,
  paragraph: /^/
});

block.gfm.paragraph = replace(block.paragraph)
  ('(?!', '(?!'
    + block.gfm.fences.source.replace('\\1', '\\2') + '|'
    + block.list.source.replace('\\1', '\\3') + '|')
  ();

/**
 * GFM + Tables Block Grammar
 */

block.tables = merge({}, block.gfm, {
  nptable: /^ *(\S.*\|.*)\n *([-:]+ *\|[-| :]*)\n((?:.*\|.*(?:\n|$))*)\n*/,
  table: /^ *\|(.+)\n *\|( *[-:]+[-| :]*)\n((?: *\|.*(?:\n|$))*)\n*/
});

/**
 * Block Lexer
 */

function Lexer(options) {
  this.tokens = [];
  this.tokens.links = {};
  this.options = options || marked.defaults;
  this.rules = block.normal;

  if (this.options.gfm) {
    if (this.options.tables) {
      this.rules = block.tables;
    } else {
      this.rules = block.gfm;
    }
  }
}

/**
 * Expose Block Rules
 */

Lexer.rules = block;

/**
 * Static Lex Method
 */

Lexer.lex = function(src, options) {
  var lexer = new Lexer(options);
  return lexer.lex(src);
};

/**
 * Preprocessing
 */

Lexer.prototype.lex = function(src) {
  src = src
    .replace(/\r\n|\r/g, '\n')
    .replace(/\t/g, '    ')
    .replace(/\u00a0/g, ' ')
    .replace(/\u2424/g, '\n');

  return this.token(src, true);
};

/**
 * Lexing
 */

Lexer.prototype.token = function(src, top, bq) {
  var src = src.replace(/^ +$/gm, '')
    , next
    , loose
    , cap
    , bull
    , b
    , item
    , space
    , i
    , l;

  while (src) {
    // newline
    if (cap = this.rules.newline.exec(src)) {
      src = src.substring(cap[0].length);
      if (cap[0].length > 1) {
        this.tokens.push({
          type: 'space'
        });
      }
    }

    // code
    if (cap = this.rules.code.exec(src)) {
      src = src.substring(cap[0].length);
      cap = cap[0].replace(/^ {4}/gm, '');
      this.tokens.push({
        type: 'code',
        text: !this.options.pedantic
          ? cap.replace(/\n+$/, '')
          : cap
      });
      continue;
    }

    // fences (gfm)
    if (cap = this.rules.fences.exec(src)) {
      src = src.substring(cap[0].length);
      this.tokens.push({
        type: 'code',
        lang: cap[2],
        text: cap[3]
      });
      continue;
    }

    // heading
    if (cap = this.rules.heading.exec(src)) {
      src = src.substring(cap[0].length);
      this.tokens.push({
        type: 'heading',
        depth: cap[1].length,
        text: cap[2]
      });
      continue;
    }

    // table no leading pipe (gfm)
    if (top && (cap = this.rules.nptable.exec(src))) {
      src = src.substring(cap[0].length);

      item = {
        type: 'table',
        header: cap[1].replace(/^ *| *\| *$/g, '').split(/ *\| */),
        align: cap[2].replace(/^ *|\| *$/g, '').split(/ *\| */),
        cells: cap[3].replace(/\n$/, '').split('\n')
      };

      for (i = 0; i < item.align.length; i++) {
        if (/^ *-+: *$/.test(item.align[i])) {
          item.align[i] = 'right';
        } else if (/^ *:-+: *$/.test(item.align[i])) {
          item.align[i] = 'center';
        } else if (/^ *:-+ *$/.test(item.align[i])) {
          item.align[i] = 'left';
        } else {
          item.align[i] = null;
        }
      }

      for (i = 0; i < item.cells.length; i++) {
        item.cells[i] = item.cells[i].split(/ *\| */);
      }

      this.tokens.push(item);

      continue;
    }

    // lheading
    if (cap = this.rules.lheading.exec(src)) {
      src = src.substring(cap[0].length);
      this.tokens.push({
        type: 'heading',
        depth: cap[2] === '=' ? 1 : 2,
        text: cap[1]
      });
      continue;
    }

    // hr
    if (cap = this.rules.hr.exec(src)) {
      src = src.substring(cap[0].length);
      this.tokens.push({
        type: 'hr'
      });
      continue;
    }

    // blockquote
    if (cap = this.rules.blockquote.exec(src)) {
      src = src.substring(cap[0].length);

      this.tokens.push({
        type: 'blockquote_start'
      });

      cap = cap[0].replace(/^ *> ?/gm, '');

      // Pass `top` to keep the current
      // "toplevel" state. This is exactly
      // how markdown.pl works.
      this.token(cap, top, true);

      this.tokens.push({
        type: 'blockquote_end'
      });

      continue;
    }

    // list
    if (cap = this.rules.list.exec(src)) {
      src = src.substring(cap[0].length);
      bull = cap[2];

      this.tokens.push({
        type: 'list_start',
        ordered: bull.length > 1
      });

      // Get each top-level item.
      cap = cap[0].match(this.rules.item);

      next = false;
      l = cap.length;
      i = 0;

      for (; i < l; i++) {
        item = cap[i];

        // Remove the list item's bullet
        // so it is seen as the next token.
        space = item.length;
        item = item.replace(/^ *([*+-]|\d+\.) +/, '');

        // Outdent whatever the
        // list item contains. Hacky.
        if (~item.indexOf('\n ')) {
          space -= item.length;
          item = !this.options.pedantic
            ? item.replace(new RegExp('^ {1,' + space + '}', 'gm'), '')
            : item.replace(/^ {1,4}/gm, '');
        }

        // Determine whether the next list item belongs here.
        // Backpedal if it does not belong in this list.
        if (this.options.smartLists && i !== l - 1) {
          b = block.bullet.exec(cap[i + 1])[0];
          if (bull !== b && !(bull.length > 1 && b.length > 1)) {
            src = cap.slice(i + 1).join('\n') + src;
            i = l - 1;
          }
        }

        // Determine whether item is loose or not.
        // Use: /(^|\n)(?! )[^\n]+\n\n(?!\s*$)/
        // for discount behavior.
        loose = next || /\n\n(?!\s*$)/.test(item);
        if (i !== l - 1) {
          next = item.charAt(item.length - 1) === '\n';
          if (!loose) loose = next;
        }

        this.tokens.push({
          type: loose
            ? 'loose_item_start'
            : 'list_item_start'
        });

        // Recurse.
        this.token(item, false, bq);

        this.tokens.push({
          type: 'list_item_end'
        });
      }

      this.tokens.push({
        type: 'list_end'
      });

      continue;
    }

    // html
    if (cap = this.rules.html.exec(src)) {
      src = src.substring(cap[0].length);
      this.tokens.push({
        type: this.options.sanitize
          ? 'paragraph'
          : 'html',
        pre: cap[1] === 'pre' || cap[1] === 'script' || cap[1] === 'style',
        text: cap[0]
      });
      continue;
    }

    // def
    if ((!bq && top) && (cap = this.rules.def.exec(src))) {
      src = src.substring(cap[0].length);
      this.tokens.links[cap[1].toLowerCase()] = {
        href: cap[2],
        title: cap[3]
      };
      continue;
    }

    // table (gfm)
    if (top && (cap = this.rules.table.exec(src))) {
      src = src.substring(cap[0].length);

      item = {
        type: 'table',
        header: cap[1].replace(/^ *| *\| *$/g, '').split(/ *\| */),
        align: cap[2].replace(/^ *|\| *$/g, '').split(/ *\| */),
        cells: cap[3].replace(/(?: *\| *)?\n$/, '').split('\n')
      };

      for (i = 0; i < item.align.length; i++) {
        if (/^ *-+: *$/.test(item.align[i])) {
          item.align[i] = 'right';
        } else if (/^ *:-+: *$/.test(item.align[i])) {
          item.align[i] = 'center';
        } else if (/^ *:-+ *$/.test(item.align[i])) {
          item.align[i] = 'left';
        } else {
          item.align[i] = null;
        }
      }

      for (i = 0; i < item.cells.length; i++) {
        item.cells[i] = item.cells[i]
          .replace(/^ *\| *| *\| *$/g, '')
          .split(/ *\| */);
      }

      this.tokens.push(item);

      continue;
    }

    // top-level paragraph
    if (top && (cap = this.rules.paragraph.exec(src))) {
      src = src.substring(cap[0].length);
      this.tokens.push({
        type: 'paragraph',
        text: cap[1].charAt(cap[1].length - 1) === '\n'
          ? cap[1].slice(0, -1)
          : cap[1]
      });
      continue;
    }

    // text
    if (cap = this.rules.text.exec(src)) {
      // Top-level should never reach here.
      src = src.substring(cap[0].length);
      this.tokens.push({
        type: 'text',
        text: cap[0]
      });
      continue;
    }

    if (src) {
      throw new
        Error('Infinite loop on byte: ' + src.charCodeAt(0));
    }
  }

  return this.tokens;
};

/**
 * Inline-Level Grammar
 */

var inline = {
  escape: /^\\([\\`*{}\[\]()#+\-.!_>])/,
  autolink: /^<([^ >]+(@|:\/)[^ >]+)>/,
  url: noop,
  tag: /^<!--[\s\S]*?-->|^<\/?\w+(?:"[^"]*"|'[^']*'|[^'">])*?>/,
  link: /^!?\[(inside)\]\(href\)/,
  reflink: /^!?\[(inside)\]\s*\[([^\]]*)\]/,
  nolink: /^!?\[((?:\[[^\]]*\]|[^\[\]])*)\]/,
  strong: /^__([\s\S]+?)__(?!_)|^\*\*([\s\S]+?)\*\*(?!\*)/,
  em: /^\b_((?:__|[\s\S])+?)_\b|^\*((?:\*\*|[\s\S])+?)\*(?!\*)/,
  code: /^(`+)\s*([\s\S]*?[^`])\s*\1(?!`)/,
  br: /^ {2,}\n(?!\s*$)/,
  del: noop,
  text: /^[\s\S]+?(?=[\\<!\[_*`]| {2,}\n|$)/
};

inline._inside = /(?:\[[^\]]*\]|[^\[\]]|\](?=[^\[]*\]))*/;
inline._href = /\s*<?([\s\S]*?)>?(?:\s+['"]([\s\S]*?)['"])?\s*/;

inline.link = replace(inline.link)
  ('inside', inline._inside)
  ('href', inline._href)
  ();

inline.reflink = replace(inline.reflink)
  ('inside', inline._inside)
  ();

/**
 * Normal Inline Grammar
 */

inline.normal = merge({}, inline);

/**
 * Pedantic Inline Grammar
 */

inline.pedantic = merge({}, inline.normal, {
  strong: /^__(?=\S)([\s\S]*?\S)__(?!_)|^\*\*(?=\S)([\s\S]*?\S)\*\*(?!\*)/,
  em: /^_(?=\S)([\s\S]*?\S)_(?!_)|^\*(?=\S)([\s\S]*?\S)\*(?!\*)/
});

/**
 * GFM Inline Grammar
 */

inline.gfm = merge({}, inline.normal, {
  escape: replace(inline.escape)('])', '~|])')(),
  url: /^(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/,
  del: /^~~(?=\S)([\s\S]*?\S)~~/,
  text: replace(inline.text)
    (']|', '~]|')
    ('|', '|https?://|')
    ()
});

/**
 * GFM + Line Breaks Inline Grammar
 */

inline.breaks = merge({}, inline.gfm, {
  br: replace(inline.br)('{2,}', '*')(),
  text: replace(inline.gfm.text)('{2,}', '*')()
});

/**
 * Inline Lexer & Compiler
 */

function InlineLexer(links, options) {
  this.options = options || marked.defaults;
  this.links = links;
  this.rules = inline.normal;
  this.renderer = this.options.renderer || new Renderer;
  this.renderer.options = this.options;

  if (!this.links) {
    throw new
      Error('Tokens array requires a `links` property.');
  }

  if (this.options.gfm) {
    if (this.options.breaks) {
      this.rules = inline.breaks;
    } else {
      this.rules = inline.gfm;
    }
  } else if (this.options.pedantic) {
    this.rules = inline.pedantic;
  }
}

/**
 * Expose Inline Rules
 */

InlineLexer.rules = inline;

/**
 * Static Lexing/Compiling Method
 */

InlineLexer.output = function(src, links, options) {
  var inline = new InlineLexer(links, options);
  return inline.output(src);
};

/**
 * Lexing/Compiling
 */

InlineLexer.prototype.output = function(src) {
  var out = ''
    , link
    , text
    , href
    , cap;

  while (src) {
    // escape
    if (cap = this.rules.escape.exec(src)) {
      src = src.substring(cap[0].length);
      out += cap[1];
      continue;
    }

    // autolink
    if (cap = this.rules.autolink.exec(src)) {
      src = src.substring(cap[0].length);
      if (cap[2] === '@') {
        text = cap[1].charAt(6) === ':'
          ? this.mangle(cap[1].substring(7))
          : this.mangle(cap[1]);
        href = this.mangle('mailto:') + text;
      } else {
        text = escape(cap[1]);
        href = text;
      }
      out += this.renderer.link(href, null, text);
      continue;
    }

    // url (gfm)
    if (!this.inLink && (cap = this.rules.url.exec(src))) {
      src = src.substring(cap[0].length);
      text = escape(cap[1]);
      href = text;
      out += this.renderer.link(href, null, text);
      continue;
    }

    // tag
    if (cap = this.rules.tag.exec(src)) {
      if (!this.inLink && /^<a /i.test(cap[0])) {
        this.inLink = true;
      } else if (this.inLink && /^<\/a>/i.test(cap[0])) {
        this.inLink = false;
      }
      src = src.substring(cap[0].length);
      out += this.options.sanitize
        ? escape(cap[0])
        : cap[0];
      continue;
    }

    // link
    if (cap = this.rules.link.exec(src)) {
      src = src.substring(cap[0].length);
      this.inLink = true;
      out += this.outputLink(cap, {
        href: cap[2],
        title: cap[3]
      });
      this.inLink = false;
      continue;
    }

    // reflink, nolink
    if ((cap = this.rules.reflink.exec(src))
        || (cap = this.rules.nolink.exec(src))) {
      src = src.substring(cap[0].length);
      link = (cap[2] || cap[1]).replace(/\s+/g, ' ');
      link = this.links[link.toLowerCase()];
      if (!link || !link.href) {
        out += cap[0].charAt(0);
        src = cap[0].substring(1) + src;
        continue;
      }
      this.inLink = true;
      out += this.outputLink(cap, link);
      this.inLink = false;
      continue;
    }

    // strong
    if (cap = this.rules.strong.exec(src)) {
      src = src.substring(cap[0].length);
      out += this.renderer.strong(this.output(cap[2] || cap[1]));
      continue;
    }

    // em
    if (cap = this.rules.em.exec(src)) {
      src = src.substring(cap[0].length);
      out += this.renderer.em(this.output(cap[2] || cap[1]));
      continue;
    }

    // code
    if (cap = this.rules.code.exec(src)) {
      src = src.substring(cap[0].length);
      out += this.renderer.codespan(escape(cap[2], true));
      continue;
    }

    // br
    if (cap = this.rules.br.exec(src)) {
      src = src.substring(cap[0].length);
      out += this.renderer.br();
      continue;
    }

    // del (gfm)
    if (cap = this.rules.del.exec(src)) {
      src = src.substring(cap[0].length);
      out += this.renderer.del(this.output(cap[1]));
      continue;
    }

    // text
    if (cap = this.rules.text.exec(src)) {
      src = src.substring(cap[0].length);
      out += escape(this.smartypants(cap[0]));
      continue;
    }

    if (src) {
      throw new
        Error('Infinite loop on byte: ' + src.charCodeAt(0));
    }
  }

  return out;
};

/**
 * Compile Link
 */

InlineLexer.prototype.outputLink = function(cap, link) {
  var href = escape(link.href)
    , title = link.title ? escape(link.title) : null;

  return cap[0].charAt(0) !== '!'
    ? this.renderer.link(href, title, this.output(cap[1]))
    : this.renderer.image(href, title, escape(cap[1]));
};

/**
 * Smartypants Transformations
 */

InlineLexer.prototype.smartypants = function(text) {
  if (!this.options.smartypants) return text;
  return text
    // em-dashes
    .replace(/--/g, '\u2014')
    // opening singles
    .replace(/(^|[-\u2014/(\[{"\s])'/g, '$1\u2018')
    // closing singles & apostrophes
    .replace(/'/g, '\u2019')
    // opening doubles
    .replace(/(^|[-\u2014/(\[{\u2018\s])"/g, '$1\u201c')
    // closing doubles
    .replace(/"/g, '\u201d')
    // ellipses
    .replace(/\.{3}/g, '\u2026');
};

/**
 * Mangle Links
 */

InlineLexer.prototype.mangle = function(text) {
  var out = ''
    , l = text.length
    , i = 0
    , ch;

  for (; i < l; i++) {
    ch = text.charCodeAt(i);
    if (Math.random() > 0.5) {
      ch = 'x' + ch.toString(16);
    }
    out += '&#' + ch + ';';
  }

  return out;
};

/**
 * Renderer
 */

function Renderer(options) {
  this.options = options || {};
}

Renderer.prototype.code = function(code, lang, escaped) {
  if (this.options.highlight) {
    var out = this.options.highlight(code, lang);
    if (out != null && out !== code) {
      escaped = true;
      code = out;
    }
  }

  if (!lang) {
    return '<pre><code>'
      + (escaped ? code : escape(code, true))
      + '\n</code></pre>';
  }

  return '<pre><code class="'
    + this.options.langPrefix
    + escape(lang, true)
    + '">'
    + (escaped ? code : escape(code, true))
    + '\n</code></pre>\n';
};

Renderer.prototype.blockquote = function(quote) {
  return '<blockquote>\n' + quote + '</blockquote>\n';
};

Renderer.prototype.html = function(html) {
  return html;
};

Renderer.prototype.heading = function(text, level, raw) {
  return '<h'
    + level
    + ' id="'
    + this.options.headerPrefix
    + raw.toLowerCase().replace(/[^\w]+/g, '-')
    + '">'
    + text
    + '</h'
    + level
    + '>\n';
};

Renderer.prototype.hr = function() {
  return this.options.xhtml ? '<hr/>\n' : '<hr>\n';
};

Renderer.prototype.list = function(body, ordered) {
  var type = ordered ? 'ol' : 'ul';
  return '<' + type + '>\n' + body + '</' + type + '>\n';
};

Renderer.prototype.listitem = function(text) {
  return '<li>' + text + '</li>\n';
};

Renderer.prototype.paragraph = function(text) {
  return '<p>' + text + '</p>\n';
};

Renderer.prototype.table = function(header, body) {
  return '<table>\n'
    + '<thead>\n'
    + header
    + '</thead>\n'
    + '<tbody>\n'
    + body
    + '</tbody>\n'
    + '</table>\n';
};

Renderer.prototype.tablerow = function(content) {
  return '<tr>\n' + content + '</tr>\n';
};

Renderer.prototype.tablecell = function(content, flags) {
  var type = flags.header ? 'th' : 'td';
  var tag = flags.align
    ? '<' + type + ' style="text-align:' + flags.align + '">'
    : '<' + type + '>';
  return tag + content + '</' + type + '>\n';
};

// span level renderer
Renderer.prototype.strong = function(text) {
  return '<strong>' + text + '</strong>';
};

Renderer.prototype.em = function(text) {
  return '<em>' + text + '</em>';
};

Renderer.prototype.codespan = function(text) {
  return '<code>' + text + '</code>';
};

Renderer.prototype.br = function() {
  return this.options.xhtml ? '<br/>' : '<br>';
};

Renderer.prototype.del = function(text) {
  return '<del>' + text + '</del>';
};

Renderer.prototype.link = function(href, title, text) {
  if (this.options.sanitize) {
    try {
      var prot = decodeURIComponent(unescape(href))
        .replace(/[^\w:]/g, '')
        .toLowerCase();
    } catch (e) {
      return '';
    }
    if (prot.indexOf('javascript:') === 0 || prot.indexOf('vbscript:') === 0) {
      return '';
    }
  }
  var out = '<a href="' + href + '"';
  if (title) {
    out += ' title="' + title + '"';
  }
  out += '>' + text + '</a>';
  return out;
};

Renderer.prototype.image = function(href, title, text) {
  var out = '<img src="' + href + '" alt="' + text + '"';
  if (title) {
    out += ' title="' + title + '"';
  }
  out += this.options.xhtml ? '/>' : '>';
  return out;
};

/**
 * Parsing & Compiling
 */

function Parser(options) {
  this.tokens = [];
  this.token = null;
  this.options = options || marked.defaults;
  this.options.renderer = this.options.renderer || new Renderer;
  this.renderer = this.options.renderer;
  this.renderer.options = this.options;
}

/**
 * Static Parse Method
 */

Parser.parse = function(src, options, renderer) {
  var parser = new Parser(options, renderer);
  return parser.parse(src);
};

/**
 * Parse Loop
 */

Parser.prototype.parse = function(src) {
  this.inline = new InlineLexer(src.links, this.options, this.renderer);
  this.tokens = src.reverse();

  var out = '';
  while (this.next()) {
    out += this.tok();
  }

  return out;
};

/**
 * Next Token
 */

Parser.prototype.next = function() {
  return this.token = this.tokens.pop();
};

/**
 * Preview Next Token
 */

Parser.prototype.peek = function() {
  return this.tokens[this.tokens.length - 1] || 0;
};

/**
 * Parse Text Tokens
 */

Parser.prototype.parseText = function() {
  var body = this.token.text;

  while (this.peek().type === 'text') {
    body += '\n' + this.next().text;
  }

  return this.inline.output(body);
};

/**
 * Parse Current Token
 */

Parser.prototype.tok = function() {
  switch (this.token.type) {
    case 'space': {
      return '';
    }
    case 'hr': {
      return this.renderer.hr();
    }
    case 'heading': {
      return this.renderer.heading(
        this.inline.output(this.token.text),
        this.token.depth,
        this.token.text);
    }
    case 'code': {
      return this.renderer.code(this.token.text,
        this.token.lang,
        this.token.escaped);
    }
    case 'table': {
      var header = ''
        , body = ''
        , i
        , row
        , cell
        , flags
        , j;

      // header
      cell = '';
      for (i = 0; i < this.token.header.length; i++) {
        flags = { header: true, align: this.token.align[i] };
        cell += this.renderer.tablecell(
          this.inline.output(this.token.header[i]),
          { header: true, align: this.token.align[i] }
        );
      }
      header += this.renderer.tablerow(cell);

      for (i = 0; i < this.token.cells.length; i++) {
        row = this.token.cells[i];

        cell = '';
        for (j = 0; j < row.length; j++) {
          cell += this.renderer.tablecell(
            this.inline.output(row[j]),
            { header: false, align: this.token.align[j] }
          );
        }

        body += this.renderer.tablerow(cell);
      }
      return this.renderer.table(header, body);
    }
    case 'blockquote_start': {
      var body = '';

      while (this.next().type !== 'blockquote_end') {
        body += this.tok();
      }

      return this.renderer.blockquote(body);
    }
    case 'list_start': {
      var body = ''
        , ordered = this.token.ordered;

      while (this.next().type !== 'list_end') {
        body += this.tok();
      }

      return this.renderer.list(body, ordered);
    }
    case 'list_item_start': {
      var body = '';

      while (this.next().type !== 'list_item_end') {
        body += this.token.type === 'text'
          ? this.parseText()
          : this.tok();
      }

      return this.renderer.listitem(body);
    }
    case 'loose_item_start': {
      var body = '';

      while (this.next().type !== 'list_item_end') {
        body += this.tok();
      }

      return this.renderer.listitem(body);
    }
    case 'html': {
      var html = !this.token.pre && !this.options.pedantic
        ? this.inline.output(this.token.text)
        : this.token.text;
      return this.renderer.html(html);
    }
    case 'paragraph': {
      return this.renderer.paragraph(this.inline.output(this.token.text));
    }
    case 'text': {
      return this.renderer.paragraph(this.parseText());
    }
  }
};

/**
 * Helpers
 */

function escape(html, encode) {
  return html
    .replace(!encode ? /&(?!#?\w+;)/g : /&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function unescape(html) {
  return html.replace(/&([#\w]+);/g, function(_, n) {
    n = n.toLowerCase();
    if (n === 'colon') return ':';
    if (n.charAt(0) === '#') {
      return n.charAt(1) === 'x'
        ? String.fromCharCode(parseInt(n.substring(2), 16))
        : String.fromCharCode(+n.substring(1));
    }
    return '';
  });
}

function replace(regex, opt) {
  regex = regex.source;
  opt = opt || '';
  return function self(name, val) {
    if (!name) return new RegExp(regex, opt);
    val = val.source || val;
    val = val.replace(/(^|[^\[])\^/g, '$1');
    regex = regex.replace(name, val);
    return self;
  };
}

function noop() {}
noop.exec = noop;

function merge(obj) {
  var i = 1
    , target
    , key;

  for (; i < arguments.length; i++) {
    target = arguments[i];
    for (key in target) {
      if (Object.prototype.hasOwnProperty.call(target, key)) {
        obj[key] = target[key];
      }
    }
  }

  return obj;
}


/**
 * Marked
 */

function marked(src, opt, callback) {
  if (callback || typeof opt === 'function') {
    if (!callback) {
      callback = opt;
      opt = null;
    }

    opt = merge({}, marked.defaults, opt || {});

    var highlight = opt.highlight
      , tokens
      , pending
      , i = 0;

    try {
      tokens = Lexer.lex(src, opt)
    } catch (e) {
      return callback(e);
    }

    pending = tokens.length;

    var done = function(err) {
      if (err) {
        opt.highlight = highlight;
        return callback(err);
      }

      var out;

      try {
        out = Parser.parse(tokens, opt);
      } catch (e) {
        err = e;
      }

      opt.highlight = highlight;

      return err
        ? callback(err)
        : callback(null, out);
    };

    if (!highlight || highlight.length < 3) {
      return done();
    }

    delete opt.highlight;

    if (!pending) return done();

    for (; i < tokens.length; i++) {
      (function(token) {
        if (token.type !== 'code') {
          return --pending || done();
        }
        return highlight(token.text, token.lang, function(err, code) {
          if (err) return done(err);
          if (code == null || code === token.text) {
            return --pending || done();
          }
          token.text = code;
          token.escaped = true;
          --pending || done();
        });
      })(tokens[i]);
    }

    return;
  }
  try {
    if (opt) opt = merge({}, marked.defaults, opt);
    return Parser.parse(Lexer.lex(src, opt), opt);
  } catch (e) {
    e.message += '\nPlease report this to https://github.com/chjj/marked.';
    if ((opt || marked.defaults).silent) {
      return '<p>An error occured:</p><pre>'
        + escape(e.message + '', true)
        + '</pre>';
    }
    throw e;
  }
}

/**
 * Options
 */

marked.options =
marked.setOptions = function(opt) {
  merge(marked.defaults, opt);
  return marked;
};

marked.defaults = {
  gfm: true,
  tables: true,
  breaks: false,
  pedantic: false,
  sanitize: false,
  smartLists: false,
  silent: false,
  highlight: null,
  langPrefix: 'lang-',
  smartypants: false,
  headerPrefix: '',
  renderer: new Renderer,
  xhtml: false
};

/**
 * Expose
 */

marked.Parser = Parser;
marked.parser = Parser.parse;

marked.Renderer = Renderer;

marked.Lexer = Lexer;
marked.lexer = Lexer.lex;

marked.InlineLexer = InlineLexer;
marked.inlineLexer = InlineLexer.output;

marked.parse = marked;

if (typeof module !== 'undefined' && typeof exports === 'object') {
  module.exports = marked;
} else if (typeof define === 'function' && define.amd) {
  define(function() { return marked; });
} else {
  this.marked = marked;
}

}).call(function() {
  return this || (typeof window !== 'undefined' ? window : global);
}());

/* jshint undef: true, unused: true */
/* global angular:true */

(function () {
	'use strict';

  var app = angular.module('hc.marked', []);

  //app.constant('marked', window.marked);

  app.provider('marked', function () {

    var self = this;

    self.setOptions = function(opts) {  // Store options for later
      this.defaults = opts;
    };

    self.$get = ['$window',function ($window) { 
      var m = $window.marked;

      self.setOptions = m.setOptions;
      m.setOptions(self.defaults);

      return m;
    }];

  });

  // TODO: filter tests */
  //app.filter('marked', ['marked', function(marked) {
	//  return marked;
	//}]);

  app.directive('marked', ['marked', function (marked) {
    return {
      restrict: 'AE',
      replace: true,
      scope: {
        opts: '=',
        marked: '='
      },
      link: function (scope, element, attrs) {
        set(scope.marked || element.text() || '');

        function set(val) {
        	element.html(marked(val || '', scope.opts || null));
        }
        
        if (attrs.marked) {
          scope.$watch('marked', set);        	
        }

      }
    };
  }]);

}());
function docsConstantsProvider(){
  this.TocFile = 'toc.yaml'; // docConstants.TocFile
  this.TocAndFileUrlSeperator = '!'; // docConstants.TocAndFileUrlSeperator
}

angular.module('docConstants', [])
.service('docConstants', docsConstantsProvider);
function utilityProvider() {
  this.cleanArray = function(actual) {
    'use strict';
    var newArray = [];
    for (var i = 0; i < actual.length; i++) {
      if (actual[i]) {
        newArray.push(actual[i]);
      }
    }
    return newArray;
  };
}

angular.module('docUtility', [])
  .service('docUtility', utilityProvider);
angular.module('directives', [])
  /**
   * backToTop Directive
   * @param  {Function} $anchorScroll
   *
   * @description Ensure that the browser scrolls when the anchor is clicked
   */
  .directive('backToTop', ['$anchorScroll', '$location', function($anchorScroll, $location) {
    return function link(scope, element) {
      element.on('click', function(event) {
        $location.hash('');
        scope.$apply($anchorScroll);
      });
    };
  }])
  .directive('scrollYOffsetElement', ['$anchorScroll', function($anchorScroll) {
    return function(scope, element) {
      $anchorScroll.yOffset = element;
    };
  }]);
var directive = {};

directive.runnableExample = ['$templateCache', '$document', function($templateCache, $document) {
  'use strict';
  var exampleClassNameSelector = '.runnable-example-file';
  var doc = $document[0];
  var tpl =
    '<nav class="runnable-example-tabs" ng-if="tabs">' +
    '  <a ng-class="{active:$index==activeTabIndex}"' +
    'ng-repeat="tab in tabs track by $index" ' +
    'href="" ' +
    'class="btn"' +
    'ng-click="setTab($index)">' +
    '    {{ tab }}' +
    '  </a>' +
    '</nav>';

  return {
    restrict: 'C',
    scope: true,
    controller: ['$scope', function($scope) {
      $scope.setTab = function(index) {
        var tab = $scope.tabs[index];
        $scope.activeTabIndex = index;
        $scope.$broadcast('tabChange', index, tab);
      };
    }],
    compile: function(element) {
      element.html(tpl + element.html());
      return function(scope, element) {
        var node = element[0];
        var examples = node.querySelectorAll(exampleClassNameSelector);
        var tabs = [],
          now = Date.now();
        angular.forEach(examples, function(child, index) {
          tabs.push(child.getAttribute('name'));
        });

        if (tabs.length > 0) {
          scope.tabs = tabs;
          scope.$on('tabChange', function(e, index, title) {
            angular.forEach(examples, function(child) {
              child.style.display = 'none';
            });
            var selected = examples[index];
            selected.style.display = 'block';
          });
          scope.setTab(0);
        }
      };
    }
  };
}];

directive.dropdownToggle =
  ['$document', '$location', '$window',
    function($document, $location, $window) {
      'use strict';
      var openElement = null,
        close;
      return {
        restrict: 'C',
        link: function(scope, element, attrs) {
          scope.$watch(function dropdownTogglePathWatch() {
            return $location.path();
          }, function dropdownTogglePathWatchAction() {
            if (close) close();
          });

          element.parent().on('click', function(event) {
            if (close) close();
          });

          element.on('click', function(event) {
            event.preventDefault();
            event.stopPropagation();

            var iWasOpen = false;

            if (openElement) {
              iWasOpen = openElement === element;
              close();
            }

            if (!iWasOpen) {
              element.parent().addClass('open');
              openElement = element;

              close = function(event) {
                if (event) event.preventDefault();
                if (event) event.stopPropagation();
                $document.off('click', close);
                element.parent().removeClass('open');
                close = null;
                openElement = null;
              };

              $document.on('click', close);
            }
          });
        }
      };
    }
  ];

directive.syntax = function() {
  'use strict';
  return {
    restrict: 'A',
    link: function(scope, element, attrs) {
      function makeLink(type, text, link, icon) {
        return '<a href="' + link + '" class="btn syntax-' + type + '" target="_blank" rel="nofollow">' +
          '<span class="' + icon + '"></span> ' + text +
          '</a>';
      }

      var html = '';
      var types = {
        'github': {
          text: 'View on Github',
          key: 'syntaxGithub',
          icon: 'icon-github'
        },
        'plunkr': {
          text: 'View on Plunkr',
          key: 'syntaxPlunkr',
          icon: 'icon-arrow-down'
        },
        'jsfiddle': {
          text: 'View on JSFiddle',
          key: 'syntaxFiddle',
          icon: 'icon-cloud'
        }
      };
      for (var type in types) {
        var data = types[type];
        var link = attrs[data.key];
        if (link) {
          html += makeLink(type, data.text, link, data.icon);
        }
      }

      var nav = document.createElement('nav');
      nav.className = 'syntax-links';
      nav.innerHTML = html;

      var node = element[0];
      var par = node.parentNode;
      par.insertBefore(nav, node);
    }
  };
};

directive.tabbable = function() {
  'use strict';
  return {
    restrict: 'C',
    compile: function(element) {
      var navTabs = angular.element('<ul class="nav nav-tabs"></ul>'),
        tabContent = angular.element('<div class="tab-content"></div>');

      tabContent.append(element.contents());
      element.append(navTabs).append(tabContent);
    },
    controller: ['$scope', '$element', function($scope, $element) {
      var navTabs = $element.contents().eq(0),
        ngModel = $element.controller('ngModel') || {},
        tabs = [],
        selectedTab;

      ngModel.$render = function() {
        var $viewValue = this.$viewValue;

        if (selectedTab ? (selectedTab.value !== $viewValue) : $viewValue) {
          if (selectedTab) {
            selectedTab.paneElement.removeClass('active');
            selectedTab.tabElement.removeClass('active');
            selectedTab = null;
          }
          if ($viewValue) {
            for (var i = 0, ii = tabs.length; i < ii; i++) {
              if ($viewValue === tabs[i].value) {
                selectedTab = tabs[i];
                break;
              }
            }
            if (selectedTab) {
              selectedTab.paneElement.addClass('active');
              selectedTab.tabElement.addClass('active');
            }
          }

        }
      };

      this.addPane = function(element, attr) {
        var li = angular.element('<li><a href></a></li>'),
          a = li.find('a'),
          tab = {
            paneElement: element,
            paneAttrs: attr,
            tabElement: li
          };

        tabs.push(tab);

        function update() {
          tab.title = attr.title;
          tab.value = attr.value || attr.title;
          if (!ngModel.$setViewValue && (!ngModel.$viewValue || tab === selectedTab)) {
            // we are not part of angular
            ngModel.$viewValue = tab.value;
          }
          ngModel.$render();
        }

        attr.$observe('value', update)();
        attr.$observe('title', function() {
          update();
          a.text(tab.title);
        })();

        navTabs.append(li);
        li.on('click', function(event) {
          event.preventDefault();
          event.stopPropagation();
          if (ngModel.$setViewValue) {
            $scope.$apply(function() {
              ngModel.$setViewValue(tab.value);
              ngModel.$render();
            });
          } else {
            // we are not part of angular
            ngModel.$viewValue = tab.value;
            ngModel.$render();
          }
        });

        return function() {
          tab.tabElement.remove();
          for (var i = 0, ii = tabs.length; i < ii; i++) {
            if (tab === tabs[i]) {
              tabs.splice(i, 1);
            }
          }
        };
      };
    }]
  };
};

directive.table = function() {
  'use strict';
  return {
    restrict: 'E',
    link: function(scope, element, attrs) {
      if (!attrs['class']) {
        element.addClass('table table-bordered table-striped code-table');
      }
    }
  };
};

var popoverElement = function() {
  'use strict';
  var object = {
    init: function() {
      this.element = angular.element(
        '<div class="popover popover-incode top">' +
        '<div class="arrow"></div>' +
        '<div class="popover-inner">' +
        '<div class="popover-title"><code></code></div>' +
        '<div class="popover-content"></div>' +
        '</div>' +
        '</div>'
      );
      this.node = this.element[0];
      this.element.css({
        'display': 'block',
        'position': 'absolute'
      });
      angular.element(document.body).append(this.element);

      var inner = this.element.children()[1];
      this.titleElement = angular.element(inner.childNodes[0].firstChild);
      this.contentElement = angular.element(inner.childNodes[1]);

      //stop the click on the tooltip
      this.element.on('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
      });

      var self = this;
      angular.element(document.body).on('click', function(event) {
        if (self.visible()) self.hide();
      });
    },

    show: function(x, y) {
      this.element.addClass('visible');
      this.position(x || 0, y || 0);
    },

    hide: function() {
      this.element.removeClass('visible');
      this.position(-9999, -9999);
    },

    visible: function() {
      return this.position().y >= 0;
    },

    isSituatedAt: function(element) {
      return this.besideElement ? element[0] === this.besideElement[0] : false;
    },

    title: function(value) {
      return this.titleElement.html(value);
    },

    content: function(value) {
      if (value && value.length > 0) {
        value = marked(value);
      }
      return this.contentElement.html(value);
    },

    positionArrow: function(position) {
      this.node.className = 'popover ' + position;
    },

    positionAway: function() {
      this.besideElement = null;
      this.hide();
    },

    positionBeside: function(element) {
      this.besideElement = element;

      var elm = element[0];
      var x = elm.offsetLeft;
      var y = elm.offsetTop;
      x -= 30;
      y -= this.node.offsetHeight + 10;
      this.show(x, y);
    },

    position: function(x, y) {
      if (x != null && y != null) {
        this.element.css('left', x + 'px');
        this.element.css('top', y + 'px');
      } else {
        return {
          x: this.node.offsetLeft,
          y: this.node.offsetTop
        };
      }
    }
  };

  object.init();
  object.hide();

  return object;
};

directive.popover = ['popoverElement', function(popover) {
  'use strict';
  return {
    restrict: 'A',
    priority: 500,
    link: function(scope, element, attrs) {
      element.on('click', function(event) {
        event.preventDefault();
        event.stopPropagation();
        if (popover.isSituatedAt(element) && popover.visible()) {
          popover.title('');
          popover.content('');
          popover.positionAway();
        } else {
          popover.title(attrs.title);
          popover.content(attrs.content);
          popover.positionBeside(element);
        }
      });
    }
  };
}];

directive.tabPane = function() {
  'use strict';
  return {
    require: '^tabbable',
    restrict: 'C',
    link: function(scope, element, attrs, tabsCtrl) {
      element.on('$remove', tabsCtrl.addPane(element, attrs));
    }
  };
};

directive.foldout = ['$http', '$animate', '$window', function($http, $animate, $window) {
  'use strict';
  return {
    restrict: 'A',
    priority: 500,
    link: function(scope, element, attrs) {
      var container, loading, url = attrs.url;
      if (/\/build\//.test($window.location.href)) {
        url = '/build/docs' + url;
      }
      element.on('click', function() {
        scope.$apply(function() {
          if (!container) {
            if (loading) return;

            loading = true;
            var par = element.parent();
            container = angular.element('<div class="foldout">loading...</div>');
            $animate.enter(container, null, par);

            $http.get(url, {
              cache: true
            }).success(function(html) {
              loading = false;

              html = '<div class="foldout-inner">' +
                '<div calss="foldout-arrow"></div>' +
                html +
                '</div>';
              container.html(html);

              //avoid showing the element if the user has already closed it
              if (container.css('display') === 'block') {
                container.css('display', 'none');
                $animate.addClass(container, 'ng-hide');
              }
            });
          } else {
            if (container.hasClass('ng-hide')) $animate.removeClass(container, 'ng-hide');
            else $animate.addClass(container, 'ng-hide');
          }
        });
      });
    }
  };
}];

angular.module('bootstrap', [])
  .directive(directive)
  .factory('popoverElement', popoverElement)
  .run(function() {
    marked.setOptions({
      gfm: true,
      tables: true
    });
  });
// Meta data used by the AngularJS docs app
angular.module('pagesData', [])
  .value('NG_PAGES', {});
// Order matters
angular.module('itemTypes', [])
  .value('NG_ITEMTYPES', {
    "class": {
      "Property": {
        "name": "Property",
        "description": "Properties",
        "show": false
      },
      "Method": {
        "name": "Method",
        "description": "Methods",
        "show": false
      },
      "Constructor": {
        "name": "Constructor",
        "description": "Constructors",
        "show": false
      },
      "Field": {
        "name": "Field",
        "description": "Fields",
        "show": false
      },
    },
    // [
    //   { "name": "Property", "description": "Property" },
    //   { "name": "Method" , "description": "Method"},
    //   { "name": "Constructor" , "description": "Constructor"},
    //   { "name": "Field" , "description": "Field"},
    // ],
    "namespace": {
      "Class": {
        "name": "Class",
        "description": "Classes",
        "show": false
      },
      "Enum": {
        "name": "Enum",
        "description": "Enums",
        "show": false
      },
      "Delegate": {
        "name": "Delegate",
        "description": "Delegates",
        "show": false
      },
      "Interface": {
        "name": "Interface",
        "description": "Interfaces",
        "show": false
      },
      "Struct": {
        "name": "Struct",
        "description": "Structs",
        "show": false
      },
    },
    // [

    //   { "name": "Class", "description": "Class" },
    //   { "name": "Enum" , "description": "Enum"},
    //   { "name": "Delegate" , "description": "Delegate"},
    //   { "name": "Struct" , "description": "Struct"},
    //   { "name": "Interface", "description": "Interface" },
    // ]
  });
// Meta data used by the AngularJS docs app
angular.module('versionsData', [])
  .value('NG_VERSION', {
    "raw": "1.0.0",
    "major": 1,
    "minor": 0,
    "patch": 0,
    "prerelease": [
      "local"
    ],
    "build": "sha.8200011",
    "version": "1.0.0-master",
    "branch": "master"
  })
  .value('NG_VERSIONS', [{
    "raw": "1.0.0",
    "major": 1,
    "minor": 0,
    "patch": 0,
    "prerelease": [
      "local"
    ],
    "build": "sha.8200011",
    "version": "1.0.0-master",
    "branch": "master"
  }]);
function markdownServiceFunction() {
  function csplay(player, compileServiceBaseUrl) {
    'use strict';
    if (typeof compileServiceBaseUrl === "undefined") {
      compileServiceBaseUrl = "";
    }
    if (compileServiceBaseUrl.substr(-1, 1) !== "/") {
      compileServiceBaseUrl += "/";
    }
    if (typeof player === "string") {
      player = document.getElementById(player);
    }
    // Create editor, split bar and output
    var top = document.createElement("div");
    var splitbar = document.createElement("div");
    var bottom = document.createElement("div");
    top.innerHTML = player.innerHTML;
    top.className = "csplay_editor";
    splitbar.className = "csplay_splitbar";
    bottom.className = "csplay_output";
    var cloned = player.cloneNode(false);
    player.parentNode.replaceChild(cloned, player);
    player = cloned;
    player.appendChild(top);
    player.appendChild(splitbar);
    player.appendChild(bottom);
    // Create ace editor
    var editor = ace.edit(top);
    editor.getSession().setMode("ace/mode/csharp");
    // Use jquery from here
    player = $(player);
    top = $(top);
    splitbar = $(splitbar);
    bottom = $(bottom);
    // Make splitbar draggable
    var dragging = false;
    splitbar.mousedown(function(e) {
      dragging = true;
    });
    player.mouseup(function() {
      dragging = false;
    }).mousemove(function(e) {
      if (dragging) {
        var topHeight = e.pageY - top.offset().top;
        var bottomHeight = top.outerHeight(true) + bottom.outerHeight(true) - topHeight;
        var splitbarHeight = splitbar.outerHeight(true);
        if (topHeight > 0 && bottomHeight > 0) {
          top.css("height", topHeight);
          bottom.css("height", "calc(100% - " + (topHeight + splitbarHeight) + "px)");
          editor.resize();
        }
        e.preventDefault();
      }
    });
    return {
      run: function(callback) {
        $.ajax({
          url: compileServiceBaseUrl + "run",
          type: "POST",
          data: editor.getValue(),
          contentType: "text/plain",
          success: function(data, status, xhr) {
            bottom.html(data).removeClass("error");
            if (typeof callback.success === "function") {
              callback.success(data, status, xhr);
            }
          },
          error: function(xhr, status, message) {
            if (typeof xhr.responseJSON.error_message === "string") {
              bottom.text(xhr.responseJSON.error_message).addClass("error");
            } else {
              bottom.text(xhr.responseText).addClass("error");
            }
            if (typeof callback.error === "function") {
              callback.error(xhr, status, message);
            }
          },
          complete: function(xhr, status) {
            if (typeof callback.complete === "function") {
              callback.complete(xhr, status);
            }
          }
        });
      },
      clearOutput: function() {
        bottom.html("");
      },
      editor: editor
    };
  }

  var player;

  function createPlayer() {
    'use strict';
    var player = csplay("player", "http://dotnetsandbox.azurewebsites.net" /* hardcode for now */ );
    player.editor.setTheme("ace/theme/ambiance");
    player.editor.setFontSize(16);
    $("#run").click(function() {
      var that = $(this);
      that.html('<i class="fa fa-refresh fa-fw fa-spin"></i>Run');
      that.addClass("disabled");
      player.run({
        complete: function() {
          that.text("Run");
          that.removeClass("disabled");
        }
      });
    });
    $("#close").click(function() {
      angular.element("#console").css("margin-left", "100%");
      if (player) player.editor.setReadOnly(true);
    });
    return player;
  }

  this.tryCode = function(enable, code) {
    'use strict';
    if (enable) {
      if (typeof player === "undefined") {
        player = createPlayer();
      }
      player.editor.setValue(code, -1);
      player.editor.clearSelection();
      player.clearOutput();
      angular.element("#console").css("margin-left", "50%");
    } else {
      angular.element("#console").css("margin-left", "100%");
    }
    if (typeof player !== "undefined") {
      player.editor.setReadOnly(!enable);
    }
  };
}

angular.module('directives')
  .service('docsMarkdownService', markdownServiceFunction)
  .directive('markdown', ['docsMarkdownService', function(docsMarkdownService) {
    'use strict';
    var md = (function() {
      marked.setOptions({
        gfm: true,
        pedantic: false,
        sanitize: true
      });

      var toHtml = function(markdown) {
        if (!markdown)
          return '';

        return marked(markdown);
      };
      return {
        toHtml: toHtml
      };
    }());
    return {
      restrict: 'E',
      link: function(scope, element, attrs) {
        scope.$watch(attrs.ngModel, function(value, oldValue) {
          var markdown = value;
          var html = md.toHtml(markdown);
          element.html(html);
          angular.forEach(element.find("code"), function(block) {
            // use highlight.js to highlight code
            hljs.highlightBlock(block);
            // Add try button
            block = block.parentNode;
            var wrapper = document.createElement("div");
            wrapper.className = "codewrapper";
            wrapper.innerHTML = '<div class="trydiv"><span class="tryspan">Try this code</span></div>';
            wrapper.childNodes[0].childNodes[0].onclick = function() {
              docsMarkdownService.tryCode(true, block.innerText);
            };
            block.parentNode.replaceChild(wrapper, block);
            wrapper.appendChild(block);
          });
        });
      }
    };
  }])
  .directive("declaration", function() {
    return {
      restrict: 'E',
      link: function(scope, element, attrs) {
        scope.$watch(attrs.ngModel, function(value, oldValue) {
          var language = attrs.ngLanguage;
          element.html('<code class="lang-' + 'language' + '"></code>');
          var code = element.children("code");
          code.text(value);
          hljs.highlightBlock(code[0]);
        });
      }
    };
  })
  .directive('code', function() {
    return {
      restrict: 'E',
      terminal: true,
      compile: function(element) {
        var linenums = element.hasClass('linenum'); // || element.parent()[0].nodeName === 'PRE';
        var match = /lang-(\S+)/.exec(element[0].className);
        var lang = match && match[1];
        var html = element.html();
        element.html(window.prettyPrintOne(html, lang, linenums));
      }
    };
  });
function docServiceFunction($q, $http, docConstants, docUtility) {

  function normalizeUrl(url){
    if (!url) return '';
    var arr = url.split(/[/|\\]/);
    var newArray = docUtility.cleanArray(arr);
    return newArray.join('/');
  }

  this.tocClassApi = function(navItem) {
    return {
      active: navItem.href && this.pathInfo && this.pathInfo.contentPath,
      current: this.pathInfo.contentPath === navItem.href,
      'nav-index-section': navItem.type === 'section'
    };
  };

  this.gridClassApi = function(toc) {
    return {
      'grid-right': toc,
      grid: !toc
    };
  };

  this.navClassApi = function(navItem) {
    var navPath;
    if (this.pathInfo) {
      navPath = normalizeUrl(this.pathInfo.tocPath || this.pathInfo.contentPath);
    }

    return {
      active: navItem.href && navPath,
      current: navPath === navItem.href,
    };
  };

  this.getRemoteUrl = function(item, startLine) {
    if (item && item.remote && item.remote.repo) {
      var repo = item.remote.repo;
      if (repo.substr(-4) === '.git') {
        repo = repo.substr(0, repo.length - 4);
      }
      var linenum = startLine ? startLine : item.startLine;
      if (repo.match(/https:\/\/.*\.visualstudio\.com\/.*/g)) {
        // TODO: line not working for vso
        return repo + '#path=/' + item.path + '&line=' + linenum;
      }
      if (repo.match(/https:\/\/.*github\.com\/.*/g)) {
        return repo + '/blob' + '/' + item.remote.branch + '/' + item.path + '/#L' + linenum;
      }
    } else {
      return "#";
    }
  };

  this.setItemTypeVisiblity = function(itemTypes, items) {
    for (var prop in itemTypes) {
      itemTypes[prop].show = false;
    }
    if (!items) return itemTypes;
    items.forEach(function(e) {
      if (itemTypes[e.type] && !itemTypes[e.type].show) itemTypes[e.type].show = true;
    });
    return itemTypes;
  };

  this.getPathInfo = function(currentPath) {
    if (!currentPath) return '';
    currentPath = normalizeUrl(currentPath);

    // seperate toc and content with !
    var index = currentPath.indexOf(docConstants.TocAndFileUrlSeperator);
    if (index < 0) {
      // If it ends with .md/.yaml, render it without toc
      if ((/(\.yaml$)|(\.md$)/g).test(currentPath)) {
        return {
          contentPath: currentPath
        };
      } else {
        return {
          tocPath: currentPath,
          tocFilePath: currentPath + '/' + docConstants.TocFile
        };
      }
    }

    return {
      tocPath: currentPath.substring(0, index),
      tocFilePath: currentPath.substring(0, index) + '/' + docConstants.TocFile,
      contentPath: currentPath.substring(index + 1, currentPath.length)
    };
  };

  this.getContentFilePath = function(pathInfo) {
    if (!pathInfo) return '';
    var path = pathInfo.tocPath ? pathInfo.tocPath + '/' : '';
    path += pathInfo.contentPath ? pathInfo.contentPath : docConstants.TocFile;
    return path;
  };

  this.getContentUrl = function(pathInfo) {
    if (!pathInfo) return pathInfo;
    var path = pathInfo.tocPath ? pathInfo.tocPath + docConstants.TocAndFileUrlSeperator : '';
    path += pathInfo.contentPath ? pathInfo.contentPath : docConstants.TocFile;
    return path;
  };

  this.getContentUrlWithTocAndContentUrl = function(tocPath, contentPath) {
    var path = tocPath ? tocPath + docConstants.TocAndFileUrlSeperator : '';
    path += contentPath ? contentPath : docConstants.TocFile;
    return path;
  };

  this.getPathInfoFromContentPath = function(navList, path){
    // normalize path
    path = normalizeUrl(path);
    if (!navList || navList.length === 0) return {contentPath: path};

    for (var i = 0; i < navList.length; i++){
      var href = navList[i].href;
      href = normalizeUrl(href) + '/'; // Append '/'' so that it must be a full path
      // return the first matched nav
      if (path.startsWith(href)){
        return {
              tocPath: href,
              tocFilePath: href + docConstants.TocFile,
              contentPath: path.replace(href, ''),
            };
      }
    }

    return {contentPath: path};
  };

  this. getAbsolutePath = function(currentUrl, relative){
    var pathInfo = this.getPathInfo(currentUrl);
    if (!pathInfo) return '';
    var current = this.getContentFilePath(pathInfo);
    var sep = '/',
      currentList = current.split(sep),
      relList = relative.split(sep),
      fileName = currentList.pop();

    var relPath = currentList;
    while (relList.length > 0){
      var pathPart = relList.shift();
      if (pathPart === '..'){
        if (relPath.length > 0){
          relPath.pop();
        }else{
          throw "invalid path: " + relative;
        }
      }else{
        relPath.push(pathPart);
      }
    }

    return relPath.join(sep);
  };

  this.asyncFetchIndex = function(path, success, fail) {
    var deferred = $q.defer();

    //deferred.notify();
    var req = {
      method: 'GET',
      url: path,
      headers: {
        'Content-Type': 'text/plain'
      }
    };
    $http.get(req.url, req)
      .success(
        function(result) {
          if (success) success(result);
          deferred.resolve();

        }).error(
        function(result) {
          if (fail) fail(result);
          deferred.reject();
        }
      );

    return deferred.promise;
  };

  this.getTocContent = function($scope, path, tocCache){
    if (path) {
      path = normalizeUrl(path);
      var temp = tocCache.get(path);
      if (temp) {
        $scope.toc = temp;
      } else {
        $scope.toc = {path: path};
        this.asyncFetchIndex(path, function(result) {
          var content = jsyaml.load(result);
          var toc = {
            path: path,
            content: content
          };
          tocCache.put(path, toc);
          $scope.toc = toc;
        }, function() {
          var toc = {
            path: path,
          };
          tocCache.put(path, toc);
          $scope.toc = toc;
        });
      }
    }else{
      $scope.toc = undefined;
    }
  };

  this.getDefaultItem = function(array, action) {
    if (!action) return;
    if (array && array.length > 0) {
      return action(array[0]);
    }
  };
}

angular.module('docInitService', ['docConstants', 'docUtility'])
  .service('docService', ['$q', '$http', 'docConstants', 'docUtility', docServiceFunction]);
angular.module('errors', ['ngSanitize'])

.filter('errorLink', ['$sanitize', function($sanitize) {
  'use strict';
  var LINKY_URL_REGEXP = /((ftp|https?):\/\/|(mailto:)?[A-Za-z0-9._%+-]+@)\S*[^\s\.\;\,\(\)\{\}<>]/g,
    MAILTO_REGEXP = /^mailto:/,
    STACK_TRACE_REGEXP = /:\d+:\d+$/;

  var truncate = function(text, nchars) {
    if (text.length > nchars) {
      return text.substr(0, nchars - 3) + '...';
    }
    return text;
  };

  return function(text, target) {
    var targetHtml = target ? ' target="' + target + '"' : '';

    if (!text) return text;

    return $sanitize(text.replace(LINKY_URL_REGEXP, function(url) {
      if (STACK_TRACE_REGEXP.test(url)) {
        return url;
      }

      // if we did not match ftp/http/mailto then assume mailto
      if (!/^((ftp|https?):\/\/|mailto:)/.test(url)) url = 'mailto:' + url;

      return '<a' + targetHtml + ' href="' + url + '">' +
        truncate(url.replace(MAILTO_REGEXP, ''), 60) +
        '</a>';
    }));
  };
}])


.directive('errorDisplay', ['$location', 'errorLinkFilter', function($location, errorLinkFilter) {
  'use strict';
  var interpolate = function(formatString) {
    var formatArgs = arguments;
    return formatString.replace(/\{\d+\}/g, function(match) {
      // Drop the braces and use the unary plus to convert to an integer.
      // The index will be off by one because of the formatString.
      var index = +match.slice(1, -1);
      if (index + 1 >= formatArgs.length) {
        return match;
      }
      return formatArgs[index + 1];
    });
  };

  return {
    link: function(scope, element, attrs) {
      var search = $location.search(),
        formatArgs = [attrs.errorDisplay],
        i;

      for (i = 0; angular.isDefined(search['p' + i]); i++) {
        formatArgs.push(search['p' + i]);
      }
      element.html(errorLinkFilter(interpolate.apply(null, formatArgs), '_blank'));
    }
  };
}]);
angular.module('versions', [])

.controller('DocsVersionsCtrl', ['$scope', '$location', '$window', 'NG_VERSIONS', function($scope, $location, $window, NG_VERSIONS) {
  'use strict';
  $scope.docs_version = NG_VERSIONS[0];
  $scope.docs_versions = NG_VERSIONS;

  for (var i = 0, minor = NaN; i < NG_VERSIONS.length; i++) {
    var version = NG_VERSIONS[i];
    // NaN will give false here
    if (minor <= version.minor) {
      continue;
    }
    version.isLatest = true;
    minor = version.minor;
  }

  $scope.getGroupName = function(v) {
    return v.isLatest ? 'Latest' : ('v' + v.major + '.' + v.minor + '.x');
  };

  $scope.jumpToDocsVersion = function(version) {
    var currentPagePath = $location.path().replace(/\/$/, '');

    // TODO: We need to do some munging of the path for different versions of the API...


    $window.location = version.docsUrl + currentPagePath;
  };
}]);
var player;


angular.module('docsApp', [
  'ngRoute',
  'ngCookies',
  'ngSanitize',
  'ngAnimate',
  'docConstants',
  'docUtility',
  'docCtrl',
  'versionsData',
  'pagesData',
  'itemTypes',
  'directives',
  'errors',
  'versions',
  'bootstrap',
  'ui.bootstrap.dropdown',
  'hc.marked'
]);

angular.module('docCtrl', ['docInitService', 'docUtility'])
  .factory('tocCache', ['$cacheFactory', function($cacheFactory) {
    return $cacheFactory('toc-cache');
  }])
  .factory('mdIndexCache', ['$cacheFactory', function($cacheFactory) {
    return $cacheFactory('mdIndex-cache');
  }])
  .controller('DocsController', [
    '$scope', '$http', '$q', '$rootScope', '$location', '$window', '$cookies',
    'NG_PAGES', 'NG_VERSION', 'NG_ITEMTYPES', 'docService', 'tocCache', 'mdIndexCache', 'docUtility',
    function($scope, $http, $q, $rootScope, $location, $window, $cookies,
      NG_PAGES, NG_VERSION, NG_ITEMTYPES, docService, tocCache, mdIndexCache, docUtility) {
      'use strict';

      $scope.docsVersion = NG_VERSION.isSnapshot ? 'snapshot' : NG_VERSION.version;

      $scope.tocClass = docService.tocClassApi;
      $scope.gridClass = docService.gridClassApi;

      $scope.navClass = docService.navClassApi;

      $scope.getNumber = function(num) {
        return new Array(num + 1);
      };

      $scope.GetDetail = function(e) {
        var display = e.target.nextElementSibling.style.display;
        e.target.nextElementSibling.style.display = (display === 'block') ? 'none' : 'block';
      };

      $scope.ViewSource = function() {
        return docService.getRemoteUrl(this.model.source, this.model.source.startLine + 1);
      };

      $scope.ImproveThisDoc = function() {
        return $scope.partialModel.mdContent;
      };

      // Href relative to current toc file
      $scope.GetTocHref = function(relativeUrl) {
        if (!relativeUrl || !$scope.toc) return '';

        var path = docService.getAbsolutePath($scope.toc.path, relativeUrl);
        var pathInfo = docService.getPathInfoFromContentPath($scope.navbar, path);

        return '#' + docService.getContentUrl(pathInfo);
      };

      // Href relative to current file
      $scope.GetLinkHref = function(relativeUrl) {
        if (!relativeUrl) return relativeUrl;

        var current = $location.path();
        var path = docService.getAbsolutePath(current, relativeUrl);
        var pathInfo = docService.getPathInfoFromContentPath($scope.navbar, path);

        return '#' + docService.getContentUrl(pathInfo);
      };

      $scope.$on('$includeContentLoaded', function() {
        // Add post actions when ng-include updated
      });

      (function getNavbar() {
        // load navigation bar, should be toc.yaml in root path
        // TODO: support toc.md => extract <h><a> from marked(toc.md)
        var navBarPath = "toc.yaml";
        docService.asyncFetchIndex(navBarPath, function(result) {
          $scope.navbar = jsyaml.load(result);

          // Load first item as the default page
          docService.getDefaultItem($scope.navbar,
            function(defaultItem) {
              if (!$location.path() && defaultItem.href) $location.url(defaultItem.href);
            });
        });
      })();

      // #a/b/c!d/e/f => a/b/c/toc.yaml as toc, d/e/f as content
      $scope.$watch(function docsPathWatch() {
        return $location.path();
      }, function docsPathWatchAction(path) {
        path = path.replace(/^\/?(.+?)(\/index)?\/?$/, '$1');

        var currentPage = $scope.currentPage = path; //NG_PAGES[path];

        // TODO: check if it is inside NG_PAGES
        // If current page exists in NG_PAGES
        if (currentPage) {
          var pathInfo = docService.getPathInfo(currentPage);
          $scope.pathInfo = pathInfo;
          docService.getTocContent($scope, pathInfo.tocFilePath, tocCache);

          path = docService.getContentFilePath(pathInfo);
          if (path) {
            // If end with .md
            if ((/\.md$/g).test(path)) {
              $scope.contentType = 'md';
              $scope.partialModel = {};
              $scope.title = path;
              $scope.partialPath = path;
            } else if ((/\.yaml$/g).test(path)) {
              $scope.contentType = 'yaml';
              // if is yaml

              // 1. try get md.yaml from the same path as toc, or current path if toc is not there
              var mdPath = pathInfo.tocPath ? pathInfo.tocPath + '/' + 'md.yaml' : 'md.yaml';

              // TODO: move path to app.config?
              var tempMdIndex = mdIndexCache.get(mdPath);
              if (tempMdIndex) {
                if (tempMdIndex) $scope.mdIndex = tempMdIndex;
              } else {
                docService.asyncFetchIndex(mdPath, function(result) {
                  tempMdIndex = jsyaml.load(result);
                  // This is the md file path
                  mdIndexCache.put(mdPath, tempMdIndex);
                  $scope.mdIndex = tempMdIndex;
                });
              }

              docService.asyncFetchIndex(path, function(result) {
                  var model = $scope.partialModel = jsyaml.load(result);
                  if (model instanceof Array) {
                    // toc list
                    $scope.partialPath = 'template' + '/tocpage.tmpl';
                  } else {
                  $scope.title = model.id;
                    if (model.type.toLowerCase() === 'namespace') {
                      $scope.itemtypes = docService.setItemTypeVisiblity(NG_ITEMTYPES.namespace, model.items);
                      $scope.partialPath = 'template' + '/namespace.tmpl';
                    } else {
                      $scope.itemtypes = docService.setItemTypeVisiblity(NG_ITEMTYPES.class, model.items);
                      $scope.partialPath = 'template' + '/class.tmpl';
                    }
                  }
                },
                function() {
                  $scope.breadcrumb = [];
                  $scope.partialPath = 'template/error404.tmpl';
                }
              );
            } else {
              // If not md or yaml, simply try load the path
              $scope.partialPath = path;
            }
          }

          var pathParts = pathInfo.tocPath ? pathInfo.tocPath.split('/') : [];
          if (pathInfo.contentPath) pathParts.push('!' + pathInfo.contentPath);
          var breadcrumb = $scope.breadcrumb = [];
          var breadcrumbPath = '';
          angular.forEach(pathParts, function(part) {
            if (part) {
              breadcrumbPath += part;
              breadcrumb.push({
                name: part,
                url: breadcrumbPath
              });
              breadcrumbPath += '/';
            }
          });
        } else {
          if ($scope.navbar && $scope.navbar.length > 0) {
            $location.url($scope.navbar[0].href);
          }
        }
      });

      $scope.$watch(function modelWatch() {
        return $scope.partialModel;
      }, function modelWatchAction(path) {
        if ($scope.mdIndex && $scope.partialModel) {
          var mdPath = $scope.mdIndex[$scope.partialModel.id];
          if (mdPath) {
            if (mdPath.href) {
              $scope.partialModel.mdHref = docService.getRemoteUrl(mdPath);
              var tocPath = docService.getPathInfo($location.path()).tocPath;
              if (tocPath) mdPath.href = tocPath + '/' + mdPath.href;
              var getMdIndex = docService.asyncFetchIndex(mdPath.href,
                function(result) {
                  var md = result.substr(mdPath.startLine, mdPath.endLine - mdPath.startLine + 1);
                  $scope.partialModel.mdContent = md;
                });
            }
          }
        }
      });

      // listen for toc change
      // $scope.$watch(function modelWatch() {
      //   return $scope.toc;
      // }, function modelWatchAction(toc) {
      //   if (toc && toc.content) {
      //     var info = docService.getPathInfo($location.path());
      //     if (!info.contentPath) {
      //       docService.getDefaultItem(toc.content,
      //         function(defaultItem) {
      //           if (defaultItem && defaultItem.href) {
      //             $location.url(docService.getContentUrlWithTocAndContentUrl(toc.path, defaultItem.href));
      //           }
      //         });
      //     }
      //   }
      // });

      // listen for toc change
      $scope.$watch(function modelWatch() {
        return $scope.navbar;
      }, function modelWatchAction(navbar) {
        if (!$location.path() && navbar && navbar.count > 0) {
          $location.url(navbar[0].href);
        }
      });

      /**********************************
       Initialize
       ***********************************/

      $scope.versionNumber = angular.version.full;
      $scope.version = angular.version.full + "  " + angular.version.codeName;
      $scope.loading = 0;
    }
  ]);