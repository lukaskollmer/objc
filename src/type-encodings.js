/* eslint-disable quote-props */

const ref = require('ref');
const structs = require('./structs');

// This file contains the following:
// - The `TypeEncodingParser` class, which is a simple recursive descent parser
//   for parsing an objective-c type encoding string
// - DataStructure{Primitive|Pointer|Struct|Array|Union}, describing the parsed type encoding
// Notes:
//   - The `DataStructure` classes all have a `toRefType` function, which returns
//     a type object compatible with the `ffi`, `ref` and `ref-struct` modules
//   - Currently, this is only supported for primitives, pointers and structs

const types = {
  'c': 'char',
  'i': 'int32',
  's': 'short',
  'l': 'long',
  'q': 'longlong',
  'C': 'uchar',
  'I': 'uint32',
  'S': 'ushort',
  'L': 'ulong',
  'Q': 'ulonglong',
  'f': 'float',
  'd': 'double',
  'B': 'int8',
  'v': 'void',
  '*': 'string',
  '@': 'pointer',
  '#': 'pointer',
  ':': 'pointer',
  '?': 'pointer'
};

const isNumber = arg => !isNaN(parseInt(arg, 10));

const guard = (cond, errorMessage) => {
  if (!cond) {
    throw new Error(errorMessage);
  }
};

class DataStructure {
  constructor() {
    this.isConst = false;
  }

  toRefType() {
    /* istanbul ignore next */
    throw new Error('should never reach here');
  }
}

class DataStructurePrimitive extends DataStructure {
  constructor(type) {
    super();
    this.type = type;
  }

  toRefType() {
    const type = this.type === 'string' ? 'CString' : this.type;
    const refType = ref.types[type];
    /* istanbul ignore else */
    if (refType) return refType; // eslint-disable-line curly
    /* istanbul ignore next */
    throw new Error(`Unknown type ${type}`);
  }
}

class DataStructurePointer extends DataStructurePrimitive {
  toRefType() {
    return ref.refType(this.type.toRefType());
  }
}

class DataStructureStruct extends DataStructure {
  constructor(name, fields) {
    super();
    this.name = name;
    this.fields = fields;
  }

  toRefType() {
    const StructType = structs.getStructType(this.name);
    if (StructType) {
      return StructType;
    }
    throw new Error(`Missing struct definition for '${this.name}'`);
  }

  static endDelimiter() {
    return '}';
  }
}

class DataStructureArray extends DataStructure {
  constructor(length, type) {
    super();
    this.length = length;
    this.type = type;
  }
}

class DataStructureUnion extends DataStructureStruct {
  static endDelimiter() {
    return ')';
  }
}

class TypeEncodingParser {
  get currentToken() {
    return this.encoding[this.position];
  }

  get nextToken() {
    return this.encoding[this.position + 1];
  }

  step() {
    this.position += 1;
  }

  parse(encoding) {
    this.encoding = encoding;
    this.position = 0;
    const type = this.parseType();
    guard(this.position === this.encoding.length, `Unable to parse type encoding '${encoding}'`);
    return type;
  }

  parseType() {
    switch (this.currentToken) {
      case '[': {
        const type = this.parseArray();
        guard(this.currentToken === ']');
        this.step();
        return type;
      }

      case '{':
      case '(': {
        const isUnion = this.currentToken === '(';
        const type = this.parseStructOrUnion(isUnion ? DataStructureUnion : DataStructureStruct);
        guard(this.currentToken === (isUnion ? ')' : '}'));
        this.step();
        return type;
      }

      case '^':
        return this.parsePointer();

      default: {
        let retval;

        if (this.currentToken === 'r') {
          this.step();
          const type = this.parseType();
          type.isConst = true;
          retval = type;
        } else if (this.currentToken === '@' && this.nextToken === '?') {
          // `@?` is the encoding used for blocks. We simply return a void pointer
          this.step();
          this.step();
          retval = new DataStructurePointer(new DataStructurePrimitive('void'));
        } else if (types[this.currentToken]) {
          let type;
          const primitiveType = types[this.currentToken];
          if (primitiveType === 'pointer') {
            type = new DataStructurePointer(new DataStructurePrimitive('void'));
          } else {
            type = new DataStructurePrimitive(primitiveType);
          }
          this.step();
          retval = type;
        } else {
          throw new Error(`Unexpected token ${this.currentToken}`);
        }

        // Problem: type encodings for method parameters can contain offsets
        // We can safely skip these since we don't actually need that data for creating the ref type
        while (isNumber(this.currentToken)) {
          this.step();
        }
        return retval;
      }
    }
  }

  // Array type encoding: `[LENGTH TYPE]` (without the space)
  parseArray() {
    this.step();

    let length = 0;
    let _char;
    while ((_char = this.currentToken) && isNumber(_char)) {
      length = (length * 10) + parseInt(_char, 10);
      this.step();
    }

    guard(length > 0, 'Invalid array length');

    const type = this.parseType();
    return new DataStructureArray(length, type);
  }

  // Struct type encoding: `{name=type...}`
  parseStructOrUnion(Type) {
    this.step();

    let typename = '';
    let _char;

    for (; (_char = this.currentToken) && _char !== '='; this.step()) {
      typename += _char;

      if (_char === '?' && this.nextToken === Type.endDelimiter()) {
        break;
      }
    }
    this.step();

    const fields = [];
    while (this.currentToken !== Type.endDelimiter()) {
      fields.push(this.parseType());
    }

    return new Type(typename, fields);
  }

  // Pointer type encoding: `^type`
  parsePointer() {
    this.step();
    return new DataStructurePointer(this.parseType());
  }
}

const parser = new TypeEncodingParser();

module.exports = {
  mapping: types,
  TypeEncodingParser,

  DataStructurePrimitive,
  DataStructurePointer,
  DataStructureStruct,
  DataStructureArray,
  DataStructureUnion,

  coerceType: type => {
    if (typeof type === 'string') {
      if (type === 'pointer') {
        return ref.refType(ref.types.void);
      }
      return parser.parse(type).toRefType();
    } else if (typeof type === 'object') {
      return type;
    }

    throw new TypeError(`Unable to coerce type from ${type}`);
  }
};
