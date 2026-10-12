// Parse only the small Ruby-literal subset present in the downloaded CSV.
// This avoids evaluating dataset text as JavaScript or Ruby code.
class SpecificationParser {
  constructor(source) {
    this.source = source;
    this.index = 0;
  }

  skipWhitespace() {
    while (/\s/.test(this.source[this.index] || '')) this.index += 1;
  }

  consume(expected) {
    this.skipWhitespace();
    if (!this.source.startsWith(expected, this.index)) {
      throw new Error(`Expected ${expected}`);
    }
    this.index += expected.length;
  }

  parseString() {
    this.consume('"');
    let value = '';

    while (this.index < this.source.length) {
      const character = this.source[this.index++];
      if (character === '"') return value;
      if (character !== '\\') {
        value += character;
        continue;
      }

      const escaped = this.source[this.index++];
      const simpleEscapes = {
        '"': '"',
        '\\': '\\',
        '/': '/',
        b: '\b',
        f: '\f',
        n: '\n',
        r: '\r',
        t: '\t'
      };

      if (Object.hasOwn(simpleEscapes, escaped)) {
        value += simpleEscapes[escaped];
      } else if (escaped === 'u') {
        const digits = this.source.slice(this.index, this.index + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(digits)) throw new Error('Invalid Unicode escape');
        value += String.fromCharCode(parseInt(digits, 16));
        this.index += 4;
      } else {
        throw new Error('Unsupported string escape');
      }
    }

    throw new Error('Unterminated string');
  }

  parseValue() {
    this.skipWhitespace();
    const character = this.source[this.index];

    if (character === '"') return this.parseString();
    if (character === '{') return this.parseObject();
    if (character === '[') return this.parseArray();

    const literal = this.source.slice(this.index).match(/^(nil|true|false)\b/);
    if (literal) {
      this.index += literal[0].length;
      if (literal[0] === 'nil') return null;
      return literal[0] === 'true';
    }

    throw new Error('Unsupported specification value');
  }

  parseObject() {
    this.consume('{');
    const object = {};
    this.skipWhitespace();
    if (this.source[this.index] === '}') {
      this.index += 1;
      return object;
    }

    while (this.index < this.source.length) {
      const key = this.parseValue();
      if (typeof key !== 'string') throw new Error('Specification keys must be strings');
      this.skipWhitespace();
      if (this.source.startsWith('=>', this.index)) this.index += 2;
      else this.consume(':');
      object[key] = this.parseValue();
      this.skipWhitespace();
      if (this.source[this.index] === '}') {
        this.index += 1;
        return object;
      }
      this.consume(',');
      this.skipWhitespace();
      if (this.source[this.index] === '}') {
        this.index += 1;
        return object;
      }
    }

    throw new Error('Unterminated object');
  }

  parseArray() {
    this.consume('[');
    const array = [];
    this.skipWhitespace();
    if (this.source[this.index] === ']') {
      this.index += 1;
      return array;
    }

    while (this.index < this.source.length) {
      array.push(this.parseValue());
      this.skipWhitespace();
      if (this.source[this.index] === ']') {
        this.index += 1;
        return array;
      }
      this.consume(',');
      this.skipWhitespace();
      if (this.source[this.index] === ']') {
        this.index += 1;
        return array;
      }
    }

    throw new Error('Unterminated array');
  }

  parse() {
    const value = this.parseValue();
    this.skipWhitespace();
    if (this.index !== this.source.length) throw new Error('Unexpected trailing specification data');
    return value;
  }
}

function parseProductSpecifications(source) {
  if (typeof source !== 'string' || source.trim() === '' || source.length > 1_000_000) {
    return { attributes: [], malformed: Boolean(source && source.length > 1_000_000) };
  }

  try {
    const parsed = new SpecificationParser(source).parse();
    const entries = parsed && parsed.product_specification;
    const candidates = Array.isArray(entries) ? entries : entries && typeof entries === 'object' ? [entries] : [];
    const attributes = [];
    let missingKeyValue = 0;

    for (const entry of candidates) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const key = typeof entry.key === 'string' ? entry.key.trim() : '';
      const value = typeof entry.value === 'string' ? entry.value.trim() : '';
      if (!key || !value) {
        if (key || value) missingKeyValue += 1;
        continue;
      }
      attributes.push({ key, value });
    }

    return { attributes, malformed: false, missingKeyValue };
  } catch {
    return { attributes: [], malformed: true, missingKeyValue: 0 };
  }
}

module.exports = { SpecificationParser, parseProductSpecifications };
