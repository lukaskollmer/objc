const ref = require('ref');
const structs = require('./structs');

const id = ref.coerceType('pointer');
const NSInteger = ref.coerceType('int64');
const NSUInteger = ref.coerceType('uint64');

module.exports = Object.assign({}, ref.types, {
  id, NSInteger, NSUInteger,

  NSRange: structs.defineStruct('_NSRange', {
    location: NSUInteger,
    length: NSUInteger
  })
});
