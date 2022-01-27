/* eslint-disable quote-props */

const ffi = require('ffi-napi');
const ref = require('ref-napi');
const structs = require('./structs');
const runtime = require('./runtime');

// This file contains the following:
// - The `TypeEncodingParser` class, which is a simple recursive descent parser
//   for parsing an objective-c type encoding string
// - DataStructure{Primitive|Pointer|Struct|Array|Union}, describing the parsed type encoding
// Notes:
//   - The `DataStructure` classes all have a `toRefType` function, which returns
//     a type object compatible with the `ffi`, `ref` and `ref-struct` modules
//   - Currently, this is only supported for primitives, pointers and structs


// TO DO: need to check ffi's documentation to see if it's fully extensible; however, it'd make a lot more sense for ALL argument and return value conversions to be handled in ffi.ForeignFunction, instead of in the method wrapper which currently reduces ObjCObjects, Selector, Block, etc in the method's arguments list to ffi's standard C types, and then ForeignFunction does a second pass of the arguments list marshalling those and any passed-thru JS arguments that our wrapper didn't convert for the eventual C function call (thus, for example, the method wrapper converts a JS string argument to a full ObjCInstance (NSString) and then pulls the __ptr out of that, which then gets runtime-checked again by ForeignFunction to see if it's a pointer; meantime the ObjCInstance wrapper that was created is immediately discarded again); whereas if we can create a custom encoder function for '@' (let's call it 'objc_object' in ffi parlance) that can be passed to ForeignFunction() where it does the whole conversion in one, in the shortest and most efficient way possible, while also reusing all of the existing architecture that ffi provides (which I expect provides some benefit over roll-your-own); also be worth comparing PyObjC to see if it has any useful insights on type bridging (although I think PyObjC uses Python's C APIs rather than an ffi library, so probably avoids a lot of what ffi does completely)


/******************************************************************************/
// we can reduce this right down once TODOs are complete


function introspectMethod(object, selector) {
  /* 
    TO DO: what does number after each type mean? (does PyObjC source know?) e.g.:
  
      bindMethod: [ObjCClass NSBundle] "bundleWithPath:" "@24@0:8@16"
        return type {$i} '@
        argument 0 "@"
        argument 1 ":"
        argument 2 "@"
      
    TO DO: what about unknown characters? e.g.:
    
      bindMethod: [ObjCInstance NSURL] "getResourceValue:forKey:error:" "c40@0:8o^@16@24o^@32"
        return type {$i} 'c
        argument 0 "@"
        argument 1 ":"
        argument 2 "o^@"

      Error: [ObjCInstance NSURL] 'getResourceValue_forKey_error_' ('c40@0:8o^@16@24o^@32') Error: argument 2 "o^@" Error: Unexpected token 'o'

      
  */
  
  // look up the method so we can introspect its argument and return types
  const method = object.objcMethodPtr(selector);
  
  
  //console.log(`\nbindMethod: ${object} "${selector.name}" "${runtime.method_getTypeEncoding(method)}"`);


//  console.log(`introspecting '${object.rawDescription()}.${selector.tojs()}' found=${method && !method.isNull()}`)
  if (method === undefined || method.isNull()) { // TO DO: when does objcMethodPtr return undefined as opposed to NULL ptr?


    throw new Error(`No method named '${selector.name}'`);
  }

  // TO DO: would method_getTypeEncoding() be faster than using method_copyReturnType and method_copyArgumentType?
     
  const returnTypeEncoding = runtime.method_copyReturnType(method);
  //console.log(`  return type {$i} "${returnTypeEncoding}"`);
  
  // TO DO: for now, strip any out/inout/etc prefixes from ObjC type codes
  const returnType = coerceType(returnTypeEncoding.replace(/[rnNoORV]+/, '')); // get ffi type // TO DO: coerceType() discards ObjC-specific mapping info and treats all ObjC types as C types, necessitating an extra layer of type conversion code in the method wrapper below before it calls msgSend; whereas if we can pass ObjC-aware codecs to ffi.ForeignFunction(…) below, the method wrapper can call msgSend directly, simplifying this code and (hopefully) speeding up argument and return value conversions (currently the biggest performance bottleneck now that method lookups are cached)

  // this count includes the first 2 arguments (object and selector) to every ObjC method call
  const argc = runtime.method_getNumberOfArguments(method);
  
  const argumentTypeEncodings = []; // Array of ObjC type encoding strings: 2 implicit arguments (object and selector, which always have the same type BTW so we could probably skip looking those up here and just hardcode them in these arrays), and 0+ additional arguments to be explicitly passed by caller
  const argumentTypes = []; // ffi
  for (let i = 0; i < argc; i++) {
    let enc = runtime.method_copyArgumentType(method, i).replace(/[rnNoORV]+/, ''); // punishingly slow
    //console.log(`  argument ${i} "${enc}"`);
    argumentTypeEncodings.push(enc);
    try {
      argumentTypes.push(coerceType(enc)); // TO DO: ditto coerceType()
    } catch (e) {
      console.log(`ERROR: skipping unrecognized argument ${i} encoding: "${enc}" (substituting 'pointer', which is incorrect and will likely error/crash when used) ${e}`);
      argumentTypes.push(coerceType('pointer'));
    }
  }

  // this msgSend function takes object and selector and additional arguments supplied by client code, as ffi objects; 
  // TO DO: what does using ffi.ForeignFunction give us over invoking objc_msgSend directly? (I’m guessing the obvious answer is “guards against blowing up if caller passes the wrong argument types”, although since we already have to do runtime type checking and conversion ourselves that might be an unnecessary duplication of effort)
  const msgSend = ffi.ForeignFunction(runtime.objc_msgSend, returnType, argumentTypes); // eslint-disable-line new-cap

  // note: the returned object does NOT include the method pointer: objc_msgSend() will do its own (dynamic ObjC) method dispatch every time this method is called on a given object; we do, however, assume that whatever method implementation appears on a given object, it will always have the exact same signature as the one we originally introspected (which should be a safe assumption as changing an argument type from e.g. ^@ to i or a return type from @ to void would be a Very Bad Idea all round)
  return {
    selector,
    argc,
    argumentTypes: argumentTypeEncodings,
    returnType: returnTypeEncoding,
    msgSend
  };
}

/******************************************************************************/
/* Objective-C type encodings

https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/ObjCRuntimeGuide/Articles/ocrtTypeEncodings.html

Table 6-1  Objective-C type encodings

  Code  Meaning

    c   A char
    i   An int
    s   A short
    l   A long (l is treated as a 32-bit quantity on 64-bit programs)
    q   A long long
    C   An unsigned char
    I   An unsigned int
    S   An unsigned short
    L   An unsigned long
    Q   An unsigned long long
    f   A float
    d   A double
  
    B   A C++ bool or a C99 _Bool
    v   A void
  
    *   A character string (char *)
    @   An object (whether statically typed or typed id)
    #   A class object (Class)
    :   A method selector (SEL)
  
    [array type]    An array
    {name=type...}  A structure
    (name=type...)  A union
    bnum            A bit field of num bits
  
    ^type           A pointer to type
  
    ?   An unknown type (among other things, this code is used for function pointers)


These can optionally appear as prefixes to the type code:

  Table 6-2  Objective-C method encodings
  
  Code  Meaning

    r   const
    n   in
    N   inout
    o   out
    O   bycopy
    R   byref
    V   oneway

*/

/******************************************************************************/


const _objcToFFITypeEncodings = { // TO DO: replace these values with ref's C codecs and custom ObjC codes (to replace/repurpose DataStructure classes below)
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


/******************************************************************************/
// these really overlap ref in purpose without actually being interchangeable with ref's codecs

class DataStructure {
  constructor() {
    this.isConst = false;
  }

  toRefType() {
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
    if (refType) return refType; // eslint-disable-line curly
    throw new Error(`Unknown type '${type}'`);
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


/******************************************************************************/
// ObjC type encoding parser


const isNumber = arg => !isNaN(parseInt(arg, 10));

const guard = (cond, errorMessage) => {
  if (!cond) {
    throw new Error(errorMessage);
  }
};


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
        } else if (_objcToFFITypeEncodings[this.currentToken]) {
          let type;
          const primitiveType = _objcToFFITypeEncodings[this.currentToken];
          if (primitiveType === 'pointer') {
            type = new DataStructurePointer(new DataStructurePrimitive('void'));
          } else {
            type = new DataStructurePrimitive(primitiveType);
          }
          this.step();
          retval = type;
        } else {
          throw new Error(`Unexpected token '${this.currentToken}'`);
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


const coerceType = type => { // this seems like it wants to extend ffi-ref's coerceType() to handle ObjC types as well; however, it doesn't appear to call coerceType to handle and, more problematically, is throwing away ObjC-specific type information which could be used in ffi.ForeignFunction instead of having one step for mapping ObjC-specific types (in the method wrapper) and another step (ForeignFunction) for mapping C types
  if (typeof type === 'string') {
    if (type === 'pointer') {
      return ref.refType(ref.types.void);
    } else {
      return parser.parse(type).toRefType();
    }
  } else if (typeof type === 'object') {
    return type;
  } else if (structs.isStructFn(type)) {
    return type;
  }
  throw new TypeError(`Unable to coerce type from ${type}`);
};



module.exports = {
  introspectMethod,
  
  mapping: _objcToFFITypeEncodings,
  TypeEncodingParser,

  DataStructurePrimitive,
  DataStructurePointer,
  DataStructureStruct,
  DataStructureArray,
  DataStructureUnion,

  coerceType,
};
