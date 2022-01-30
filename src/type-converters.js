/* eslint-disable no-multi-assign */

// ns, js functions for converting the standard JS types to their NS equivalents and back

// TO DO: rename 'converters.js'? 'mappers.js'?

// note: mutable JS values (arrays, objects) are converted to their immutable NS counterparts

// TO DO: once the behavior of ns() and js() is finalized, performance optimize them as much as possible as converting to and from standard JS types will be a significant bottleneck; e.g. bypass ./instance.js's high-level wrappers and use the ffi APIs directly, (since there's only a half-dozen JS types to bridge, it's worth the extra coding); much of the safety checks that are performed when user calls arbitrary methods with arbitrary arguments can be skipped; as well as bypassing at least some of ./instance.js's class and method wrappers (with their associated overheads, particularly when packing/unpacking arrays and dictionaries), it might even be possible to skip some of the ObjC dynamic dispatch (objc_msgSend itself is very fast, but our wrapper code around it adds its own non-trivial overhead) and assign the classes and methods' underlying C pointers to consts and use those directly with FFI APIs


const constants = require('./constants');
const Selector = require('./selector');


let debugLog = function(){}
//debugLog = console.log



// curse you, circular references (./instance.js needs this module but this module also needs ./instance.js); this keeps a second cache of wrapped ObjCClasses for NSString, NSNumber, etc for use below; eventually we will need those wrapped classes only for constructing ObjCInstances as everything else will be done on underlying pointers and raw ffi calls; and at that point we can see if this can be rationalized then, or even moved into instances.js to eliminate the circular ref problem
const _classes = {};

const getClass = classname => {
  let obj = _classes[classname];
  if (!obj) {
    obj = _classes[classname] = require('./instance').getClassByName(classname);
  }
  return obj;
}


// unpack/pack // TO DO: we could probably tighten this up by calling FFI directly (we still need access to instance.js to get the ObjCClasses when unpacking instances, but all the ObjC method calls can be flattened right out, retaining method pointers across loops)

// note: these don't map Booleans (although bools represented as NSNumber aren't often encountered, they are a possibility, e.g. an NSDictionary which contains @YES/@NO values)

const js = (object, returnInputIfUnableToConvert = false) => { // TO DO: recommend making the default behavior to return object as-is if it isn't converted (i.e. all ObjCObjects are still JS objects, so technically correct; the only reason for forcing conversion is when passing the returned value to a standard JS function, e.g. JSON.stringify, which won't understand objc objects); maybe rename to `isStrict`/`mustConvert` and reverse the boolean? // TO DO: should there be an additional `recursive` option for shallow vs deep unpacks? currently js(object,false) only guarantees shallow unpacking, as items within the resulting JS Array/object can still be ObjC objects; having 2 independent flags (loose/strict and shallow/deep) should cover pretty much all use-cases (Q. should defaults be loose+shallow or loose+deep? user probably usually wants a deep unpack, so consider making that the default)
  let retvalue;
  
//let t = process.hrtime.bigint();
  
  // everything that isn't an ObjCClass/ObjCInstance gets passed straight thru (although it is irritating that undefined and null throw when you try to look up attributes on them, hence the extra tests); TO DO: should js() reject `undefined` object arg as a type error? or even go further and make all objects except ObjCObject and null a type error?
  
  debugLog('calling js()...'+object[constants.__objcObject]+';'+object[constants.__objcInstancePtr]+';')
  if (object === undefined || object === null || object[constants.__objcObject] === undefined) {
    retvalue = object;
  debugLog('...noped')
  
  
  // TO DO: this could be streamlined by getting __objcInstancePtr and passing its ptr directly to prebuilt ForeignFunction (although, TBF, once method wrappers are fully streamlined there might be very little difference)
  
  // TO DO: we could also streamline this by getting object's class, which is an ObjCClass, and checking if its one of our known objc.CLASSes (whether by comparing ObjCClass objects for identity, or comparing underlying Class pointer Buffers for equality); obviously with some of these being class clusters they will need to know which classes are in that class, but we can let it figure out for itself by first trying identity check on the ObjCClass and then trying the slower isKindOfClass_ tests below, and if one of the latter matches then add the ObjCClass to our lookup table above; in turn the unpackers can be converted to functions which the lookup table can return (basically, 2 tables: one canonical keys—NSNumber, NSString, NSArray, etc—and another with class cluster members—__NSCFBoolean, __NSCFConstantString, __NSSingleObjectArrayI, etc)
  
  } else if (object.isKindOfClass_(getClass('NSString'))) {
  
  debugLog('is an nsstring')
    retvalue = object.UTF8String(); // eslint-disable-line new-cap
  
//  } else if (object.isKindOfClass_(getClass('__NSCFBoolean'))) { // TO DO: see below
//    retvalue = object.boolValue();
  
  } else if (object.isKindOfClass_(getClass('NSNumber'))) {
    // TO DO: what about booleans? problem here is NSNumber.objCType is 'c' for both chars and bools, so to determine which it really is requires examining its true (private) class (NSNumber being a class cluster), which is __NSCFBoolean for a boolean; Q. does 'isKindOfClass:NSNumber' return true when value is any member of the NSNumber class cluster?
    retvalue = object.doubleValue();
  
  } else if (object.isKindOfClass_(getClass('NSDate'))) {
    retvalue = new Date(object.timeIntervalSince1970() * 1000);
  
  } else if (object.isKindOfClass_(getClass('NSArray'))) {
    retvalue = []; // TO DO: we could return a Proxy'd Array that encapsulates the ObjC NSArray and an initially lazy JS Array and lazily converts its items from NS to JS on first access
    for (const obj of object) {
      retvalue.push(js(obj, true)); // note that the JS Array conversion may be shallow (i.e. items within the NSArray will be converted to JS types if possible but any non-bridged items will remain as ObjCObjects)
    }
  
  } else if (object.isKindOfClass_(getClass('NSDictionary'))) {
    retvalue = {};
    for (const key of object) {
      retvalue[String(key)] = js(object.objectForKey_(key), true); // TO DO: this mapping is highly problematic, as key conversions (for anything except NSString or NSNumber) will be lossy, with no roundtripping, risks of key collisions, and likely unreadable too; if we really want a native JS structure, we might need to define our own with discrete methods for getting/setting/deleting keys (in which case we might be as well to have that wrap the NSDictionary that lazily converts NS keys and values to JS)
    }

  } else {
    debugLog('js() barfed')
    // Return null if there's no JS counterpart for the objc type // TO DO: unconvertable objects should either return as-is or throw a "can't convert ${object.class}"; returning null, while it appears to replicate ObjC’s standard behavior where methods returning nil to indicate an error occurred, is ambiguous as it does not distinguish between that "the value is a nil" and "threw away data cos it couldn't be translated"; also, bear in mind that when an ObjC object doesn't recognize a message, e.g. `[(id)object doubleValue]`, the ObjC runtime raises a fatal 'unrecognized selector' exception - which might be the better analogy here
    retvalue = returnInputIfUnableToConvert ? object : null;
  }
  
//debugLog(`js(): ${Number(process.hrtime.bigint() - t)/1e9}µs`);
  
  return retvalue;
};



const ns = (object) => {
  let retvalue;
  
//let t = process.hrtime.bigint();

  if (object === undefined) {
    throw new Error('objc.ns() expected a value but received undefined.'); // should really be a type error
  
  } else if (object === null || object[constants.__objcObject]) {
    retvalue = object;
    
  } else if (constants.isString(object)) { // String -> NSString
    // note: ns() supports the common use-case, which is converting a JS string to an NSString instance
    // to get a Class instead, use `objc[object]`; to get a Selector use `selectorForMethodName(object)`
    retvalue = getClass('NSString').stringWithUTF8String_(object);

  } else if (object instanceof Date) { // Date -> NSDate
    const secondsSince1970 = Number(object) / 1000;
    retvalue = getClass('NSDate').dateWithTimeIntervalSince1970_(secondsSince1970);
    
  } else if (Array.isArray(object)) { // Array -> NSArray
    retvalue = getClass('NSMutableArray').array();
    for (let i = 0; i < object.length; i++) {
      retvalue.addObject_(ns(object[i]));
    }
    
  } else if (constants.isNumber(object)) { // Number -> NSNumber
    retvalue = getClass('NSNumber').numberWithDouble_(object);
  
  } else if (typeof object === 'object') { // Object -> NSDictionary // TO DO: problem with this is that presumably any JS object except String, Date, Array will end up here, and if that object is anything other than simple key-value data then it is going to discard parts of that object, preventing it passing through the ObjC runtime and back to JS in working order; e.g. an object like `{a:1, b:true}` will roundtrip fine, but `new Foo(…)` won't
    retvalue = getClass('NSMutableDictionary').new();
    for (const key of Object.getOwnPropertyNames(object)) {
      retvalue.setObject_forKey_(object[key], key);
    }
  
  } else if (constants.isBoolean(object)) {
    retvalue = getClass('NSNumber').numberWithBool_(object); // confirm this is appropriate 
    // note: PyObjC seems to treat NSNumber.numberWithBool_ calls as a special case, as it returns a native True/False rather than, say, a <class 'objc.pyobjc_bool'> (I suspect that since a bool->NSNumber conversion is inherently cheap, PyObjC just leaves it until it's packing the arguments for objc_msgSend)
    
  } else {
    // TO DO: it might be possible to wrap JS-only values in an opaque NSValue, allowing them to pass through ObjC APIs unchanged (lthough there are probably issues there with JS's GC not knowing the value is non-collectable); determine the JS types not handled above—Symbol, Buffer, Function, etc—and decide which, if any, should be allowed through in boxed form; also, is there a way to distinguish objects created from ES6 classes and provide option for client code to install their own codecs for mapping those
    throw new TypeError(`objc.ns() expected a JS primitive, Date, Array, object, or ObjC object, but received: ${typeof object === 'object' ? object.constructor.name : typeof object}`);
  }
  
//debugLog(`ns(): ${Number(process.hrtime.bigint() - t)/1e9}µs`);

  return retvalue;
};


module.exports = {ns, js};
