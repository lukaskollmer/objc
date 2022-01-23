  
  
  
module.exports = {
  
  __ptr: Symbol('__ptr'), // extract the raw ObjC pointer directly from its method wrapper // TO DO: not recommended; use __objcObject to get the ObjCObject out of the method wrapper and then access __ptr on that
  __objcObject: Symbol('__objcObject'), // extract the ObjCObject from its method Proxy; for internal use only
  __isObjCObject: Symbol('__isObjCObject'), // `obj[__isObjCObject]` is alternative to `obj instanceof ObjCObject` that avoids circular reference between instance and the rest

};
