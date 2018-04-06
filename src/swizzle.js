const runtime = require('./runtime');
const Block = require('./block');

const startCase = string => string[0].toUpperCase() + string.substr(1);

// Swizzle a class or instance method
// cls:       either a wrapped class (like what you get from `objc.NSDate`) or the classname as a string
// selector:  selector of the method you want to swizzle, as a string
// fn:        your new implementation, as a javascript function
// [type]:    whether you want to swizzle a class or instance method
// returns a function that restores the original implementation
module.exports = (cls, selector, fn, type = 'instance') => {
  if (!['instance', 'class'].includes(type)) {
    throw new Error(`Invalid argument '${type}' passed as type`);
  }

  if (typeof cls === 'string' || cls instanceof String) {
    cls = runtime.objc_getClass(cls);
  } else {
    cls = cls.class();
  }

  if (type === 'class') {
    cls = runtime.object_getClass(cls);
  }

  const originalSelector = runtime.sel_getUid(selector);
  const swizzledSelector = runtime.sel_getUid(`xxx__${selector}`);

  const getMethod = runtime[`class_get${startCase(type)}Method`];

  const originalMethod = getMethod(cls, originalSelector);

  // Create the block for the method's implementation
  const returnType = runtime.method_copyReturnType(originalMethod);
  const argc = runtime.method_getNumberOfArguments(originalMethod);
  const argtypes = [];

  for (let i = 0; i < argc; i++) {
    argtypes.push(runtime.method_copyArgumentType(originalMethod, i));
  }

  const block = new Block(fn, returnType, argtypes);

  const success = runtime.class_addMethod(
    cls,
    swizzledSelector,
    runtime.imp_implementationWithBlock(block.makeBlock()),
    runtime.method_getTypeEncoding(originalMethod)
  );

  /* istanbul ignore if */
  if (!success) {
    throw new Error(`Unable to add method '${selector}' to class ${runtime.class_getName(cls)}`);
  }

  const swizzledMethod = getMethod(cls, swizzledSelector);
  runtime.method_exchangeImplementations(originalMethod, swizzledMethod);

  return () => runtime.method_exchangeImplementations(originalMethod, swizzledMethod);
};
