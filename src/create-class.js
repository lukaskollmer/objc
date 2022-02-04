// TO DO: rename `subclass`
//
// TO DO: this API needs more thought
//
// the goal is to make JS classes callable from ObjC, but this API is not elegant and is not integrated with new instance.js implementation, so it won't add newly created classes to the `objc` namespace
//
// in an ideal world, users would write `class Foo extends objc.NSObject {…}` but really not sure if that's technically feasible (at minimum, the resulting Foo class would need explicitly passed to an `objc.registerAsObjCClass()` to register it with objc's Class cache (or can we do that during first instantiation, when JS presumably calls JS class's parent's constructor?)
//
// during class registration, we should be able to introspect it for methods, relying on '$NAME' vs 'NAME' to distinguish class ("$tatic") methods from instance methods; however, we'd still need a way to annotate each JS method with an ObjC type signature, so will need more thought


const runtime = require('./runtime');
const Block = require('./block');
const instance = require('./instance');



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


module.exports = (name, superclass, instanceMethods = {}, classMethods = {}) => {
  
  // note: use objc.NAME to get the newly created class 
  // caution: ObjC runtime requires each class name to be unique
  if (runtime.classExists(name)) {
    throw new Error(`Can't create class ${name} as it already exists.`);
  }
  // Assuming superclass is a string // TO DO: why? why not use objc.CLASS and extract ptr from that?
  superclass = runtime.objc_getClass(superclass);

  const classPtr = runtime.objc_allocateClassPair(superclass, name, 0); // TODO add ivar support? -- Q. for what purpose? anyone subclassing ObjC classes probably shouldn't be poking in their ivars as those are normally undocumented and may be considered private to the superclass (this could be troublesome if creating JS subclass of JS subclass of ObjC class, if the JS sub-subclass needs to access the JS subclass's attributes; but probably best to leave until final syntax/API for declaring ObjC subclasses in JS - ideally using ES6 class syntax - is figured out)
  
  addMethods(classPtr, instanceMethods);
  runtime.objc_registerClassPair(classPtr);
  addMethods(runtime.object_getClass(classPtr), classMethods);
  // HAS: don't return the new ObjC class here as that suggests it is locally scoped to the module that created it, whereas all ObjC classes exist globally and are always available as objc.CLASSNAME
};
