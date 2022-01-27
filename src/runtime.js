/* eslint-disable camelcase, key-spacing, no-multi-spaces, array-bracket-spacing */

const ffi = require('ffi-napi');
const ref = require('ref-napi');

const constants = require('./constants');


const dlfcn = new ffi.Library(null, {
  dlopen: ['pointer', ['string', 'int']]
});

const libobjc = new ffi.Library('libobjc', {
  // Selectors
  sel_getUid : ['pointer', ['string' ]],
  sel_getName: ['string',  ['pointer']],

  // Classes
  objc_getClass          : ['pointer', ['string' ]],
  object_getClass        : ['pointer', ['pointer']],
  object_isClass         : ['bool',    ['pointer']],
  object_getClassName    : ['string',  ['pointer']],
  class_getName          : ['string',  ['pointer']],
  class_getClassMethod   : ['pointer', ['pointer', 'pointer']],
  class_getInstanceMethod: ['pointer', ['pointer', 'pointer']],
  class_addMethod        : ['bool',    ['pointer', 'pointer', 'pointer', 'string']],
  class_replaceMethod    : ['pointer', ['pointer', 'pointer', 'pointer', 'string']],
  objc_allocateClassPair : ['pointer', ['pointer', 'string', 'int']],
  objc_registerClassPair : ['void',    ['pointer']],

  // Methods
  method_getTypeEncoding        : ['string',  ['pointer']],
  method_getNumberOfArguments   : ['int',     ['pointer']],
  method_copyReturnType         : ['string',  ['pointer']],
  method_copyArgumentType       : ['string',  ['pointer', 'int']],
  method_getImplementation      : ['pointer', ['pointer']],
  method_exchangeImplementations: ['void',    ['pointer', 'pointer']],
  method_setImplementation      : ['pointer', ['pointer', 'pointer']],

  // IMP
  imp_implementationWithBlock: ['pointer', ['pointer']]
});

libobjc.objc_msgSend = ffi.DynamicLibrary().get('objc_msgSend'); // eslint-disable-line new-cap


// TO DO: this is probably redundant from users' POV as they can just ask for objc.CLASSNAME and catch 'not found' error
const classExists = classname => !libobjc.objc_getClass(classname).isNull();

// TO DO: better function names?

const getSymbol = name => new ffi.DynamicLibrary().get(name);

const getSymbolAsId = name => { // get a symbol which caller knows to be an ObjC object (`id`, usually NSString* const)
  try {
    const symbol = getSymbol(name);
    symbol.type = ref.refType(ref.refType(ref.types.void));
    return symbol.deref();
  } catch (err) {
    return null;
  }
};

// Swizzle a class or instance method
// cls:       either a wrapped class (like what you get from `objc.NSDate`) or the classname as a string
// selector:  selector of the method you want to swizzle, as a string
// fn:        your new implementation, as a javascript function
// [type]:    whether you want to swizzle a class or instance method
// returns a function that restores the original implementation
const swizzle = (cls, selector, fn, type = 'instance') => {
  const Block = require('./block');

  if (constants.isString(cls)) {
    cls = libobjc.objc_getClass(cls);
  } else {
    cls = cls.class();
  }

  let getMethod;
  if (type === 'class') {
    cls = libobjc.object_getClass(cls);
    getMethod = libobjc.class_getClassMethod;
  } else if (type === 'instance') {
    getMethod = libobjc.class_getInstanceMethod;
  } else {
    throw new Error(`Invalid method type (not 'class' or 'instance'): '${type}'`);
  }
  
  const originalSelector = libobjc.sel_getUid(selector);
  const swizzledSelector = libobjc.sel_getUid(`xxx__${selector}`);

  const originalMethod = getMethod(cls, originalSelector);

  // Create the block for the method's implementation
  const returnType = libobjc.method_copyReturnType(originalMethod);
  const argc = libobjc.method_getNumberOfArguments(originalMethod);
  const argtypes = [];

  for (let i = 0; i < argc; i++) {
    argtypes.push(libobjc.method_copyArgumentType(originalMethod, i));
  }

  const block = new Block(fn, returnType, argtypes);

  const success = libobjc.class_addMethod(
    cls,
    swizzledSelector,
    libobjc.imp_implementationWithBlock(block.makeBlock()),
    libobjc.method_getTypeEncoding(originalMethod)
  );

  if (!success) {
    throw new Error(`Unable to add method '${selector}' to class ${libobjc.class_getName(cls)}`);
  }

  const swizzledMethod = getMethod(cls, swizzledSelector);
  libobjc.method_exchangeImplementations(originalMethod, swizzledMethod);

  return () => libobjc.method_exchangeImplementations(originalMethod, swizzledMethod);
};

dlfcn.dlopen('/System/Library/Frameworks/Foundation.framework/Foundation', ffi.DynamicLibrary.FLAGS.RTLD_LAZY);

module.exports = libobjc;
module.exports.classExists = classExists;
module.exports.getSymbol = getSymbol;
module.exports.getSymbolAsId = getSymbolAsId;
module.exports.swizzle = swizzle;
