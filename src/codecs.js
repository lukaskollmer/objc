/* eslint-disable no-multi-assign */

// ns, js functions for converting the standard JS types to their NS equivalents and back

// TO DO: should `undefined` pass-thru as-is or be treated as TypeError (currently the latter)

// TO DO: it might be possible to wrap JS-only values in an opaque NSValue, allowing them to pass through ObjC APIs unchanged (lthough there are probably issues there with JS's GC not knowing the value is non-collectable); determine the JS types not handled above—Symbol, Buffer, Function, etc—and decide which, if any, should be allowed through in boxed form; also, is there a way to distinguish objects created from ES6 classes and provide option for client code to install their own codecs for mapping those

// TO DO: once the behavior of ns() and js() is finalized, performance optimize them as much as possible as converting to and from standard JS types will be a significant bottleneck; e.g. bypass ./instance.js's high-level wrappers and use the ffi APIs directly, (since there's only a half-dozen JS types to bridge, it's worth the extra coding); much of the safety checks that are performed when user calls arbitrary methods with arbitrary arguments can be skipped; as well as bypassing at least some of ./instance.js's class and method wrappers (with their associated overheads, particularly when packing/unpacking arrays and dictionaries), it might even be possible to skip some of the ObjC dynamic dispatch (objc_msgSend itself is very fast, but our wrapper code around it adds its own non-trivial overhead) and assign the classes and methods' underlying C pointers to consts and use those directly with FFI APIs


const constants = require('./constants');
const Selector = require('./selector');



// local cache of ObjCClasses used below (avoids circular references between this module and ./instance.js)

const _classes = {};

const getClass = classname => {
  let obj = _classes[classname];
  if (!obj) {
    obj = _classes[classname] = require('./instance').getClassByName(classname);
  }
  return obj;
}


// handler functions for unconverted values

const jsReturnIfUnconverted = object => object;

// TO DO: it *might* be possible to wrap JS-only values in an opaque NSValue, allowing them to pass through ObjC APIs unchanged, though this is contingent upon JS GC being able to increment+decrement NSValue's refcount, and not collecting while the NSValue is also retained by ObjC runtime

const nsThrowIfUnconverted = object => {
  const typename = typeof object === 'object' ? object.constructor.name : typeof object;
  throw new TypeError(`objc.ns() cannot convert value: ${typename}`);
}

// unpack/pack

const js = (object, resultIfUnconverted = jsReturnIfUnconverted) => { // TO DO: what about passing optional function for unpacking dictionary items? see also TODO below
  // object : ObjCObject -- JS values are returned as is
  // resultIfUnconverted : function | value -- if a function, call it and return its result; otherwise return it (default behavior is to return the ObjCObject unchanged)
  let retvalue;
  
//let t = process.hrtime.bigint();
  
//  console.log('calling js()...'+object[constants.__objcObject]+';'+object[constants.__objcInstancePtr]+';')

  if (object === undefined) {
    throw new TypeError('objc.js() expected a value but received: undefined');

  } else if (object === null || object[constants.__objcObject] === undefined) { // return JS values as-is
    retvalue = object;  
      
  } else if (object.isKindOfClass_(getClass('NSString'))) {
    retvalue = object.UTF8String(); // eslint-disable-line new-cap
  
//  } else if (object.isKindOfClass_(getClass('__NSCFBoolean'))) { // TO DO: see below
//    retvalue = object.boolValue();
  
  } else if (object.isKindOfClass_(getClass('NSNumber'))) {
    // TO DO: what about booleans? problem here is NSNumber.objCType is 'c' for both chars and bools, so to determine which it really is requires examining its true (private) class (NSNumber being a class cluster), which is __NSCFBoolean for a boolean; Q. does 'isKindOfClass:NSNumber' return true when value is any member of the NSNumber class cluster?
    retvalue = object.doubleValue();
  
  } else if (object.isKindOfClass_(getClass('NSDate'))) {
    retvalue = new Date(object.timeIntervalSince1970() * 1000);
  
  } else if (object.isKindOfClass_(getClass('NSArray'))) {
    retvalue = []; // TO DO: we could return a Proxy'd Array that encapsulates the ObjC NSArray and an initially lazy JS Array and lazily converts its items from NS to JS on first access (being a Proxy, it should still appear as instanceof Array;challenges:
    // 1. ensuring the Proxy correctly implements all Array properties and methods; and
    // 2. handling Array mutations when the NSArray is immutable (either by copying everything to the JS Array, or by converting the NSArray to NSMutableArray)
    for (const obj of object) {
      retvalue.push(js(obj, true)); // note that the JS Array conversion may be shallow (i.e. items within the NSArray will be converted to JS types if possible but any non-bridged items will remain as ObjCObjects)
    }
  
  } else if (object.isKindOfClass_(getClass('NSDictionary'))) {
    retvalue = {};
    for (const key of object) {
      retvalue[String(key)] = js(object.objectForKey_(key), true); // TO DO: this mapping is highly problematic, as key conversions (for anything except NSString or NSNumber) will be lossy, with no roundtripping, risks of key collisions, and likely unreadable too; if we really want a native JS structure, we might need to define our own with discrete methods for getting/setting/deleting keys (in which case we might be as well to have that wrap the NSDictionary that lazily converts NS keys and values to JS)
    }

  } else {
    retvalue = typeof resultIfUnconverted === 'function' ? resultIfUnconverted(object) : resultIfUnconverted;
  }
  
//console.log(`js(): ${Number(process.hrtime.bigint() - t)/1e9}µs`);
  
  return retvalue;
};



// TO DO: inline everything, working directly with ObjC ptrs, and apply single wrapper at end (the wrapper can be omitted when packing for use in objc_instance_t.set, which only needs the ptr)

const ns = (object, resultIfUnconverted = nsThrowIfUnconverted, returnWrappedObject = true) => {
  let retvalue;
  
//let t = process.hrtime.bigint();

  if (object === undefined) {
    throw new TypeError('objc.ns() expected a value but received: undefined');
  
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
  
  } else if (typeof object === 'object' && object.constructor.name === 'Object') { // Object -> NSDictionary // TO DO: how to guarantee this accepts simple key-value objects only?
    //
    // note: the problem with accepting *any* JS object is anything more complex than simple key-value data is liable to cause data loss and/or packing errors (since, e.g. its methods won't pack), preventing it passing through the ObjC runtime and back to JS in working order; e.g. an object like `{a:1, b:true}` will roundtrip fine (and is obviously the intention here), but `new Foo(…)` won't
    //
    retvalue = getClass('NSMutableDictionary').new();
    for (const key of Object.getOwnPropertyNames(object)) {
      retvalue.setObject_forKey_(object[key], key);
    }
  
  } else if (constants.isBoolean(object)) {
    retvalue = getClass('NSNumber').numberWithBool_(object); // confirm this is appropriate 
    // note: PyObjC seems to treat NSNumber.numberWithBool_ calls as a special case, as it returns a native True/False rather than, say, a <class 'objc.pyobjc_bool'> (I suspect that since a bool->NSNumber conversion is inherently cheap, PyObjC just leaves it until it's packing the arguments for objc_msgSend)
    
  } else {
    return typeof resultIfUnconverted === 'function' ? resultIfUnconverted(object) : resultIfUnconverted;    
  }
  
//console.log(`ns(): ${Number(process.hrtime.bigint() - t)/1e9}µs`);
  
  // for now, unwrap the object to return ptr; once the above code works with ptrs, reverse the logic to add wrapper
  if (!returnWrappedObject) { retvalue = retvalue[constants.__objcObject].ptr; }
  
  return retvalue;
};


module.exports = {ns, js};
