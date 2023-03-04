
// TO DO: is it worth defining one or more Error subclasses for objc-specific errors?


module.exports = {
  
  // use these functions to typecheck JS values
  isBoolean: object => (typeof object === 'boolean' || object instanceof Boolean),
  isNumber:  object => (typeof object === 'number' || object instanceof Number), // note: this does not check isNaN(); this is intentional (NaN's type is still 'number', and it's part of the IEEE spec for FP numbers, so will still map to and from NSNumber which is all we're interested in)
  isString:  object => (typeof object === 'string' || object instanceof String),
  
  // keys for externally accessing method Proxy's internal objects; used throughout objc and may occasionally be needed by client code when working with C functions (which objc does not currently generate wrappers for)
  __objcObject: Symbol('__objcObject'), // extract the ObjCObject from its method Proxy
  __objcClassPtr: Symbol('__objcClassPtr'), // extract an ObjC Class pointer from its method Proxy
  __objcInstancePtr: Symbol('__objcInstancePtr'), // extract an ObjC instance pointer from its method Proxy

  __objcType: Symbol('__objcType'), // ObjCStructType
};
