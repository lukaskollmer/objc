const ffi = require('ffi');
const struct = require('ref-struct');
const runtime = require('./runtime');
const {typeEncodingToRefType} = require('./type-encodings');

// eslint-disable-next-line camelcase
const __block_literal = struct({
  isa: 'pointer',
  flags: 'int32',
  reserved: 'int32',
  invoke: 'pointer',
  descriptor: 'pointer'
});

// eslint-disable-next-line camelcase, no-unused-vars
const __block_descriptor = struct({
  reserved: 'ulonglong',
  Block_size: 'ulonglong' // eslint-disable-line camelcase
});

const descriptor = new __block_descriptor();
descriptor.reserved = 0;
descriptor.Block_size = __block_literal.size; // eslint-disable-line camelcase

class Block {
  constructor(fn, returnType, argumentTypes, skipBlockArgument = true) {
    if (typeof fn !== 'function' || typeof returnType !== 'string' || argumentTypes === undefined) {
      throw new TypeError('Invalid arguments passed to Block constructor');
    }

    this.fn = fn;
    this.returnType = typeEncodingToRefType(returnType);
    this.argumentTypes = argumentTypes;

    this.skipBlockArgument = skipBlockArgument;

    if (skipBlockArgument) {
      this.argumentTypes.splice(0, 0, '@'); // 1st argument is the block itself
    }
    this.argumentTypes = this.argumentTypes.map(type => typeEncodingToRefType(type));
  }

  makeBlock() {
    const block = new __block_literal();

    block.isa = runtime.getSymbol('_NSConcreteGlobalBlock');
    block.flags = 1 << 29;
    block.reserved = 0;
    block.invoke = this.getFunctionPointer();
    block.descriptor = descriptor.ref();

    return block.ref();
  }

  getFunctionPointer() {
    const self = this;
    const callback = ffi.Callback(this.returnType, this.argumentTypes, function () { // eslint-disable-line new-cap
      // Call the block implementation, skipping the 1st parameter (the block itself)
      const retval = self.fn.apply(null, Array.from(arguments).slice(self.skipBlockArgument ? 1 : 0));

      if (retval === undefined) {
        return null;
      }

      // Return the return value, unwrapping potential instance proxies
      if (retval !== null && retval.___is_instance_proxy === true) {
        return retval.__ptr;
      }
      return retval;
    });

    return callback;
  }
}

module.exports = Block;
