/* eslint-disable camelcase, key-spacing */

// wraps a JS function as an ObjC block so it can be called from ObjC // TO DO: there is some overlap between this and create-class.js, so perhaps opportunities to consolidate?

const constants = require('./constants');
const ffi = require('ffi-napi');
const structs = require('./structs');
const {pointer, int32, ulonglong} = require('./types');
const runtime = require('./runtime');
const {coerceType} = require('./type-encodings');

const _NSConcreteGlobalBlock = runtime.getSymbol('_NSConcreteGlobalBlock');


// an ObjC block

const block_t = structs.defineStruct(null, {
  isa:        pointer,
  flags:      int32,
  reserved:   int32,
  invoke:     pointer,
  descriptor: pointer
});

const descriptor = structs.defineStruct(null, {
  reserved:   ulonglong,
  block_size: ulonglong
}).new(0, block_t.size);



class Block {
  constructor(fn, returnType, argumentTypes, skipBlockArgument = true) {
    if (typeof fn !== 'function' || returnType === undefined || argumentTypes === undefined) {
      throw new TypeError('The objc.Block constructor expects a function');
    }

    this.fn = fn;
    this.returnType = coerceType(returnType);
    this.argumentTypes = argumentTypes;

    this.skipBlockArgument = skipBlockArgument;

    if (skipBlockArgument) {
      this.argumentTypes.splice(0, 0, '@'); // 1st argument is the block itself
    }
    this.argumentTypes = this.argumentTypes.map(type => coerceType(type));
  }

  makeBlock() {
    return block_t.new(structs.CompoundInit, {
      isa:        _NSConcreteGlobalBlock,
      flags:      1 << 29,
      reserved:   0,
      invoke:     this.getFunctionPointer(),
      descriptor: descriptor.ref()
    }).ref();
  }

  getFunctionPointer() {
    const self = this;
    const callback = ffi.Callback(this.returnType, this.argumentTypes, function () { // eslint-disable-line new-cap
      // Call the block implementation, skipping the 1st parameter (the block itself)
      const retval = self.fn.apply(null, Array.from(arguments).slice(self.skipBlockArgument ? 1 : 0));
      
      // seems like another case of - let's add our own ObjC-specific codecs to ffi.ref's, and let Callback's returnType make the appropriate conversions
      if (retval === undefined || retval === null) { // in this case, if callback function [carelessly] returns an `undefined` result, we can treat that as equivalent to returning null, either of which ObjC can treat as a `nil`
        return null;
      } else {
        // Return the return value, unwrapping potential instance proxies
        let obj = retval[constants.__objcObject];
        return obj === undefined ? retval : obj.__ptr;
      }
    });

    return callback;
  }
}

module.exports = Block;
