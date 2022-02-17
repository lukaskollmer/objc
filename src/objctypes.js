#!/usr/bin/env node

'use strict';

//
// - extends ref.types with ObjC-specific type definitions
//
// - parse ObjC type encoding strings to ref-napi compatible type definitions
//
// - create ffi.ForeignFunction wrappers for calling ObjC methods
//

// TO DO: Struct support
//
//  NSPoint '{CGPoint="x"d"y"d}'
//  NSRectPointer '{CGRect="origin"{CGPoint}"size"{CGSize}}'
//

// TO DO: ref-array-napi, ref-struct-di, ref-union-napi

// TO DO: ref-bitfield doesn't seem to have napi version

const util = require('util');

const ffi = require('ffi-napi');
const ref = require('ref-napi');

const constants = require('./constants');
const Block = require('./block');
const instance = require('./instance');
const runtime = require('./runtime');
const Selector = require('./selector');
const structs = require('./structs');
const ObjCRef = require('./objcref');
const {ns} = require('./codecs');

const pointerType = ref.refType(ref.types.void);


/******************************************************************************/
// ref-napi compatible type definitions for wrapping and unwrapping ObjC objects

//
// note: when TYPE.indirection===1, ffi.ForeignFunction calls TYPE.set/get() to convert the given data to/from C (this is counterintuitive, but ffi treats 0 as an error along with other falsy values)
//
// these atomic types ignore any `offset` argument as it should always be 0 anyway
//

const objc_class_t = {
  name: 'objc_class_t',
  size: ref.sizeof.pointer,
  alignment: ref.alignof.pointer,
  ffi_type: ffi.FFI_TYPES.pointer,
  indirection: 1, 
  get: (buffer, offset) => { // e.g. ffi.ForeignFunction calls to wrap result
    const ptr = buffer.readPointer();
    return ptr.isNull() ? null : instance.wrapClass(ptr);
  },
  set: (buffer, offset, value) => { // e.g. ffi.ForeignFunction calls to unwrap argument
    if (!instance.isWrappedObjCClass(value)) {
      throw new TypeError(`Expected an ObjC class but received ${typeof value}: ${value}`);
    }
    ref.writePointer(buffer, 0, value[instance.keyObjCObject].ptr);
  },
};


const objc_instance_t = {
  name: 'objc_instance_t',
  size: ref.sizeof.pointer,
  alignment: ref.alignof.pointer,
  ffi_type: ffi.FFI_TYPES.pointer,
  indirection: 1,
  get: (buffer, offset) => {
    const ptr = buffer.readPointer();
    return ptr.isNull() ? null : instance.wrap(ptr);
  },
  set: (buffer, offset, value) => {
    let ptr;
    // TO DO: what value types should this accept?
    if (instance.isWrappedObjCObject(value)) {
      ptr = value[instance.keyObjCObject].ptr;
    } else if (value === null) {
      ptr = ref.NULL;
    } else if (value instanceof instance.ObjCObject) {
      console.log('WARN: objc_instance_t.set received an unwrapped ObjCObject');
      ptr = value.ptr;
    } else if (value instanceof Buffer) {
      console.log('WARN: objc_instance_t.set received a raw Buffer');
      ptr = value;
    } else {
      ptr = ns(value, (value) => {
        throw new TypeError(`Expected an ObjC instance or null but received ${typeof value}: ${util.inspect(value)}`);
      }, false);
    }
    ref.writePointer(buffer, 0, ptr);
  },
};


const objc_selector_t = {
  name: 'objc_selector_t',
  size: ref.sizeof.pointer,
  alignment: ref.alignof.pointer,
  ffi_type: ffi.FFI_TYPES.pointer,
  indirection: 1,
  get: (buffer, offset) => {
    const ptr = buffer.readPointer();
    return ptr.isNull() ? null : new Selector(ptr);
  },
  set: (buffer, offset, value) => {
    let ptr;
    // TO DO: what value types should this accept?
    if (value instanceof Selector) {
      ptr = value.ptr;
    } else if (constants.isString(value)) { // TO DO: also accept string, e.g. "foo:barBaz:"?
      ptr = runtime.sel_getUid(value); // TO DO: use JS or NS selector syntax?
    } else if (value instanceof Buffer) {
      console.log('WARN: objc_selector_t.set received a raw Buffer');
      ptr = value;
    } else {
      throw new TypeError(`Expected an ObjC Selector but received ${typeof value}: ${value}`);
    }
    ref.writePointer(buffer, 0, ptr);
  },
};


const objc_unknownblock_t = { // caution: this is a pointer to an ObjC block whose actual type is unknown (blocks can't be usefully introspected from ObjC - their type is always `@?` - so their argument and return types must be manually defined or obtained via bridgesupport); thus it will accept an existing Block but currently cannot return one; TO DO: modify Block's implementation to allow argument and return types to be supplied separately, after the Block is constructed // TO DO: merge this into ./block.js (which should be named blocktype) as ObjCBlockType
  name: 'objc_unknownblock_t',
  size: ref.sizeof.pointer,
  alignment: ref.alignof.pointer,
  ffi_type: ffi.FFI_TYPES.pointer,
  indirection: 1,
  get: (buffer, offset) => {
    //const ptr = buffer.readPointer();
    //return ptr.isNull() ? null : new Block(ptr);
    throw new Error(`Can't get ObjC Block as its type is unknown.`); // TO DO: see above TODO
  },
  set: (buffer, offset, value) => {
    if (!(value instanceof Block)) {
      throw new TypeError(`Expected an ObjC Block but received ${typeof value}: ${value}`);
    }
    ref.writePointer(buffer, 0, value.ptr);
  },
};






class ObjCRefType {
  
  constructor(type) {
    this.reftype = type;
    this.size = ref.sizeof.pointer;
    this.alignment = ref.alignof.pointer;
    this.ffi_type = ffi.FFI_TYPES.pointer;
    this.indirection = 1;
  }
  
  get name() { return `${this.reftype.name || 'void'}*`; }
  
  [util.inspect.custom]() {
    return `{ObjCRefType name: '${this.name}'}`;
  }
  
  get(buffer, offset) { // TO DO: what should we do with offset?
    const value = this.reftype.get(buffer.deref(), offset, this.reftype);
    return new ObjCRef(value);
  }
  
  set(buffer, offset, value) { // TO DO: what should we do with offset?
    let ptr;
    if (value instanceof ObjCRef) {
      ptr = ref.alloc(pointerType);
      this.reftype.set(ptr, offset, value.value, this.reftype);
      // attach [copy of] ptr to ObjCRef, so that method wrapper can check if it has changed and rewrap if it has
      value.__outptr = ptr;
      value.__inptr = Buffer.from(ptr);
      value.__reftype = this.reftype;
    } else if (value === null) {
      ptr = ref.NULL; // some methods allow inout args to be nil, in which case nothing is returned
    } else if (value instanceof Buffer) { // assume user knows what they're doing // TO DO: we should probably check this for ffi_type (Q. does ref.alloc attach type to buffer?) and confirm indirection level is correct
      ptr = value;
    } else {
      throw new TypeError(`Expected an ObjCRef or null but received ${typeof value}: ${value}`);
    }
    ref.writePointer(buffer, 0, ptr);
  }
}

const objc_inout_t = new ObjCRefType(objc_instance_t);


/******************************************************************************/

// Table 6-1  Objective-C type encodings
const _objcTypeEncodings = {
  'c': ref.types.char,
  'i': ref.types.int32,
  's': ref.types.int16,
  'l': ref.types.int32, // Apple docs say: "l is treated as a 32-bit quantity on 64-bit programs."
  'q': ref.types.int64,
  'C': ref.types.uchar,
  'I': ref.types.uint32,
  'S': ref.types.uint16,
  'L': ref.types.uint32,
  'Q': ref.types.uint64,
  'f': ref.types.float,
  'd': ref.types.double,
  'B': ref.types.int8, // A C++ bool or a C99 _Bool
  'v': ref.types.void,
  '*': ref.types.CString,
  
  '#': objc_class_t, // A class object (Class)
  ':': objc_selector_t, // A method selector (SEL)

  // these are handled in parseType:
  // @              // An object (whether statically typed or typed id)
  // [array type]   // An array
  // {name=type...} // A structure
  // (name=type...) // A union
  // bnum           // A bit field of num bits
  // ^type          // A pointer to type
  
  // TO DO: how does ObjC encoding describe varargs?
  
  '?': ref.refType(ref.types.void), // An unknown type (among other things, this code is used for function pointers)
};


// Table 6-2  Objective-C method encodings
const _objcTypeQualifiers = {
  'r': 'const',
  'n': 'in',
  'N': 'inout',
  'o': 'out',
  'O': 'bycopy',
  'R': 'byref',
  'V': 'oneway',
};


const isNumber = (c) => '1234567890'.includes(c);


class ObjCTypeEncodingParser {
  encoding;
  cursor;
  
  get currentToken() { return this.encoding[this.cursor]; }
  get nextToken() { return this.encoding[this.cursor + 1]; }
  
  //
  
  parseSize() {
    let size = '';
    while (isNumber(this.currentToken)) {
      size += this.currentToken;
      this.cursor++;
    }
    if (!size) { throw new Error(`Missing bit size in: '${this.encoding}'`); }
    return parseInt(size);
  }
  
  
  parseArrayType() { // e.g. [12^f] = an array of 12 pointers to float
    const size = this.parseSize();
    const type = this.parseType();
    if (this.currentToken !== ']') { throw new Error(`Bad array encoding in: '${this.encoding}'`); }
    this.cursor++; // step over closing ']'
    return pointerType; // TO DO: temporary
  }
  
  parseStructOrUnionType(endToken) {
    /*
    Structures are specified within braces, and unions within parentheses. The structure tag is listed first, followed by an equal sign and the codes for the fields of the structure listed in sequence. For example, the structure:
    
      typedef struct example {
        id   anObject;
        char *aString;
        int  anInt;
      } Example;

      would be encoded like this:

        {example=@*i}

      The same encoding results whether the defined type name (Example) or the structure tag (example) is passed to @encode(). The encoding for a structure pointer carries the same amount of information about the structure’s fields:

        ^{example=@*i}

      However, another level of indirection removes the internal type specification:

        ^^{example}
    */
    let name = '';
    while (this.currentToken.match(/0-9A-Za-z_/)) {
      name += this.currentToken;
      this.cursor++;
    }
    if (this.currentToken === '=') {
      this.cursor++;
      const types = [];
      while (this.currentToken) {
        types.push(this.parseType());
      }
    }
    if (this.currentToken !== endToken) { 
      throw new Error(`Bad ${endToken === '}' ? 'struct' : 'union'} encoding in: '${this.encoding}'`);
    }
    this.cursor++; // step over closing '}'/')'
    return pointerType; // TO DO: temporary
  }
    
  //
   
  parseType() {
    let token, type, indirection = 0;
    while (_objcTypeQualifiers[token = this.currentToken] !== undefined) { this.cursor++; } // skip qualifiers
    while (token === '^') {
      indirection++;
      this.cursor++;
      token = this.currentToken;
    }
    type = _objcTypeEncodings[token];
    this.cursor++; // step over token
    if (!type) {
      switch (token) {
      case '@':
        if (this.currentToken === '?') { // '@?' is the encoding used for blocks
          this.cursor++;
          type = objc_block_t;
        } else if (indirection === 1) { // commonly 'o^@' argument, e.g. NSError**
          indirection--;
          type = objc_inout_t;
        } else {
          type = objc_instance_t;
        }
        if (this.currentToken === '"') { // step over class/protocol name, e.g. `@"NSString"`, `@"<NSCopying>"`
          do { this.cursor++; } while (this.currentToken !== '"');
          this.cursor++;
        }
        break;
      case '[':
        type = this.parseArrayType();
        break;
      case '{':
        type = this.parseStructOrUnionType('}');
        break;
      case '(':
        type = this.parseStructOrUnionType(')');
        break;
      case 'b':
        const size = this.parseSize();
        throw new Error("TO DO: return bitfield type");
        break;
      default:
        const token = token === undefined ? 'end of encoding' : `'${token}'`;
        throw new Error(`Bad type encoding: unexpected ${token} in '${this.encoding}'`);
      }
    }
    while (isNumber(this.currentToken)) { this.cursor++; } // skip #bits offset
    if (indirection > 0) { type = new ObjCRefType(type, indirection); }
    return type; // cursor is positioned on first character of next type (or undefined if end of encoding)
  }
  
  //

  parse(encoding, isMethod = true) {
    // encoding : string -- ObjC type encoding
    this.encoding = encoding;
    this.cursor = 0;
    this.isArgument = !isMethod; // when parsing method signature, first type is return type
    const types = [];
    while (this.currentToken) {
      types.push(this.parseType());
    }
    if (this.cursor !== this.encoding.length) { throw new Error(`Bad type encoding '${encoding}'`); }
    return types;
  }
}


const typeParser = new ObjCTypeEncodingParser();


/******************************************************************************/


const coerceObjCType = (encoding) => typeParser.parse(encoding);


const introspectMethod = (object, methodName) => {
  // object : ObjCObject -- an ObjCClass/ObjCInstance, without Proxy wrapper
  // methodName : string -- the JS-style name of an ObjC method on this object, e.g. "foo_barBaz_"
  // Result: object -- description of this method, plus an ffi.ForeignFunction object to call it
  /* 
    Examples:

      +[NSBundle bundleWithPath:] = "@24@0:8@16"
        returnType  @
        argument 0  @
        argument 1  :
        argument 2  @
        
      -[NSURL getResourceValue:forKey:error:] = "c40@0:8o^@16@24o^@32"
        returnType  c
        argument 0  @
        argument 1  :
        argument 2  o^@
    
      First 2 arguments are always target and selector
    
      optional characters before type = qualifiers
      digits after type = byte offsets, which we ignore
  */
  // look up the method so we can introspect its argument and return types
  const selectorName = Selector.selectorNameFromJS(methodName);
  const sel = runtime.sel_getUid(selectorName);
  const method = object.objcMethodPtr(sel); // do not keep method pointer; objc_msgSend will look up methods itself
  if (!method || method.isNull()) { // TO DO: do class_getClassMethod/class_getInstanceMethod always return a pointer Buffer, or can they also return null/undefined? (added DEBUG below to see)
    let msg = ''; // TO DO: smarter autosuggest (for now it only checks for a missing trailing underscore, which is the most common mistake)
    if (!selectorName.endsWith(':')) {
      const method2 = object.objcMethodPtr(runtime.sel_getUid(`${selectorName}:`));
      if (method2 && !method2.isNull()) { msg = ` (did you mean ${methodName}_?)`; }
    }
    if (!method) { console.log(`introspectMethod warning: objcMethodPtr for "${selectorName}" returned: ${method}`); } // DEBUG
    throw new TypeError(`No method named objc.${object.name}.${methodName}${msg}`);
  }
  const encoding = runtime.method_getTypeEncoding(method);
  const argTypes = typeParser.parse(encoding); // [result, target, selector,...arguments]
  const returnType = argTypes.shift();
  // TO DO: stripped down encoders for first 2 arguments, and always pass ptrs for those to msgSend
  argTypes[0] = pointerType;
  argTypes[1] = pointerType;
  let inoutIndexes = [];
  for (let [i, arg] of Object.entries(argTypes.slice(2))) {
    if (arg instanceof ObjCRefType) { inoutIndexes.push(i); }
  }
  return { // used in callObjCMethod
    //argTypes, returnType, // DEBUG
    methodName, // used in error messages
    sel, // arg 1 to msgSend
    encoding, // string // currently used in error messages, although it's not particularly user-friendly
    argc: argTypes.length, // method wrapper does its own argument count check // TO DO: needed?
    inoutIndexes: (inoutIndexes.length > 0 ? inoutIndexes : null), // used to set out values in objc.Ref arguments
    msgSend: ffi.ForeignFunction(runtime.objc_msgSend, returnType, argTypes), // eslint-disable-line new-cap
  };
}


/******************************************************************************/


module.exports = Object.assign({
  
  // aliases
  NSInteger: ref.types.int64,
  NSUInteger: ref.types.uint64,
  id: objc_instance_t,
  Class: objc_class_t,
  SEL: objc_selector_t,
  
  // ObjC types
  objc_instance_t,
  objc_class_t,
  objc_selector_t,
  objc_unknownblock_t,
  ObjCRefType, // constructor for ref-napi compatible type that packs and unpacks an objc.Ref
  
  // introspection
  coerceObjCType, // unlike ref.coerceType, which takes a single C type name and returns a single ref type object, this takes a complete ObjC encoding string describing 1 or more types and returns an Array of ref-compatible type objects
  introspectMethod, // returns an object describing the method, plus a msgSend ForeignFunction for calling it
  
  // shallow inspect this module
  [util.inspect.custom]: (depth, inspectOptions, inspect) => `{\n\t${Object.keys(module.exports).join(',\n\t')}\n}`, // TO DO: allow a custom 'detail' flag ('low'/'medium'/'high') in inspectOptions, that switches between returning '[object objctypes]', '{void,int8,uint8,etc}', or the full object representation (the standard util.inspect behavior); with 'medium' or 'low' as the default setting; see also ./runtime.js; this should cut down on unhelpful noise being displayed to users (most of whom will rarely need to use types or runtime modules), while still allowing full inspection for troubleshooting purposes
  
}, ref.types);


