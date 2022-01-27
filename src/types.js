// extended version of the ref-napi module that adds several convenience constants familiar to ObjC users: `id`, `NSInteger`, etc; publicly exported as `objc.types`




const ref = require('ref-napi');


const pointer = ref.refType(ref.types.void); // seems odd; is there not a `void*` already predefined on ref.types?

// TO DO: these should be merged into type-encodings.js, and defined as ref-compatible ObjC codecs in case of id
const id = pointer; // kludge; TO DO: pointer to some sort of ObjC instance, usually (but not guaranteed to be) of an NSObject subclass; in any case, for our purposes we want objc.types.id to be the codec for '@' so it has to understand ObjCObjects
const NSInteger = ref.types.int64;
const NSUInteger = ref.types.uint64;



module.exports = Object.assign({}, ref.types, {
  pointer,
  id,
  NSInteger,
  NSUInteger,
});
