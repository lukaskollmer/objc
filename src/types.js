// extended version of the ref-napi module that adds several convenience constants familiar to ObjC users: `id`, `NSInteger`, etc; publicly exported as `objc.types`

// it also defines NSRange, which is both a constructor for NSRange structs and an ffi type in itself, although that might be better placed on structs (which could be exposed as `objc.structs`, although currently is mostly private and only `objc.defineStruct` is public); alternatively, Block, Selector, defineStruct could be added to `objc.types` to minimize additions top-level `objc` namespace (which is mostly for ObjC classes)

const ref = require('ref-napi');
const structs = require('./structs');

const pointer = ref.refType(ref.types.void);
const id = pointer;
const inoutType = ref.refType(ref.refType(ref.types.void));
const NSInteger = ref.coerceType('int64'); // TO DO: curious: why not use types.int64, which is already defined?
const NSUInteger = ref.coerceType('uint64'); // TO DO: ditto types.uint64?

module.exports = Object.assign({}, ref.types, {
  pointer,
  id,
  inoutType,
  NSInteger,
  NSUInteger,
  
  // TO DO: this doesn't quite belong here as it's primarily a constructor for NSRange structs, not a type definition (although it works as one too)
  NSRange: structs.defineStruct('_NSRange', {
    location: NSUInteger,
    length: NSUInteger
  }),  
});
