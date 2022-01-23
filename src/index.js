const runtime = require('./runtime');
const instance = require('./instance');
const Block = require('./block');
const Selector = require('./selector');
const swizzle = require('./swizzle'); // Q. what's being swizzled?
const createClass = require('./create-class'); // for subclassing ObjC classes in JS (this needs reworking)
const {js, ns} = require('./type-converters');
const {defineStruct} = require('./structs');
const types = require('./types');



const importFramework = name => {
  // name : string -- framework's name (e.g. "AppKit") or absolute path ("/PATH/TO/NAME.framework")
  // Result: boolean -- was the framework successfully loaded?
  if (['Foundation', 'CoreFoundation'].includes(name)) { return true; } // TO DO: this is a kludge (since these frameworks should already be loaded); however, if client tries to [re]import Foundation/CF it seems to break subsequent imports of AppKit and other frameworks (the bundle.load() call still returns true, but AppKit etc classes, e.g. `objc.NSWorkspace`, can't be found); why?
  const path = name.includes('/') ? name : `/System/Library/Frameworks/${name}.framework`;
  const bundle = instance.getClassByName('NSBundle').bundleWithPath_(path);
  if (!bundle) {
    throw new Error(`Unable to find bundle named '${name}'`);
  }
  return bundle.load();
};



module.exports = new Proxy({
  types,
  runtime, // TO DO: what needs to be publicly exported from ./runtime.js? (which is mostly libobjc, and arguably not something client code should need access to: if they do need some feature, it should probably be exposed as a public API)
  Block,
  Selector,
  swizzle,
  createClass,
  import: importFramework,
  js,
  ns,
  isClass: instance.isWrappedObjCClass,
  isInstance: instance.isWrappedObjCInstance,
  defineStruct,
//  wrap: obj => new InstanceProxy(new Instance(obj)),
//  allocRef: Instance.alloc, // TO DO: used for inout arguments; problem is, we don't know for sure what class of out value will be; maybe we want an explicit InOutRef; we also want to avoid setting __ptr on existing ObjCInstances, which is probably how it's currently done
//  isNull: Instance.isNull // TO DO: 
}, {
  get: (builtins, key) => {
  
    if (Object.prototype.hasOwnProperty.call(builtins, key)) { // TO DO: curious why? there shouldn't be anything on builtins object, or is this to guard against any JS runtime shenannigans, injecting crud where it shouldn't be?
      return builtins[key];
    }
    
 // console.log("GET: "+key);
  
    let obj = instance.getClassByName(String(key));
    
    if (obj === undefined) {
    // Not a class, see if we can find a constant with that name
      const ptr = runtime.getSymbolAsId(key);
      if (ptr !== null) {
      
        console.log(`creating symbol: ${runtime.object_getClassName(ptr)}`);
      
        
        // wrap: obj => new InstanceProxy(new Instance(obj)),
        //obj = new builtins.ObjCInstance(instance.getClassByName('NSString', ptr)).UTF8String(); // TO DO: this seems to assume that [introspectable] constants will always be NSStrings, which is a standard convention in Cocoa (e.g. `NSHumanReadableCopyright`, used in NSBundle's infoDictionary), but not guaranteed (e.g. what about NSUTF8StringEncoding?); also, what about C funcs and other exported names? won't getSymbolAsId() return those too (e.g. a C func would also appear as a pointer, but will go very wrong if wrapped as something else)
        // also, why call UTF8String() to convert back to JS string? the only reason to get these keys is to use them in ObjC APIs, so converting to JS strings is creating extra work; the main gotcha is when using NSStrings as JS object keys, but that can be addressed by having toString()/toPrimitive() return -UTF8String instead of -description when the ObjC object isKindOfClass:NSString (note that -[NSString description] already does this, returning NSString's actual value instead of descriptive representation as is case for e.g. -[NSArray description] and others, so all we're doing is avoiding the "[ObjCInstance CLASS DESCRIPTION]" JS-style description string that will be generated for most NS classes)
    
      } else {
        // TO DO: should this return undefined (the standard JS behavior) or throw (more foolproof)?
        // return undefined; 
        throw new Error(`Unable to find symbol '${key}'`);
    
      }
    }
    
//    console.log('RET:' +typeof obj+'  '+obj);
    return obj;
  },
  
  set: (_, key, value) => {
    throw new Error(`Cannot set objc.${key}`);
  }
});
