const runtime = require('./runtime');
const Block = require('./block');
const {wrapClass} = require('./instance');



const retainedGlobals = [];

function _retainGlobal(obj) {
  retainedGlobals.push(obj);
};


const addMethods = (dest, methods) => {
  for (const name of Object.getOwnPropertyNames(methods).filter(n => n !== '_encodings')) {
    const selector = runtime.sel_getUid(name);
    const encoding = methods._encodings[name];
    
    const [returnType, argumentTypes] = encoding;
    const block = new Block(methods[name], returnType, argumentTypes, false);
    
    const imp = block.getFunctionPointer();
    _retainGlobal(imp); // may not need this depending on how we capture the methods
    
    runtime.class_addMethod(dest, selector, imp, [].concat.apply([], encoding).join(''));
  }
};



// TO DO: this needs redone; the goal, obviously, is to make JS classes callable from ObjC, but this is neither elegant nor integrated with new instance.js implementation so doesn't add the newly created classes to the `objc` namespace; in an ideal world, client would write `class Foo extends objc.NSObject {…}` but really not sure if that's technically feasible (at minimum, Foo class would need passed to an explicit `objc.registerAsObjCClass()`, which could introspect it for methods, using `$NAME(){…}` vs `NAME(){…}` to distinguish class vs instance methods, and add it to the class cache)


module.exports = (name, superclass, instanceMethods = {}, classMethods = {}) => {
  // ObjC runtime requires each class name to be unique
  // Q. what does ObjC runtime do if a framework is imported that causes a class name collision?
  if (runtime.classExists(name)) {
    throw new Error(`Can't create class ${name} as it already exists.`);
  }
  // Assuming superclass is a string
  superclass = runtime.objc_getClass(superclass);

  const classPtr = runtime.objc_allocateClassPair(superclass, name, 0); // TODO add ivar support?

  // Add instance methods
  addMethods(classPtr, instanceMethods);

  runtime.objc_registerClassPair(classPtr);

  // Add class methods
  addMethods(runtime.object_getClass(classPtr), classMethods);

  // Return a proxy wrapping the newly created class
  return wrapClass(classPtr); // TO DO: this doesn't cache the class in instance.js
};
