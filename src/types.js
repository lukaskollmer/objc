// extended version of the ref-napi module that adds several convenience constants familiar to ObjC users: `id`, `NSInteger`, etc; publicly exported as `objc.types`


const util = require('util');

const ref = require('ref-napi');


const pointer = ref.refType(ref.types.void); // seems odd; is there not a `void*` already predefined on ref.types?

// TO DO: these should be merged into type-encodings.js, and defined as ref-compatible ObjC codecs in case of id
const id = pointer; // kludge; TO DO: pointer to some sort of ObjC instance, usually (but not guaranteed to be) of an NSObject subclass; in any case, for our purposes we want objc.types.id to be the codec for '@' so it has to understand ObjCObjects
const NSInteger = ref.types.int64;
const NSUInteger = ref.types.uint64;


const _objctypes = {};

// caution: if an ObjC type has same name as a ref-napi C type, the ObjC definition has precedence
module.exports = Object.assign(_objctypes, ref.types, {
  pointer,
  id,
  NSInteger,
  NSUInteger,
  [util.inspect.custom]: (depth, inspectOptions, inspect) => `{\n\t${Object.keys(_objctypes).join(',\n\t')}\n}`, // TO DO: allow a custom 'detail' flag ('low'/'medium'/'high') in inspectOptions, that switches between returning '[object objctypes]', '{void,int8,uint8,etc}', or the full object representation (the standard util.inspect behavior); with 'medium' or 'low' as the default setting; see also ./runtime.js; this should cut down on unhelpful noise being displayed to users (most of whom will rarely need to use types or runtime modules), while still allowing full inspection for troubleshooting purposes
});

