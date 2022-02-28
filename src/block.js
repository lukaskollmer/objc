/* eslint-disable camelcase, key-spacing */

// wraps a JS function as an ObjC block so it can be called from ObjC // TO DO: there is some overlap between this and create-class.js, so perhaps opportunities to consolidate?

// TO DO: what about ObjC properties/methods that return an ObjC block? (the block will appear as a pointer of type `@?`, but won't be mappable to ObjCBlockType, which is JS->NS only; for now, the objc_block_t)


// TO DO: should ObjCBlockType, StructType appear behind `objc.types.Proxy(...)`, allowing them to be looked up by name once defined via `defineBlock(encoding, [name])`/`defineStruct(encoding, [name])`

/*

  Example block type declaration from Foundation.bridgesupport (note that this splits up block's encoding, which is "v@Qo^B"):

  <method selector='enumerateObjectsWithOptions:usingBlock:'>
    
    <arg function_pointer='true' index='1' type64='@?'>
      <arg type64='@'/>
      <arg type64='Q'/>
      <arg type64='^B' type_modifier='o'/>
      <retval type64='v'/>
    </arg>
    
  </method>

*/

const ffi = require('ffi-napi');
const ref = require('ref-napi');
const StructType = require('ref-struct-di')(ref);

const constants = require('./constants');
const runtime = require('./runtime');

const pointerType = ref.refType(ref.types.void);

let _coerceObjCType = null;

const _NSConcreteGlobalBlock = runtime.getSymbol('_NSConcreteGlobalBlock');


/******************************************************************************/

// an ObjC block

const block_t = StructType({ // note: StructType does not use `new`
  isa:        pointerType,
  flags:      ref.types.int32,
  reserved:   ref.types.int32,
  invoke:     pointerType,
  descriptor: pointerType
});

const descriptor_t = StructType({
  reserved:   ref.types.ulonglong,
  block_size: ref.types.ulonglong
});

const descriptor = new descriptor_t(0, block_t.size);



class ObjCBlockType { // caution: as with ObjCClass, users should not instantiate ObjCBlockType directly
  
  constructor(encoding) {
    // encoding : string -- ObjC encoding string
    // important: the encoding must include argument 0, which is the block itself, although the Block function can omit it if not needed (which it usually isn't)
    this.encoding = encoding;
    if (_coerceObjCType === null) { _coerceObjCType = require('./objctypes').coerceObjCType; }
    this.argumentTypes = _coerceObjCType(encoding);
    this.returnType = this.argumentTypes.shift();
    this.argumentTypes[0] = pointerType; // in general we don't want to autobox the block ptr
    this.size = ref.sizeof.pointer;
    this.alignment = ref.alignof.pointer;
    this.ffi_type = ffi.FFI_TYPES.pointer;
    this.indirection = 1;
    // TO DO: if we want users to create new Block instances using `new BLOCKTYPE(fn)`, we will need to return its constructor function here
  }
  
  get(buffer, offset, type) {
    throw new Error('TO DO: ObjCBlockType.get');
    // TO DO: is this correct? no
    //const ptr = buffer.readPointer();
    //return ptr.isNull() ? null : new Block(this, ffi.ForeignFunction(ptr, this.returnType, this.argumentTypes));
  }
  
  set(buffer, offset, value, type) {
    let ptr;
    if (value instanceof Block) {
      // TO DO: check block type
      ptr = value.ptr;
    } else if (typeof value === 'function') {
      ptr = new Block(this, value).ptr;
    } else if (value instanceof Buffer) {
      ptr = value;
    } else {
      throw new TypeError(`Expected an ObjC Block, got ${typeof value}: ${value}`);
    }
    ref.writePointer(buffer, 0, ptr);
  }
  
  newBlock(fn) { // TO DO: not a fan of this; `new objc.types.BLOCKTYPE(...)` would be canonical
    return new Block(this, fn);
  }
}


const _blockTypes = {}; // cache


const getBlockType = (encoding) => { // similar to getClassByName, this looks up ObjCBlockType by encoding string, creating and caching a new ObjCBlockType object if it doesn't already exist
  if (!constants.isString(encoding)) {
    throw new Error(`getBlockType expected an encoding string, got ${typeof encoding}: ${encoding}`);
  }
  let type = _blockTypes[encoding];
  if (!type) {
    type = new ObjCBlockType(encoding);
    _blockTypes[encoding] = type;
  }
  return type;
};




class Block {
  #type;
  #fn;
  #callback;
  #ptr;
  
  constructor(type, fn) {
    if (typeof fn !== 'function') { 
      throw new TypeError(`objc.Block expected a function, got ${typeof fn}: ${fn}`); 
    }
    type = type instanceof ObjCBlockType ? type : getBlockType(type);
    // use function.length to determine number of named parameters to fn; if this is 1 less than no of arguments in encoding, don't pass the block as first argument to callback (be aware that fn.length doesn't count named parameters that have a default value, nor ...rest; however, that'd only be an issue if user was recycling an existing function written for non-ObjC related code; in general, functions passed here will be written specifically for use in blocks)
    let skipBlockArgument;
    if (fn.length === type.argumentTypes.length) {
      skipBlockArgument = false;
    } else if (fn.length === type.argumentTypes.length - 1) {
      skipBlockArgument = true;
    } else {
      throw new TypeError(`objc.Block expected a function with ${type.argumentTypes.length} parameters, got ${fn.length}`); 
    }
    const callback = ffi.Callback(type.returnType, type.argumentTypes, function(blockPtr, ...args) { // eslint-disable-line new-cap
      // Call the block implementation, by default skipping the 1st parameter (the block itself)
      const retval = fn.apply(null, skipBlockArgument ? args : [blockPtr, ...args]);
      
      // TO DO: as with ObjC methods, any inout args need additional processing, although this time it works in reverse, updating Ref.__ptr with the new (packed) Ref.value
      
      return retval;
    });
    this.#fn = fn;
    this.#type = type;
    this.#callback = callback;
    this.#ptr = new block_t({ // TO DO: no idea if this is correct
        isa:        _NSConcreteGlobalBlock,
        flags:      1 << 29,
        reserved:   0,
        invoke:     callback,
        descriptor: descriptor.ref()
    }).ref();
  }
    
  get type() { return this.#type; }
  get fn()   { return this.#fn; } // we could make Block directly callable
  get ptr()  { return this.#ptr; }
  
  
}

module.exports = {
  getBlockType, // returns a ObjCBlockType for given encoding; e.g. getBlockType(enc).newBlock(fn) -> Block
  ObjCBlockType, // for typechecking only
  Block, // for typechecking only
};
