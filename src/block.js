const ffi = require('ffi');
const struct = require('ref-struct');
const runtime = require('./runtime');
const types = require('./types');

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
  constructor(fn, returnType, argumentTypes) {
    if (typeof fn !== 'function' || typeof returnType !== 'string' || argumentTypes === undefined) {
      throw new TypeError('Invalid arguments passed to Block constructor');
    }

    this.fn = fn;
    this.returnType = types[returnType];
    this.argumentTypes = argumentTypes;
    this.argumentTypes.splice(0, 0, '@'); // 1st argument is the block itself
    this.argumentTypes = this.argumentTypes.map(type => types[type]);
  }

  makeBlock() {
    const self = this;
    const callback = ffi.Callback(this.returnType, this.argumentTypes, function () { // eslint-disable-line new-cap
      // Call the block implementation, skipping the 1st parameter (the block itself)
      const retval = self.fn.apply(null, Array.from(arguments).slice(1));

      // Return the return value, unwrapping potential instance proxies
      if (retval !== null && retval.___is_instance_proxy === true) {
        return retval.ptr;
      }
      return retval;
    });

    const block = new __block_literal();

    block.isa = runtime.getSymbol('_NSConcreteGlobalBlock');
    block.flags = 1 << 29;
    block.reserved = 0;
    block.invoke = callback;
    block.descriptor = descriptor.ref();

    return block.ref();
  }
}

module.exports = Block;
