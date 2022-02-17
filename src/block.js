/* eslint-disable camelcase, key-spacing */

// wraps a JS function as an ObjC block so it can be called from ObjC // TO DO: there is some overlap between this and create-class.js, so perhaps opportunities to consolidate?

// TO DO: what about ObjC properties/methods that return an ObjC block? (the block will appear as a pointer of type `@?`, but won't be mappable to BlockType, which is JS->NS only; for now, the objc_block_t)

const ffi = require('ffi-napi');
const ref = require('ref-napi');

const constants = require('./constants');
const structs = require('./structs');
const runtime = require('./runtime');

const pointerType = ref.refType(ref.types.void);

let _coerceObjCType = null;

const _NSConcreteGlobalBlock = runtime.getSymbol('_NSConcreteGlobalBlock');


/******************************************************************************/

// an ObjC block

const block_t = structs.defineStruct(null, {
  isa:        pointerType,
  flags:      ref.types.int32,
  reserved:   ref.types.int32,
  invoke:     pointerType,
  descriptor: pointerType
});

const descriptor = structs.defineStruct(null, {
  reserved:   ref.types.ulonglong,
  block_size: ref.types.ulonglong
}).new(0, block_t.size);



class BlockType {
  
  // TO DO: for readability, take encoding as first argument, followed by fn
  constructor(fn, encoding, skipBlockArgument = true) { // TO DO: also accept Array of objctypes for encoding?
    if (typeof fn !== 'function') { 
      throw new TypeError(`objc.Block constructor expected a function but received ${typeof fn}: ${fn}`); 
    }
    if (!constants.isString(encoding)) {
      throw new TypeError(`objc.Block constructor expected an encoding string but received ${typeof encoding}: ${encoding}`);
    }
    if (_coerceObjCType === null) { _coerceObjCType = require('./objctypes').coerceObjCType; }
    this.fn = fn;
    const type = _coerceObjCType(encoding);
    this.returnType = type.shift();
    this.argumentTypes = type;
    if (skipBlockArgument) {
      this.argumentTypes.insert(0, pointerType);
    } else {
      this.argumentTypes[0] = pointerType;
    }
    this.skipBlockArgument = skipBlockArgument; // TO DO: use function.length to determine number of named parameters to fn; if this is 1 less than no of arguments in encoding, don't pass the block as first argument to callback (be aware that fn.length doesn't count named parameters that have a default value, nor ...rest; however, that'd only be an issue if user was recycling an existing function written for non-ObjC related code; in general, functions passed here will be written specifically for use in blocks)
  }

  makeBlock() {
    return block_t.new(structs.CompoundInit, {
      isa:        _NSConcreteGlobalBlock,
      flags:      1 << 29,
      reserved:   0,
      invoke:     this.ptr,
      descriptor: descriptor.ref()
    }).ref();
  }
  
  get ptr() {
    const self = this;
    const callback = ffi.Callback(this.returnType, this.argumentTypes, function () { // eslint-disable-line new-cap
      // Call the block implementation, skipping the 1st parameter (the block itself)
      const retval = self.fn.apply(null, Array.from(arguments).slice(self.skipBlockArgument ? 1 : 0));
      
      // TO DO: as with ObjC methods, any inout args need additional processing, although this time it works in reverse, with the function updating the Ref.value
      
      return retval;
    });

    return callback;
  }
}

module.exports = BlockType;
