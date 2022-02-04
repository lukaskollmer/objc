
// TO DO: could do with defining some nice semantic Error subclasses; currently we throw Error (unhelpful) and (inconsistently) TypeError (which we might want to subclass as ObjCTypeError so it is easier to identify and can hold additional info such as method signatures and the bad argument values)


module.exports = {
  
  // use these functions to typecheck JS values
  // (annoyingly JS allows `new TYPE(primitive)` for creating object-based booleans, numbers, and strings, so both primitive and object versions must be accounted for; why JS doesn't define these as standard...yada,yada)
  isBoolean: object => (typeof object === 'boolean' || object instanceof Boolean),
  isNumber:  object => (typeof object === 'number' || object instanceof Number), // note: this does not check isNaN(); this is intentional (NaN's type is still 'number', and it's part of the IEEE spec for FP numbers, so will still map to and from NSNumber which is all we're interested in)
  isString:  object => (typeof object === 'string' || object instanceof String),
  
  // keys for externally accessing method Proxy's internal objects; used throughout objc and may occasionally be needed by client code when working with C functions (which objc does not currently generate wrappers for)
  __objcObject: Symbol('__objcObject'), // extract the ObjCObject from its method Proxy
  __objcClassPtr: Symbol('__objcClassPtr'), // extract an ObjC Class pointer from its method Proxy
  __objcInstancePtr: Symbol('__objcInstancePtr'), // extract an ObjC instance pointer from its method Proxy

};
