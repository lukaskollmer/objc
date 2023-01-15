/* eslint-disable no-multi-assign */

// ns, js functions for converting the standard JS types to their NS equivalents and back

// TO DO: bridge NSSet<->Set and NSDictionary<->Map

// TO DO: should js() unpack NSDictionary to Map by default, with an optional flag to unpack as Object instead?

'use strict';

const ffi = require('ffi-napi');
const ref = require('ref-napi');

const constants = require('./constants');
const runtime = require('./runtime');
const Selector = require('./selector');

const pointerType = ref.refType(ref.types.void);


/******************************************************************************/
// cache


let ObjCInstance, createMethodProxy;
let NSString, cptr_NSString, sel_stringWithUTF8String_, m_stringWithUTF8String_;
let NSNumber, cptr_NSNumber, sel_numberWithDouble_, m_numberWithDouble_;
let NSCFBoolean, nsTrue, nsFalse, iptr_true, iptr_false;
let NSDate, cptr_NSDate, sel_dateWithTimeIntervalSince1970_, m_dateWithTimeIntervalSince1970_;
let NSArray, NSMutableArray, cptr_NSMutableArray, sel_array, m_array, sel_addObject_, m_addObject_;
let NSDictionary, NSMutableDictionary, cptr_NSMutableDictionary, sel_dictionary, m_dictionary, 
                                                                 sel_setObject_forKey_, m_setObject_forKey_;


function initialize() {
  const instance = require('./instance');
  ObjCInstance = instance.ObjCInstance;
  createMethodProxy = instance.createMethodProxy;
  
  NSString = instance.getClassByName('NSString');
  cptr_NSString = NSString[constants.__objcClassPtr];
  sel_stringWithUTF8String_ = runtime.sel_getUid('stringWithUTF8String:');
  m_stringWithUTF8String_ = ffi.ForeignFunction(runtime.objc_msgSend,
                                                         pointerType, [pointerType, pointerType, ref.types.CString]);
  
  NSNumber = instance.getClassByName('NSNumber');
  cptr_NSNumber = NSNumber[constants.__objcClassPtr];
  sel_numberWithDouble_ = runtime.sel_getUid('numberWithDouble:');
  m_numberWithDouble_ = ffi.ForeignFunction(runtime.objc_msgSend,
                                                         pointerType, [pointerType, pointerType, ref.types.double]);
  
  // caution: because ObjCInstance overrides ObjC's own -class method, these will report nsTrue/nsFalse.class() as `NSNumber`, as opposed to its true class, which is __NSCFBoolean
  NSCFBoolean = instance.getClassByName('__NSCFBoolean');
  nsTrue = NSCFBoolean.numberWithBool_(true);
  nsFalse = NSCFBoolean.numberWithBool_(false);
  iptr_true = nsTrue[constants.__objcInstancePtr];
  iptr_false = nsFalse[constants.__objcInstancePtr];
  
  NSDate = instance.getClassByName('NSDate');
  cptr_NSDate = NSDate[constants.__objcClassPtr];
  sel_dateWithTimeIntervalSince1970_ = runtime.sel_getUid('dateWithTimeIntervalSince1970:');
  m_dateWithTimeIntervalSince1970_ = ffi.ForeignFunction(runtime.objc_msgSend,
                                                         pointerType, [pointerType, pointerType, ref.types.double]);
  
  NSArray = instance.getClassByName('NSArray');
  NSMutableArray = instance.getClassByName('NSMutableArray');
  cptr_NSMutableArray = NSMutableArray[constants.__objcClassPtr];
  sel_array = runtime.sel_getUid('array');
  m_array = ffi.ForeignFunction(runtime.objc_msgSend, pointerType, [pointerType, pointerType]);
  sel_addObject_ = runtime.sel_getUid('addObject:');
  m_addObject_ = ffi.ForeignFunction(runtime.objc_msgSend, ref.types.void, [pointerType, pointerType, pointerType]);
  
  NSDictionary = instance.getClassByName('NSDictionary');
  NSMutableDictionary = instance.getClassByName('NSMutableDictionary');
  cptr_NSMutableDictionary = NSMutableDictionary[constants.__objcClassPtr];
  sel_dictionary = runtime.sel_getUid('dictionary');
  m_dictionary = ffi.ForeignFunction(runtime.objc_msgSend, pointerType, [pointerType, pointerType]);
  sel_setObject_forKey_ = runtime.sel_getUid('setObject:forKey:');
  m_setObject_forKey_ = ffi.ForeignFunction(runtime.objc_msgSend, ref.types.void, [pointerType, pointerType, 
                                                                                   pointerType, pointerType]);
  
  return module.exports;
}


/******************************************************************************/
// handler functions for unconverted values


const jsReturnIfUnconverted = object => object;


const nsThrowIfUnconverted = (object) => {
  const typename = typeof object === 'object' ? object.constructor.name : typeof object;
  throw new TypeError(`objc.ns() cannot convert value: ${typename}`);
}


/******************************************************************************/
// unpack

const js = (object, resultIfUnconverted = jsReturnIfUnconverted) => {
  // object : ObjCObject -- JS values are returned as is
  // resultIfUnconverted : function | value -- if a function, call it and return its result; otherwise return it (default behavior is to return the ObjCObject unchanged)
  let retvalue;
  if (object === undefined) {
    throw new TypeError('objc.js() expected a value but received: undefined');

  } else if (object === null || object[constants.__objcObject] === undefined) { // return JS values as-is
    retvalue = object;  
      
  } else if (object.isKindOfClass_(NSString)) {
    retvalue = object.UTF8String(); // eslint-disable-line new-cap
  
  } else if (object.isKindOfClass_(NSCFBoolean)) { // TO DO: this doesn't seem to be matching
    retvalue = object.boolValue();
  
  } else if (object.isKindOfClass_(NSNumber)) { // TO DO: check how this behaves
    retvalue = object.doubleValue();
  
  } else if (object.isKindOfClass_(NSDate)) {
    retvalue = new Date(object.timeIntervalSince1970() * 1000);
  
  } else if (object.isKindOfClass_(NSArray)) {
    retvalue = []; // TO DO: we could return a Proxy'd Array that encapsulates the ObjC NSArray and an initially lazy JS Array and lazily converts its items from NS to JS on first access (being a Proxy, it should still appear as instanceof Array). This might be quicker than immediately converting all items to JS, assuming the JS code only needs some of the values. Challenges:
    // 1. ensuring the Proxy correctly implements all Array properties and methods; and
    // 2. handling Array mutations when the NSArray is immutable (either by copying everything to the JS Array, or by converting the NSArray to NSMutableArray)
    for (const obj of object) {
      retvalue.push(js(obj, true)); // note that the JS Array conversion may be shallow (i.e. items within the NSArray will be converted to JS types if possible but any non-bridged items will remain as ObjCObjects)
    }
  
  } else if (object.isKindOfClass_(NSDictionary)) {
    retvalue = {};
    for (const key of object) {
      retvalue[String(key)] = js(object.objectForKey_(key), true); // caution: mapping NSDictionary to Object is problematic, as NS-to-JS key conversions for numbers and other non-string values will be lossy and/or ambiguous, e.g. @"3" and @3 will be the same key in an Object (although will be different in a Map); it might be better to unpack as Map by default
    }

  } else {
    retvalue = typeof resultIfUnconverted === 'function' ? resultIfUnconverted(object) : resultIfUnconverted;
  }
  return retvalue;
};


/******************************************************************************/
// pack

const ns = (object, resultIfUnconverted = nsThrowIfUnconverted, returnPtr = false) => {
  // object : any
  // nsThrowInUnconverted : function -- callback invoked if the given object is not bridged to ObjC
  // returnPtr : boolean -- if false, result is a wrapped ObjCInstance or null; if true, result is a raw Buffer pointer (i.e. the wrapping step is skipped); this is used internally when recursively packing Array/Object items into an NSArray/NSDictionary
  // Result: ObjCInstance | null -- the wrapped object; or raw Buffer if returnPtr is true
  let classObject, ptr;
  
  // TO DO: can any of the following ObjC instantiations fail (i.e. return nil)? if so, add NULL ptr checks and throw a descriptive Error if the JS value failed to pack as an NS object

  if (object === undefined) {
    throw new TypeError('objc.ns() expected a value but received: undefined');
  
  } else if (object === null) {
    return returnPtr ? ref.NULL : null; // returns a NULL pointer buffer if returnPtr is true, else null
    
  } else if (object[constants.__objcObject]) {
    return returnPtr ? object[constants.__objcObject].ptr : object;
    
  } else if (constants.isString(object)) { // String -> NSString
    classObject = NSString;
    ptr = m_stringWithUTF8String_(cptr_NSString, sel_stringWithUTF8String_, object);
    
  } else if (constants.isNumber(object)) { // Number -> NSNumber
    classObject = NSNumber;
    ptr = m_numberWithDouble_(cptr_NSNumber, sel_numberWithDouble_, object);

  } else if (object === true) {
    return returnPtr ? iptr_true : nsTrue;
  
  } else if (object === false) {
    return returnPtr ? iptr_false : nsFalse;
  
  } else if (object instanceof Date) { // Date -> NSDate
    const seconds = Number(object) / 1000;
    classObject = NSDate;
    ptr = m_dateWithTimeIntervalSince1970_(cptr_NSDate, sel_dateWithTimeIntervalSince1970_, seconds);
    
  } else if (Array.isArray(object)) { // Array -> NSArray
    classObject = NSMutableArray;
    ptr = m_array(cptr_NSMutableArray, sel_array);
    try {
      for (let item of object) {
        m_addObject_(ptr, sel_addObject_, ns(item, nsThrowIfUnconverted, true));
      }
    } catch (e) {
      console.log('objc.ns had problem packing Array into NSArray: ', e)
      if (e instanceof TypeError) {
        return resultIfUnconverted === 'function' ? resultIfUnconverted(object) : resultIfUnconverted;
      } else {
        throw e;
      }
    }
  
  } else if (typeof object === 'object' && object.constructor.name === 'Object') { // Object -> NSDictionary
    // note: the problem with accepting *any* JS object is anything more complex than simple key-value data is liable to cause data loss and/or packing errors (since, e.g. its methods won't pack), preventing it passing through the ObjC runtime and back to JS in working order; e.g. an object like `{a:1, b:true}` will roundtrip fine (and is obviously the intention here), but `new Foo(…)` won't; therefore 1. check that the object's constructor is "Object", 2. be specific in iterating property names, and 3. treat the entire object as unconverted if any of its values fail to pack
    //
    classObject = NSMutableDictionary;
    ptr = m_array(cptr_NSMutableDictionary, sel_dictionary);
    try {
      // note: keys are not 100% roundtripped, as JS objects keys are limited to string/symbol whereas NSDictionary keys can be any hashable object, e.g. NSString, NSNumber
      for (let key of Object.getOwnPropertyNames(object)) {
        if (!constants.isString(key)) { throw new TypeError(`Non-string keys are not supported: '${String(key)}'`); }
        m_setObject_forKey_(ptr, sel_setObject_forKey_, ns(object[key], nsThrowIfUnconverted, true),
                                 m_stringWithUTF8String_(cptr_NSString, sel_stringWithUTF8String_, key));
      }
    } catch (e) {
      console.log('objc.ns had problem packing Object into NSDictionary: ', e)
      if (e instanceof TypeError) {
        return resultIfUnconverted === 'function' ? resultIfUnconverted(object) : resultIfUnconverted;
      } else {
        throw e;
      }
    }
  
  } else {
    return typeof resultIfUnconverted === 'function' ? resultIfUnconverted(object) : resultIfUnconverted;    
  }
  return returnPtr ? ptr : createMethodProxy(new ObjCInstance(classObject, ptr));
};


/******************************************************************************/


module.exports.initialize = initialize;
module.exports.ns = ns;
module.exports.js = js;

