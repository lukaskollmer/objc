const ffi = require('ffi');

const lib = new ffi.Library(null, {
  'dlopen': ['pointer', ['string', 'int']]
});

const libobjc = new ffi.Library('libobjc', {
  sel_getUid: ['pointer', ['string']],
  sel_getName: ['string', ['pointer']],

  objc_getClass: ['pointer', ['string']],
  //objc_msgSend: ['pointer', ['pointer', 'pointer']],

  object_getClass: ['pointer', ['pointer']],

  class_getName: ['string', ['pointer']],
  class_getClassMethod: ['pointer', ['pointer', 'pointer']],
  class_getInstanceMethod: ['pointer', ['pointer', 'pointer']],

  method_copyReturnType: ['string', ['pointer']],
  method_copyArgumentType: ['string', ['pointer', 'int']],
  method_getNumberOfArguments: ['int', ['pointer']],
});

libobjc.objc_msgSend = ffi.DynamicLibrary().get('objc_msgSend');

const importFramework = name => {
  const handle = lib.dlopen(`/System/Library/Frameworks/${name}.framework/${name}`, 1); // 1: RTLD_LAZY
  return !handle.isNull();
}

importFramework('Foundation');


const msgSend = (returnType, argumentTypes) => {
  //console.log(`returnType: ${returnType} argumentTypes: ${argumentTypes}`);
  return ffi.ForeignFunction(libobjc.objc_msgSend, returnType, argumentTypes);
}

const classExists = classname => {
  return !libobjc.objc_getClass(classname).isNull();
}

module.exports = libobjc;
module.exports.msgSend = msgSend;
module.exports.import = importFramework;
module.exports.classExists = classExists;
