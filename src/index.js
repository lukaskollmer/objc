// objc

const constants = require('./constants');
const types = require('./types');
const runtime = require('./runtime');
const instance = require('./instance');
const {js, ns} = require('./type-converters');
const {InOutRef} = require('./inout.js');
const Block = require('./block');
const Selector = require('./selector');
const createClass = require('./create-class'); // for subclassing ObjC classes in JS (this needs reworking)
const {defineStruct} = require('./structs');



const importFramework = name => {
  // name : string -- framework's name (e.g. "AppKit") or absolute path ("/PATH/TO/NAME.framework")
  // Result: boolean -- was the framework successfully loaded?
  if (['Foundation', 'CoreFoundation'].includes(name)) { return true; } // TO DO: this is a kludge (since these frameworks should already be loaded); however, if client tries to [re]import Foundation/CF it seems to break subsequent imports of AppKit and other frameworks (the bundle.load() call still returns true, but AppKit etc classes, e.g. `objc.NSWorkspace`, can't be found); why?
  const path = name.includes('/') ? name : `/System/Library/Frameworks/${name}.framework`;
  const bundle = instance.getClassByName('NSBundle').bundleWithPath_(path);
  if (!bundle) {
    throw new Error(`Unable to find bundle named '${name}'`);
  }
  if (!bundle.load()) { // TO DO: it would be better to use loadAndReturnError:(NSError**), to provide better error messages
    throw new Error(`Unable to load bundle named '${name}'`);
  }
  return bundle; // TO DO: confirm this; we probably should return the bundle itself, in case callers want to load nib or other resource files as well
};



module.exports = new Proxy({
  // import frameworks
  import: importFramework, // TO DO: is it worth allowing multiple frameworks to be imported in a single `import()`, as a convenience to users? e.g.: objc.import('AppKit', 'CoreData', 'WebKit')
  // explicitly convert values between ObjC and JS types
  js,
  ns,
  
  // type checking (note: users should use these functions to identify ObjC objects rather than e.g. `object instanceof objc.__internal__.ObjCInstance`, unless they really understand what they're doing)
  isClass: instance.isWrappedObjCClass,
  isInstance: instance.isWrappedObjCInstance,
  isObjC: (object) => object && object[constants.__objcObject] !== undefined,
  
  // creating ObjC-specific types
  types,
  Block,
  InOutRef,
  Selector,
  
  
  NSRange: defineStruct('_NSRange', { // TO DO: check this (Q. why is struct name prefixed?)
    location: types.NSUInteger,
    length: types.NSUInteger
  }), 
  
  
  defineStruct, // TO DO: how/where should type constructors be presented? e.g. createClass, defineStruct, and Block will all need objc.types; also, their names and instantiation processes are all inconsistent
  
  createClass, // TBD
  
  __internal__: instance, // allow access to internal APIs, should users need to work directly with ObjC pointers (e.g. when passing NS objects to/from CF APIs and vice-versa); caution: here be dragons
}, {
  get: (builtins, key) => {
    
//    console.log("$$$" + Object.prototype.hasOwnProperty.call(builtins, key) + '   "' +String(key) + '" = '+ typeof builtins[key])
    
    if (Object.prototype.hasOwnProperty.call(builtins, key)) { // TO DO: curious why? there shouldn't be anything on builtins object, or is this to guard against any JS runtime shenannigans, injecting crud where it shouldn't be?
      return builtins[key];
    }
    
    // OK, so there's a risk in principle of builtin names masking importable names; do we really need to worry about that in practice though, given that [Obj]C strongly encourages framework devs to prefix all exported names with an ad-hoc namespace (e.g. "NSBlock", not, "Block")? if name masking is a concern, we could use `$NAME` to disambiguate imported names; stripping the leading '$' when doing the actual lookup
    
 // console.log("GET: "+key);
  
    let obj = instance.getClassByName(String(key));
    
    if (obj === undefined) {
    // Not a class, see if we can find a constant with that name
      const ptr = runtime.getSymbolAsId(key);
      if (ptr !== null) {
      
      // TO DO: why is NSString constant found but NSUInteger constant not? (I’m assuming that string constants, being objects, have to be exported by the object file; whereas numeric C constants are normally defined in .h only so their names don't appear in symbol table); this doesn't preclude the possibility of non-NSString constants appearing in symbol table (e.g. CString, NSNumber), so automatically assuming that a constant is an NSString, or even an ObjC object, would be unwise; for now though, we'll assume it's some sort of NSObject, and if user tries to import any other symbol (e.g. C function) we can't really prevent that (and it will most likely crash); the eventual solution is to use bridgesupport or maybe PyObjC’s header parser to generate tables of all non-ObjC symbols (parsing headers would also allow exact argument types for all methods to be determined—in theory introspection could provide '@<classname>', but in practice is normally just '@', and chances are those parsed tables could be used to construct method wrappers more quickly than introspection does, so pregenerated glues could use those and leave introspection as fallback when a glue isn't available) (of note: importing PyObjC glue modules, e.g. `import Foundation`, is surprisingly laggy (1–2 sec); wonder if that's because it generates a full set of class and method wrappers at import time, rather than generating them individually as and when needed?)
        
        //console.log(objc.NSAppleScriptErrorAppName)
        //console.log(objc.NSUTF8StringEncoding)

        //console.log(objc.runtime.getSymbol('NSAppleScriptErrorAppName'))
        //console.log(objc.runtime.getSymbol('NSUTF8StringEncoding'))

      
        //console.log(`creating symbol: ${runtime.object_getClassName(ptr)}`);
        
        obj = instance.wrapInstance(ptr);
        builtins[key] = obj;
        
        // originally: obj = (new InstanceProxy(new Instance(ptr))).UTF8String(); // TO DO: why call UTF8String() to convert back to JS string? the only reason to get these keys is to use them in ObjC APIs, so converting to JS strings is creating extra work; the main gotcha is when using NSStrings as JS object keys, but that can be addressed by having toString()/toPrimitive() return -UTF8String instead of -description when the ObjC object isKindOfClass:NSString (note that -[NSString description] already does this, returning NSString's actual value instead of descriptive representation as is case for e.g. -[NSArray description] and others, so all we're doing is avoiding the "[ObjCInstance CLASS DESCRIPTION]" JS-style description string that will be generated for most NS classes) // for now, let's leave the value as an ObjC instance
    
      } else {
        // TO DO: should this return undefined (the standard JS behavior) or throw (more foolproof)?
        // return undefined; 
        throw new Error(`Unable to find 'objc.${key}'`);
    
      }
    }
    
//    console.log('RET:' +typeof obj+'  '+obj);
    return obj;
  },
  
  set: (_, key, value) => {
    throw new Error(`Cannot set 'objc.${key}'`);
  }
});
