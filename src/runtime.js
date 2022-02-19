/* eslint-disable camelcase, key-spacing, no-multi-spaces, array-bracket-spacing */

const util = require('util');

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



dlfcn.dlopen('/System/Library/Frameworks/Foundation.framework/Foundation', ffi.DynamicLibrary.FLAGS.RTLD_LAZY);


module.exports = libobjc;
module.exports.classExists = classExists;
module.exports.getSymbol = getSymbol;
module.exports.getSymbolAsId = getSymbolAsId;

module.exports[util.inspect.custom] = () => '[object objc.__internal__.runtime]'; // TO DO: crude, but any user sufficiently advanced to perform this magic this had best read the module source and corresponding ObjC documentation

