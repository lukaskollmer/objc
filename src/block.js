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
      // call the block implementation, skipping the 1st parameter (the block itself)
      return self.fn.apply(null, Array.from(arguments).slice(1));
    });

    const block = new __block_literal();

    block.isa = runtime.getSymbol('_NSConcreteGlobalBlock');
    block.flags = 1 << 29;
    block.reserved = 0;
    block.invoke = callback;
    block.descriptor = null; // TODO can we get away w/out setting the descriptor?

    return block.ref();
  }
}

module.exports = Block;
