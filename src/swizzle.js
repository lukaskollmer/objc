
const constants = require('./constants');

const block = require('./block');
const runtime = require('./runtime');
const objctypes = require('./objctypes');



// TO DO: there is overlap between this and create-class.js

const swizzle = (className, selectorName, fn, isClassMethod = false) => {
  // Swizzle a class or instance method
  // className : string -- class name, e.g. "NSFoo"
  // selectorName :  string -- NS-style name of the method to swizzle, e.g. "foo:barBaz:"
  // fn : function -- the new implementation
  // Result: function -- a swapMethods function that restores the original implementation

  const classPtr = libobjc.objc_getClass(className);
  const selector = libobjc.sel_getUid(selectorName);
  const originalMethodPtr = isClassMethod ? libobjc.class_getClassMethod(classPtr, selector)
                                          : libobjc.class_getInstanceMethod(classPtr, selector);
  
  const swizzledSelector = libobjc.sel_getUid(`xxx__${selectorName}`); // TO DO: swizzled method naming convention? also, should distinguish between class and instance
  
  const block = new (block.getBlockClassForEncoding(runtime.method_getTypeEncoding(method)))(fn);

  const success = libobjc.class_addMethod(
    classPtr,
    swizzledSelector,
    libobjc.imp_implementationWithBlock(block),
    libobjc.method_getTypeEncoding(originalMethod)
  );

  if (!success) {
    throw new Error(`Unable to add method '${selectorName}' to class ${className}`);
  }

  const swizzledMethod = libobjc.method_getImplementation(classPtr, swizzledSelector);
  const swapMethods = () => libobjc.method_exchangeImplementations(originalMethodPtr, swizzledMethodPtr);
  swapMethods();
  return swapMethods;
};


module.exports = swizzle;
