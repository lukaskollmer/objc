/* eslint-disable no-multi-assign */

// ns, js functions for converting the standard JS types to their NS equivalents and back

// note: mutable JS values (arrays, objects) are converted to their immutable NS counterparts

// TO DO: once the behavior of ns() and js() is finalized, performance optimize them as much as possible as converting to and from standard JS types will be a significant bottleneck; e.g. bypass ./instance.js's high-level wrappers and use the ffi APIs directly, (since there's only a half-dozen JS types to bridge, it's worth the extra coding); much of the safety checks that are performed when user calls arbitrary methods with arbitrary arguments can be skipped; as well as bypassing at least some of ./instance.js's class and method wrappers (with their associated overheads, particularly when packing/unpacking arrays and dictionaries), it might even be possible to skip some of the ObjC dynamic dispatch (objc_msgSend itself is very fast, but our wrapper code around it adds its own non-trivial overhead) and assign the classes and methods' underlying C pointers to consts and use those directly with FFI APIs


const {__isObjCObject} = require('./constants');
const Selector = require('./selector');



// curse you, circular references
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

const js = (object, returnInputIfUnableToConvert = false) => { // TO DO: recommend making the default true, i.e. if object can't be converted to a standard JS type then return it as-is (all ObjCObjects are still JS objects) // TO DO: should there be an additional option for shallow vs deep unpacks? currently js(object,false) only guarantees shallow unpacking, as items within the resulting JS Array/object can still be ObjC objects
  let retvalue;
  
//let t = process.hrtime.bigint();
  
  if (object.isKindOfClass_(getClass('NSString'))) {
    retvalue = object.UTF8String(); // eslint-disable-line new-cap
  
  } else if (object.isKindOfClass_(getClass('NSNumber'))) {
    // TO DO: what about booleans? problem here is 'c' type and __NSCFBoolean
    retvalue = object.doubleValue();
  
  } else if (object.isKindOfClass_(getClass('NSDate'))) {
    retvalue = new Date(object.timeIntervalSince1970() * 1000);
  
  } else if (object.isKindOfClass_(getClass('NSArray'))) {
    retvalue = [];
    for (const obj of object) {
      retvalue.push(js(obj, true)); // note that the JS Array conversion may be shallow (i.e. items within the NSArray will be converted to JS types if possible but any non-bridged items will remain as ObjCObjects)
    }
  
  } else if (object.isKindOfClass_(getClass('NSDictionary'))) {
    retvalue = {};
    for (const key of object) {
      retvalue[String(key)] = js(object.objectForKey_(key), true);
    }

  } else {

    // Return null if there's no JS counterpart for the objc type // TO DO: unconvertable objects should either return as-is or throw a "can't convert ${object.class}"; returning null, while it appears to replicate ObjC’s standard behavior where methods returning nil to indicate an error occurred, is ambiguous as it does not distinguish between that "the value is a nil" and "threw away data cos it couldn't be translated"; also, bear in mind that when an ObjC object doesn't recognize a message, e.g. `[(id)object doubleValue]`, the ObjC runtime raises a fatal 'unrecognized selector' exception - which might be the better analogy here
    retvalue = returnInputIfUnableToConvert ? object : null;
  }
  
//console.log(`js(): ${Number(process.hrtime.bigint() - t)/1e9}µs`);
  
  return retvalue;
};



const ns = (object) => {
  let retvalue;
  
//let t = process.hrtime.bigint();
  
  if (object === null || object === undefined || object[__isObjCObject]) { // TO DO: should `undefined` be treated as an argument type error?
    retvalue = object;
    
  } else if (typeof object === 'string' || object instanceof String) { // String -> NSString
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
    
  } else if (typeof object === 'number') { // Number -> NSNumber
    retvalue = getClass('NSNumber').numberWithDouble_(object);
  
  } else if (typeof object === 'object') { // Object -> NSDictionary // TO DO: problem with this is that presumably any JS object except String, Date, Array will end up here, and if that object is anything other than simple key-value data then it is going to discard parts of that object, preventing it passing through the ObjC runtime and back to JS in working order; e.g. an object like `{a:1, b:true}` will roundtrip fine, but `new Foo(…)` won't
    retvalue = getClass('NSMutableDictionary').new();
    for (const key of Object.getOwnPropertyNames(object)) {
      retvalue.setObject_forKey_(object[key], key);
    }
  
  } else if (typeof object === 'boolean') {
    retvalue = getClass('NSNumber').numberWithBool_(object); // confirm this is appropriate 
    // note: PyObjC seems to treat NSNumber.numberWithBool_ calls as a special case, as it returns a native True/False rather than, say, a <class 'objc.pyobjc_bool'> (I suspect that since a bool->NSNumber conversion is inherently cheap, PyObjC just leaves it until it's packing the arguments for objc_msgSend)
    
  } else {
    // Return null if there's no objc counterpart for the js type // TO DO: shouldn't this throw? (alternatively, it might be possible to wrap JS-only values in an opaque NSValue, allowing them to pass through ObjC APIs unchanged, although there are probably issues there with JS's GC not knowing the value is non-collectable)
    retvalue = null;
  }
  
//console.log(`ns(): ${Number(process.hrtime.bigint() - t)/1e9}µs`);

  return retvalue;
};


module.exports = {ns, js};
