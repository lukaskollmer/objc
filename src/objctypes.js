#!/usr/bin/env node

'use strict';

//
// - extends ref.types with ObjC-specific type definitions
//
// - parse ObjC type encoding strings to ref-napi compatible type definitions
//
// - create ffi.ForeignFunction wrappers for calling ObjC methods
//

// TO DO: ref-array-napi, ref-union-napi

// TO DO: ref-bitfield doesn't seem to have napi version


const util = require('util');

const ffi = require('ffi-napi');
const ref = require('ref-napi');

const constants = require('./constants');

const Ref = require('./reference');
const Selector = require('./selector');
const objcblock = require('./block');
const objcstruct = require('./struct');

const instance = require('./instance');
const runtime = require('./runtime');
const codecs = require('./codecs');


const pointerType = ref.refType(ref.types.void);


/******************************************************************************/
// ref-napi compatible type definitions for wrapping and unwrapping ObjC objects
//
// (these should be fully interchangeable with ref-napi's ref.types.TYPE objects)
//
// Important: `Class` and `id` types are themselves *always* pointers to an ObjC structure, e.g. `NSString*` is a sub-type of `id`. There is no way to allocate an ObjC class instance directly on the stack, as can be done with C++. Therefore a `ref.refType(TYPE)` call should only be applied when creating a pointer to that pointer, e.g. `NSError**`, and even then it is normally more convenient (and robust) to use objc's `Ref` instead.
//
//
// note: when TYPE.indirection===1, ffi.ForeignFunction calls TYPE.set/get() to convert the given data to/from C (this is counterintuitive, but ffi treats 0 as an error along with other falsy values)
//


const objc_class_t = {
  name: 'objc_class_t',
  size: ref.sizeof.pointer,
  alignment: ref.alignof.pointer,
  ffi_type: ffi.FFI_TYPES.pointer,
  indirection: 1, 
  get: (buffer, offset) => { // e.g. ffi.ForeignFunction calls to wrap result
    const ptr = ref.readPointer(buffer, offset || 0);
    return ptr.isNull() ? null : instance.wrapClass(ptr);
  },
  set: (buffer, offset, value) => { // e.g. ffi.ForeignFunction calls to unwrap argument
    if (!instance.isWrappedObjCClass(value)) {
      throw new TypeError(`Expected an ObjC class but received ${typeof value}: ${value}`);
    }
    ref.writePointer(buffer, offset || 0, value[instance.keyObjCObject].ptr);
  },
};


const objc_instance_t = {
  name: 'objc_instance_t',
  size: ref.sizeof.pointer,
  alignment: ref.alignof.pointer,
  ffi_type: ffi.FFI_TYPES.pointer,
  indirection: 1,
  get: (buffer, offset) => {
    const ptr = ref.readPointer(buffer, offset || 0);
    return ptr.isNull() ? null : instance.wrap(ptr);
  },
  set: (buffer, offset, value) => {
    let ptr;
    if (instance.isWrappedObjCObject(value)) {
      ptr = value[instance.keyObjCObject].ptr;
    } else if (value === null) {
      ptr = ref.NULL;
    } else if (value instanceof instance.ObjCObject) { // this probably should never happen
      console.log('WARN: objc_instance_t.set received an unwrapped ObjCObject'); // DEBUG
      ptr = value.ptr;
    } else if (value instanceof Buffer) { // for users who like to live dangerously; it's up to user to pass a valid Buffer containing a non-NULL pointer to an ObjC instance (passing a Buffer to anything else is liable to cause data corruption/crashes)
      console.log('WARN: objc_instance_t.set received a raw Buffer'); // DEBUG
      ptr = value;
    } else {
      ptr = codecs.ns(value, (value) => {
        throw new TypeError(`Expected an ObjC instance or null but received ${typeof value}: ${util.inspect(value)}`);
      }, true);
    }
    ref.writePointer(buffer, offset || 0, ptr);
  },
};


const objc_selector_t = {
  name: 'objc_selector_t',
  size: ref.sizeof.pointer,
  alignment: ref.alignof.pointer,
  ffi_type: ffi.FFI_TYPES.pointer,
  indirection: 1,
  get: (buffer, offset) => {
    const ptr = ref.readPointer(buffer, offset || 0);
    return ptr.isNull() ? null : new Selector(ptr);
  },
  set: (buffer, offset, value) => {
    let ptr;
    if (value instanceof Selector) {
      ptr = value.ptr;
    } else if (constants.isString(value)) { // also accept ObjC-style name string, e.g. "foo:barBaz:"
      ptr = runtime.sel_getUid(value);
    } else if (value instanceof Buffer) {
      console.log('WARN: objc_selector_t.set received a raw Buffer'); // DEBUG
      ptr = value;
    } else {
      throw new TypeError(`Expected an ObjC Selector but received ${typeof value}: ${value}`);
    }
    ref.writePointer(buffer, offset || 0, ptr);
  },
};


const objc_opaqueblock_t = { // TO DO: move this to ./block.js?
  name: 'objc_opaqueblock_t',
  size: ref.sizeof.pointer,
  alignment: ref.alignof.pointer,
  ffi_type: ffi.FFI_TYPES.pointer,
  indirection: 1,
  get: (buffer, offset) => {
    const ptr = ref.readPointer(buffer, offset || 0);
    return ptr.isNull() ? null : new objcblock.Block(objc_opaqueblock_t, ptr); // opaque Block; not currently callable from within JS, but at least it can pass through JS back to ObjC
  },
  set: (buffer, offset, value) => {
    if (!(value instanceof objcblock.Block)) {
      throw new TypeError(`Expected ObjC Block but received ${typeof value}: ${value}`);
    }
    ref.writePointer(buffer, offset || 0, value.ptr);
  },
};


class ObjCRefType {
  // a ref-napi compatible type definition for an objc.Ref pointer object
  //
  // Note: whereas ref-napi constructs a pointer value using:
  // 
  //  const ptr = ref.alloc(TYPE[,VALUE]).ref()
  //
  // objc uses:
  //
  //  const ptr = new objc.Ref([VALUE])
  //
  // This does not require a ref-napi type definition to construct it; instead, the Ref's type - an instance of ObjCRefType - is created and attached to it when it is passed as an argument to/returned as a result from an ObjC method.
  //
  // (While a ref-napi pointer value can also be created and passed to an ObjC method, it is up to the user to ensure it is of the correct type; the objc bridge cannot check it and the ObjC runtime will crash if it is not.)
  
  
  // TO DO: get/set methods' fragile (dynamic) `this` bindings below assumes that ffi/ref will never bind a type object's get/set functions to variables to be called later, but will always call them directly on body of type object, i.e. `TYPE.get(...)`, never `const f = TYPE.get; f(...)`; however, most ref-napi types are plain old objects containing unbound functions, which does allow such usage; therefore, it'd be safest to avoid using `this` in these methods
  
  constructor(type) {
    // type : object -- a ref-napi compatible type definition, most often `objc_instance_t` (e.g. when constructing `NSError**` out arguments) though can be any ref-napi compatible type object
    this.reftype = type;
    this.size = ref.sizeof.pointer;
    this.alignment = ref.alignof.pointer;
    this.ffi_type = ffi.FFI_TYPES.pointer;
    this.indirection = 1;
  }
  
  get name() { return `${this.reftype.objcName || this.reftype.name || 'void'}*`; } // TO DO: is this appropriate syntax? (it is not the syntax used by ObjC encoding strings, but ref.types.TYPE.name); TO DO: should we standardize on `objcName` for our own preferred names (e.g. 'CGPoint')
  
  [util.inspect.custom]() {
    return `[objc Ref(${this.reftype.objcName || this.reftype.name || 'void'})]`;
  }
  
  get(buffer, offset) { // e.g. -[NSAppleEventDescriptor aeDesc] returns `^{AEDesc}`, i.e. a pointer to an AEDesc struct
    //console.log('RefType.get: ', buffer)
    const data = buffer.readPointer(offset, this.reftype.size); // the thing being pointed at, e.g. AEDesc struct
    const value = this.reftype.get(data, 0, this.reftype);
    // Ref is used purely as a wrapper; the value in it has already been unpacked // TO DO: should Ref unpack lazily? when does ref-napi's pointer unpack, when returned as function's result? if so, wrap the pointer Buffer in Ref here and update Ref's implementation to unpack it the first/every(?) time Ref.deref() is called
    return new Ref(value);
  }
  
  set(buffer, offset, value) {
  //console.log('PACK REF',value)
    let ptr;
    if (value instanceof Ref) {
      ptr = ref.alloc(pointerType);
      this.reftype.set(ptr, offset, value.value, this.reftype);
      // attach [copy of] ptr to Ref, so that method wrapper can check if it has changed and rewrap if it has
      value.__outptr = ptr;
      value.__inptr = Buffer.from(ptr);
      value.__reftype = this.reftype;
    } else if (value === null) {
      ptr = ref.NULL; // some methods allow inout args to be nil, in which case nothing is returned
    } else if (value instanceof Buffer) {
      ptr = value;
    } else {
      throw new TypeError(`Expected a Ref or null but received ${typeof value}: ${value}`);
    }
    ref.writePointer(buffer, offset || 0, ptr);
  }
}


const objc_inout_t = new ObjCRefType(objc_instance_t); // most commonly used ObjC pointer type, `id*` (e.g. `NSError**`)


/******************************************************************************/
// ObjC type encodings
//
// from: https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/ObjCRuntimeGuide

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
  'B': ref.types.bool, // A C++ bool or a C99 _Bool
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
  
  // TO DO: how does an ObjC encoding string describe varargs?
  
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


const DIGITS = '1234567890';
const ALPHA_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ALPHA_LOWER = 'abcdefghijklmnopqrstuvwxyz';

const IDENTIFIER_FIRST = ALPHA_UPPER + ALPHA_LOWER + '_';
const IDENTIFIER_REST = IDENTIFIER_FIRST + DIGITS;



class ObjCTypeEncodingParser {
  encoding;
  cursor;
  
  get currentToken() { return this.encoding[this.cursor]; }
  get nextToken() { return this.encoding[this.cursor + 1]; }
  
  // read... methods consume a portion of the encoding string starting at current token
  
  readSize() {
    let size = '';
    while (DIGITS.includes(this.currentToken)) {
      size += this.currentToken;
      this.cursor++;
    }
    if (!size) { throw new Error(`Missing bit size in: '${this.encoding}'`); }
    return parseInt(size);
  }
  
  readName() {
    let token, name = this.currentToken;
    if (!IDENTIFIER_FIRST.includes(name)) { throw new Error(`Bad identifier in: '${this.encoding}'`); }
    this.cursor++;
    while ((token = this.currentToken) && IDENTIFIER_REST.includes(token)) {
      name += token;
      this.cursor++;
    }
    return name;
  }
  
  readQuotedName() {
    this.cursor++; // step over opening '"'
    const name = this.readName();
    if (this.currentToken !== '"') {
      throw new Error(`Bad quoted name; expected '"', got '${this.currentToken}' at character ${this.cursor} in: '${this.encoding}'`);
    }
    this.cursor++; // step over closing '"'
    return name;
  }
  
  readArrayType() { // e.g. [12^f] = an array of 12 pointers to float
    const size = this.readSize();
    const type = this.readType();
    if (this.currentToken !== ']') { throw new Error(`Bad array encoding in: '${this.encoding}'`); }
    this.cursor++; // step over closing ']'
    // TO DO: use ref-napi-array to create new [ObjC]ArrayType
    return pointerType; // TO DO: temporary
  }
  
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
  readStructType() {
    // parses an ObjC struct encoding, e.g. '{CGRect="origin"{CGPoint}"size"{CGSize}}'
    
    // IMPORTANT: this method not only parses the encoding string, it also gets and sets the StructType cache in objcstruct; this allows it to handle recursive definitions and to look up name-only encodings, e.g. parsing `{CGSize}` will return the type definition for `CGSize`
    
    let type;
    const startIndex = this.cursor - 1; // caller already stepped over '{'
    const name = this.readName(); // type name is required (without it, the encoding would be ambiguous, e.g. `{Bi}`)
    if (this.currentToken === '=') {
      this.cursor++; // step over '='
      type = objcstruct.ObjCStructType(); // note: ref-struct-di's StructType does not use `new` keyword to instantiate // eslint-disable-line new-cap
      type.objcName = name; // note: StructType's `name` is read-only
      let count = 0;
      while (this.currentToken && this.currentToken !== '}') {
        let propertyName = null;
        if (this.currentToken === '"') { // member name
          propertyName = this.readQuotedName();
        }
          //console.log(`${name}: read quoted name: '${propertyName}'`)
        const propertyType = this.readType();
        type.defineProperty(propertyName ?? `\$${count}`, propertyType); // if no name given, use `$0`, `$1`, etc; TO DO: don't much like this; either put indexed accessors on all structs so fields can be accessed as `struct[0]`, and add named accessors when field names are known; or treat struct instances as opaque unless the full struct type is be defined in advance
        count++;
      }
      if (this.currentToken !== '}') { 
        throw new Error(`Bad struct encoding: expected '}', got '${this.currentToken}' in '${this.encoding}'`);
      }
      this.cursor++; // step over closing '}'/')'
      
      const structEncoding = this.encoding.slice(startIndex, this.cursor);
      const existingType = objcstruct.getStructTypeByName(name);
      
      // it is possible for an ObjC struct type to be defined more than once, and with different levels of detail depending on where that definition appears; therefore we need to merge these multiple definitions into one, containing as much detail as possible
      if (!existingType || existingType.objcEncoding.length < structEncoding) { // kludge; e.g. 'substringWithRange:' has encoding '@32@0:8{_NSRange=QQ}16', which is not full _NSRange encoding as it lacks property names; TO DO: using encoding string length is not reliable (e.g. byte offsets may be omitted); better to parse this new encoding string and update existingType with any additional info
      
        type.objcEncoding = structEncoding;
        objcstruct.addStructType(type); // add this new StructType to objcstruct's cache // TO DO: might be safer to merge this type object into the cached object instead of replacing it
      
      } else { // there's already a full encoding
        objcstruct.aliasStructType(existingType, structEncoding);
        type = existingType;
      }
      
    } else if (this.currentToken === '}') { // name-only struct `{NAME}`; note: while name-only encodings are useless for creating a new ObjCStructType, they can appear in other types' encoding strings; for now, a struct type must be fully defined before it can be referenced by another encoding // TO DO: need to support out-of-order definitions as, unlike C header files, bridgesupport files are not guaranteed to define types in order of dependency
      this.cursor++; // step over closing '}'/')'
      type = objcstruct.getStructTypeByName(name);
      if (!type) { throw new Error(`Struct encoding referenced undefined '${name}' struct type: '${this.encoding}'`); }
    } else {
      throw new Error(`Bad struct encoding: expected '}', got '${this.currentToken}' in '${this.encoding}'`);
    }
  //    console.log(`parsed: '${type.objcEncoding}'`)
    return type;
  }
  
  /*
  
  */
  readUnionType() {
    throw new Error('TO DO: readUnionType');
  }
  
  //
   
  readType() {
    let token, type, indirection = 0;
    while (_objcTypeQualifiers[(token = this.currentToken)] !== undefined) { this.cursor++; } // skip qualifiers
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
          type = objc_opaqueblock_t;
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
        type = this.readArrayType();
        break;
      case '{':
        type = this.readStructType();
        break;
      case '(':
        type = this.readUnionType();
        break;
      case 'b':
        const size = this.readSize();
        throw new Error("TO DO: return bitfield type");
        break;
      default:
        token = (token === undefined) ? 'end of string' : `'${token}'`;
        throw new Error(`Bad type encoding: unexpected ${token} at character ${this.cursor} in '${this.encoding}'`);
      }
    }
    while ('1234567890'.includes(this.currentToken)) { this.cursor++; } // skip #bits offset
    if (indirection > 0) { type = new ObjCRefType(type, indirection); }
    return type; // cursor is positioned on first character of next type (or undefined if end of encoding)
  }
  
  // public API: parse methods consume a complete encoding string and return a type object or array of type objects

  parseType(encoding) {
    // parse a single ObjC type encoding
    // encoding : string -- an ObjC type encoding string, e.g. "o^@"
    // Result: object -- a ref-napi compatible type definition, suitable for use in ffi-napi
    // e.g. .bridgesupport files normally define each argument/member separately so use parseType() for those
    this.encoding = encoding;
    this.cursor = 0;
    let type = this.readType();
    if (this.cursor !== this.encoding.length) { throw new Error(`Bad type encoding '${encoding}'`); }
    return type;
  }

  parseTypeArray(encoding) {
    // parse a sequence of one or more ObjC type encodings; typically a method, struct, or block’s type
    // encoding : string -- an ObjC type encoding string, e.g. "@:@io^@"
    // Result: [object,...] -- one or more ref-napi compatible type definitions, suitable for use in ffi-napi // TO DO: should result be [returnType,[argType,...]]? this is what ffi APIs expect and it'd save caller having to shift the return type off the Array
    // e.g. method signatures obtained via ObjC's introspection APIs
    this.encoding = encoding;
    this.cursor = 0;
    const types = [];
    do {
      types.push(this.readType());
    } while (this.currentToken);
    return types;
  }
}



/******************************************************************************/


const coerceObjCType = (encoding) => new ObjCTypeEncodingParser().parseTypeArray(encoding);


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
    let msg = ''; // TO DO: a smarter autosuggest would be nice to have (for now it only checks for a missing trailing underscore, which is the most common mistake)
    if (!selectorName.endsWith(':')) {
      const method2 = object.objcMethodPtr(runtime.sel_getUid(`${selectorName}:`));
      if (method2 && !method2.isNull()) { msg = ` (did you mean ${methodName}_?)`; }
    }
    if (!method) { console.log(`introspectMethod warning: objcMethodPtr for "${selectorName}" returned: ${method}`); } // DEBUG
    throw new TypeError(`No method named objc.${object.name}.${methodName}${msg}`);
  }
  const encoding = runtime.method_getTypeEncoding(method);
  const argTypes = new ObjCTypeEncodingParser().parseTypeArray(encoding); // [result, target, selector,...arguments]
  const returnType = argTypes.shift();
  // first 2 args are always target and selector, which method wrapper already passes as pointers
  argTypes[0] = pointerType;
  argTypes[1] = pointerType;
  let inoutIndexes = [];
  for (let [i, arg] of Object.entries(argTypes.slice(2))) {
    if (arg instanceof ObjCRefType) { inoutIndexes.push(i); }
  }
  return { // used in callObjCMethod
    methodName, // used in error messages
    sel, // ptr -- arg 1 to msgSend
    encoding, // string // currently used in error messages, although it's not particularly user-friendly
    argc: argTypes.length, // method wrapper does its own argument count check
    inoutIndexes: (inoutIndexes.length > 0 ? inoutIndexes : null), // used to set values in objc.Ref `[in]out` arguments
    msgSend: ffi.ForeignFunction(runtime.objc_msgSend, returnType, argTypes), // eslint-disable-line new-cap
  };
}


/******************************************************************************/

// DEBUG: performance test
let _totaltime = process.hrtime.bigint();
let _zero = _totaltime - _totaltime;
_totaltime = _zero;



Object.assign(module.exports, ref.types, {
  
  ObjCTypeEncodingParser,
  
  // DEBUG: performance test
  reset: () => _totaltime = _zero,
  totaltime: () => _totaltime,
  
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
  objc_opaqueblock_t,
  ObjCRefType, // constructor for ref-napi compatible type that packs and unpacks an objc.Ref
  
  // introspection
  coerceObjCType, // unlike ref.coerceType, which takes a single C type name and returns a single ref type object, this takes a complete ObjC encoding string describing 1 or more types and returns an Array of ref-compatible type objects
  introspectMethod, // returns an object describing the method, plus a msgSend ForeignFunction for calling it
  
  // shallow inspect this module
  [util.inspect.custom]: (depth, inspectOptions, inspect) => `{\n\t${Object.keys(module.exports).join(',\n\t')}\n}`, // TO DO: allow a custom 'detail' flag ('low'/'medium'/'high') in inspectOptions, that switches between returning '[object objctypes]', '{void,int8,uint8,etc}', or the full object representation (the standard util.inspect behavior); with 'medium' or 'low' as the default setting; see also ./runtime.js; this should cut down on unhelpful noise being displayed to users (most of whom will rarely need to use types or runtime modules), while still allowing full inspection for troubleshooting purposes
  
});



// DEBUG: performance test (this should log how much time is spent inside ref.types' get/set functions; with caveat that any calls back into the plumbing will be included in the total, which is not ideal as we're trying to distinguish time taken by code within get/set from time spent in the infrastructure underneath)
var _depth = 0;

function timer(fn) {
  return (...args) => {
    let res;
    if (!_depth) {
      _totaltime -= process.hrtime.bigint();
    }
      _depth++;
    try {
      res = fn(...args);
    } finally {
      _depth--;
    }
    if (!_depth) {
      _totaltime += process.hrtime.bigint();
    }
    return res;
  }
}

for (let k in module.exports) {
  const v = module.exports[k];
  if (v && v.indirection !== undefined) {
    module.exports[k].get = timer(v.get);
    module.exports[k].set = timer(v.set);
  }
}


