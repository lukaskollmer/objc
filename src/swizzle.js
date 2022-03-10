
const constants = require('./constants');
const runtime = require('./runtime');
const subclass = require('./subclass');


module.exports.swizzle = (classObject, selectorName, fn, isClassMethod = false) => {
  // Swizzle a class or instance method
  // classObject : ObjCClass -- wrapped ObjCClass, e.g. `objc.NSDate`
  // selectorName :  string -- NS-style name of the method to swizzle, e.g. "foo:barBaz:"
  // fn : function -- the new implementation; this must match ObjC method's arguments and return value
  // Result: function -- a swapMethods function that restores the original implementation
  let dest = classObject[constants.__objcClassPtr];
  if (isClassMethod) { dest = runtime.object_getClass(dest); }
  
  const swizzledName = `xxx__${selectorName}`; // TO DO: is there a standard naming convention for swizzled methods?
  const originalSelector = runtime.sel_getUid(selectorName);
  const swizzledSelector = runtime.sel_getUid(swizzledName);
  
  const getMethod = isClassMethod ? runtime.class_getClassMethod : runtime.class_getInstanceMethod;
  
  const originalMethod = getMethod(dest, originalSelector);
  const success = subclass.addMethod(dest, swizzledSelector, runtime.method_getTypeEncoding(originalMethod), fn);
  if (!success) { throw new Error(`Unable to add method '${selectorName}' to class ${classObject}`); }
  const swizzledMethod = getMethod(dest, swizzledSelector);
  
  const swapMethods = () => runtime.method_exchangeImplementations(originalMethod, swizzledMethod);
  swapMethods.swizzledName = swizzledName;
  swapMethods();
  return swapMethods;
};

