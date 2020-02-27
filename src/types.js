const ref = require('ref-napi');
const structs = require('./structs');

const pointer = ref.refType(ref.types.void);
const id = pointer;
const NSInteger = ref.coerceType('int64');
const NSUInteger = ref.coerceType('uint64');

module.exports = Object.assign({}, ref.types, {
  pointer, id, NSInteger, NSUInteger,

  NSRange: structs.defineStruct('_NSRange', {
    location: NSUInteger,
    length: NSUInteger
  })
});
