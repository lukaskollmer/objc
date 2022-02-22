// this module defines:
//
// - ObjCClass and ObjCInstance, which wrap raw ObjC class and instance pointers
//
// - wrapMethod, which wraps an ObjC method's pointer in a closure that invokes the method via objc_msgSend(), converting argument and return values to/from ObjC types according to the method's introspected type encodings
//
// - method Proxy, which wraps ObjCClass and ObjCInstance so JS can access their methods by name

// TO DO: dividing the original Instance backing store into separate ObjCClass and ObjCInstance facilitates caching of class and instance methods, but need to make sure this doesn't cause any problems where ObjC treats Class and id pointers interchangeably

// TO DO: there is circular reference between instance and objctypes (instance currently imports objctypes.introspectMethod on first use)

// TO DO: wrap NSArray (and NSDictionary?) instances in custom Proxy objects that implement standard JS Array/Object APIs in addition to ObjC instance methods; this would allow a degree of polymorphism, reducing need to explicitly unpack (with added caveat that proxies around mutable NS objects probably can't cache unpacked items as the NS object's contents may change at any time)


const util = require('util');

const ffi = require('ffi-napi');
const ref = require('ref-napi');

const constants = require('./constants'); 
const runtime = require('./runtime');
const {js} = require('./codecs'); // used in toPrimitive
const Selector = require('./selector');
const ObjCRef = require('./objcref');
const Block = require('./block');


/******************************************************************************/
// ObjCClass cache

// an ObjCClass object is created for each ObjC class that's used, wrapped in a Proxy object that provides access to the ObjC class's methods, and cached for reuse (i.e. always use the accessors below); always use these functions to create class wrappers

// the main reason for separating ObjCClass vs ObjCInstance is so that ObjCClasses can cache all of the (class+instance) method wrappers for that class, as each of those method wrappers is crazy expensive to create; this in turn means that ObjCInstances must keep a reference to their ObjCClass (while ObjCInstance really only needs the instance method cache, it's simplest just to grab the whole thing)

// caution: only ObjCClass objects are cached; ObjCInstance wrappers are always created anew, thus it's possible to have multiple ObjCInstances which share the same pointer; i.e. whereas in ObjC a simple `a == b` pointer comparison is sufficient to determine object identity, JS's `===` can't be used to determine if two ObjCInstances are the same ObjC object; // TO DO: provide dedicated `objc.isSameObject(a,b)` that compares the underlying pointers


// same values, just different lookup keys (`objc.NAME` vs a method wrapper when processing returned ptrs)
const _cachedClassesByName = {}, _cachedClassesByPtr = {};


const getClassByName = name => {
  // used by `objc` proxy to look up classes, e.g. `objc.NSString`
  // name : str -- the name of an ObjC class (this assumes the framework which defines the class is already imported)
  // Result: object | undefined -- an ObjCClass wrapped in its method proxy, or undefined if not found
  let obj = _cachedClassesByName[name];
  if (obj === undefined) {
    const ptr = runtime.objc_getClass(name);
    if (!ptr.isNull()) {
      obj = wrapClass(ptr);
      _cachedClassesByName[name] = obj;
      _cachedClassesByPtr[ptr] = obj;
    }
  }
  return obj;
}

const getClassByPtr = ptr => {
  // used by method proxies to look up the ObjCClass when wrapping a return value as an ObjCInstance
  // ptr : pointer -- an ObjC class
  // Result: object | undefined -- an ObjCClass wrapped in its method proxy, or undefined if not found
  let obj = _cachedClassesByPtr[ptr];
  if (obj === undefined) {
    if (!ptr.isNull()) {
      let name = runtime.class_getName(ptr);
      obj = wrapClass(ptr);
      _cachedClassesByName[name] = obj;
      _cachedClassesByPtr[ptr] = obj;
    }
  }
  return obj;
}


/******************************************************************************/
// ObjC class, instance, and method wrappers


const wrapClass = ptr => {
  // used by getClassByName, getClassByPtr; given an ObjC Class (pointer), wrap it in ObjCClass and method Proxy
  // ptr : pointer -- the underlying ObjC class to be wrapped
  // Result: Proxy(ObjCClass)
  // caution: this only creates the JS wrapper for the ObjC class and does not add it to objc's cache; external callers should use getClassByPtr(ptr), which performs both
  return createMethodProxy(new ObjCClass(ptr));
}

const wrapInstance = ptr => {
  // ptr : pointer -- the underlying ObjC instance to be wrapped
  // Result: Proxy(ObjCInstance)
  return createMethodProxy(new ObjCInstance(getClassByPtr(runtime.object_getClass(ptr)), ptr));
}


const wrapMethod = (objcObject, methodDefinition) => {
  // create a method wrapper bound to a ObjCClass/ObjCInstance
  // objcObject : ObjCObject -- the ObjCClass/ObjCInstance to which this method belongs
  // methodDefinition : object -- see introspectMethod
  // Result: function -- the "method" function that the client code will call, e.g. `NSString.stringWithString_`
  //
  // for efficiency, returned NSString, NSArray, etc are not automatically converted back to JS values, as we have know way of knowing if caller will pass them to another ObjC method, or wants to use them in JS now (if caller specifically wants a JS value back, they need to wrap the method call in a js() function, and likewise apply js() to any out arguments)
  //
  // TO DO: this doesn't support varargs
  //
  // TO DO: somewhat annoyingly, the callObjCMethod function shows as "Proxy.callObjCMethod" in Error call stacks; ideally we want it to show as "NSFoo.bar_baz_" (note also that the Proxy appears to become the function's `this` upon its return from Proxy's `get` handler, which is just typical JS)
  //
  return function callObjCMethod(...args) { // ideally closure would be named after methodDefinition.methodName, but that's tricky; TO DO: we probably could attach a custom inspect that will display method name and argument types
    //console.log('>>callObjCMethod: '+methodDefinition.selector.name)
    //let t = process.hrtime.bigint()
    try {
      let retval = methodDefinition.msgSend(objcObject.ptr, methodDefinition.sel, ...args);
      // update any inout/out arguments (ObjCRefType.set attached before and after pointers and type info)
      if (methodDefinition.inoutIndexes) {
        for (let i of methodDefinition.inoutIndexes) {
          const box = args[i];
          if (box instanceof ObjCRef && !box.__outptr.equals(box.__inptr)) {
            // box.__outptr.readPointer().isNull() // TO DO: do we need a NULL check here?
            box.value = box.__reftype.get(box.__outptr, 0, box.__reftype);
          }
        }
      }
      //console.log('pack res: '+methodName+': '+(Number(process.hrtime.bigint() - t)/1e6))
      //console.log('...callObjCMethod returning: '+ isWrappedObjCInstance(retval));
      return retval;
    } catch (e) {
      
      // TO DO: should this clear any __inptr, __outptr, __reftype values on Ref arguments?
      
      if (args.length != methodDefinition.argc - 2) { // TO DO: this doesn't support varargs
        e = new Error(`Expected ${methodDefinition.argc - 2} arguments, got ${args.length}`);
      }
      // TO DO: catch known errors and throw a new 'ObjCMethodError' error so the stack trace ends here (bugs should still throw stack all the way to source, so should modify existing Error.message and rethrow)
      if (!(e instanceof Error)) { e = new Error(String(e)); }
      // kludge: massage 'bad argument' error message to make it easier to understand
      let msg = e.message.replace(/^error setting argument (\d+)/i, (m, n) => `argument ${n-2}`); // adjust arg no.
      const argTypes = args.map((o) => `[${typeof o === 'object' ? o.constructor.name : typeof o}]`).join(', ');
      const enc = methodDefinition.encoding.replace(/[0-9]/g, '');
      e.message = `${objcObject.name}.${methodDefinition.methodName} expected '${enc}', got (${argTypes}): ${msg}}`;
      //console.log(methodDefinition); // DEBUG
      throw e;
    }
  };
};


/******************************************************************************/
// ObjC class and instance wrappers
// these wrap ObjC class/instance objects and are, in turn, wrapped by Proxies that provide access to their ObjC methods


// TO DO: should ObjCInstance.tojs() include ptr's hex address, to distinguish one instance from another?


// abstract base class; wraps a pointer to an ObjC class or instance

class ObjCObject {
  #__ptr;

  constructor(ptr) {
    this.#__ptr = ptr;
  }
  
  get ptr() { // read-only ptr property is nominally public (being used within objc, and needed when e.g. using NSObjects in CoreFoundation APIs via toll-free bridging)
    return this.#__ptr;
  }
  
	get [Symbol.toStringTag]() {
	  //console.log(`>>toStringTag for ${this.constructor.name}\n${new Error().stack}`);//: ${this.name};`);
    return `${this.constructor.name}=${this.name}`;
  }
  
  [Symbol.toString]() { // TO DO: this returns ObjC's description string, which might not be what we want, but let's see how it goes for now
    return this.__callObjCMethod__('description').UTF8String();
  }
  
  // TO DO: what else needs [re]implemented on ObjCObjects and/or their method Proxy wrapper?
  
  // note that there is no need to reimplement the old `Instance.respondsToSelector()` as the user can test for any method's existence just by asking for it by name and trapping the resulting 'method not found' error (which should really be its own MethodNotFoundError subclass of Error, along with other objc errors); plus, of course, the NSObject protocol already guarantees native ObjC `respondsToSelector:` methods on all classes and instances
  
  [util.inspect.custom]() {
    // console.log('inspecting ObjCObject (constructor='+this.constructor.name+')'); // caution: you'd think the constructor here would be ObjCClass/ObjCInstance, but no: it's Object, the Proxy wrapper which is now bound to `this`
    // TO DO: annoyingly, when util.inspect() is passed the method Proxy, the Proxy's 'get' handler does not intercept the util.inspect.custom key lookup but instead passes it directly to the ObjCObject; therefore, to return a custom inspection string, we have to implement the util.inspect.custom behavior here. But wait, there's more! Just to further confuse, when this inspection method is invoked, its `this` is actually the Proxy, not the ObjCObject, so we have to go back through the Proxy again in order to call the method we actually want, which is `ObjCObject.__callObjCMethod__`, which calls `[NSObject description]` to get the object's ObjC description string.
    //
    // ...and then sometimes it doesn't, as `this` appears to change identity between the Proxy wrapper and the ObjCObject depending on who is calling this method from where (calling through the method wrapper, the Proxy becomes the proxied object's `this` [counterituitive, but probably a special Proxy behavior that's intended]; whereas displaying the returned object in the REPL, `this` is the ObjCObject itself [what would normally be expected]).
    //
    // note: since ObjC descriptions for NSArray, NSDescription, etc traditionally extend over multiple lines, this collapses all whitespace into single spaces to improve density and maintain consistency with JS's traditional bracket notation (toString still returns the original representation)
    return `[objc ${this.__callObjCMethod__('description').UTF8String().replace(/\s+/g, ' ')}]`;
  }
  
  __callObjCMethod__(name, ...args) {
    // an unwrapped ObjCObject can use this to call an ObjC method on itself (caution: external code should always use the method Proxy wrapper, not call __callObjCMethod__ directly)
    // name : string -- the method’s JS name, e.g. 'foo_bar_'
    // args : any -- any arguments to pass to the method
    // Result: ObjCClass | ObjCInstance | null -- a method Proxy-wrapped ObjC object, or null (nil) (note: ObjC objects are not automatically converted back to JS types)
    return (this.cachedMethods[name] || this.bindMethod(name))(...args);
  }
}


// concrete classes representing ObjC objects of types `Class` and `id`

let __introspectMethod = null;


class ObjCClass extends ObjCObject {
  
  constructor(ptr) {
    super(ptr);
    // note: introspecting ObjC methods in order to generate their wrappers is slow
    // cache the wrapped ObjC class methods (also includes internal keys for extracting the instance's C pointer)
    this.cachedMethods = {
      [constants.__objcClassPtr]: ptr,
      [constants.__objcInstancePtr]: null, // not sure about this; need to check ObjC rules on passing a class (Class/'#') where an instance (id/'@') is expected
    };
    // cache the signatures for the class's instance methods (the wrapped ObjC instance methods will be cached in the individual ObjCInstances)
    this.instanceMethodDefinitions = {};
    this.__name = runtime.class_getName(ptr);
  }
  
  introspectMethod(object, methodName) {
    // object : ObjCClass | ObjCInstance
    // methodName : string -- JS-style method name, e.g. "foo_bar_"
    // Result: object -- see objctypes.introspectMethod for details
    if (!__introspectMethod) { __introspectMethod = require('./objctypes').introspectMethod; }
    return __introspectMethod(object, methodName);
  }
  
  get name() {
//  console.log('getting ObjCClass.name = '+this.__name)
    return this.__name;
  }
  
//	get [Symbol.toStringTag]() { // TO DO: this overrides ObjCObject's implementation, but not sure we want to do that
	  //console.log(`>>toStringTag for ${this.constructor.name}\n${new Error().stack}`);//: ${this.name};`);
//    return `objc.${this.name}`; // TO DO: should string tag be literal representation OR non-literal description, e.g. "objc.NSString" or "Wrapped-ObjCClass=NSString"?
//  }
  
  tojs(hint = 'default') { // seems to be Proxy[toPrimitive] that gets called
    // hint : 'number' | 'string' | 'default'
    // Result: number | string
    return hint === 'number' ? Number.NaN : `[ObjCClass: ${this.name}]`; // TO DO: how to represent a class? a parenthesized literal expression might be best, e.g. `(objc.NSString)`, as it is both self-descriptive and can-be copy+pasted+evaluated to recreate it; however, that doesn't work so well with instances, where we'd need to replicate the constructor and arguments as literals as well (we might eventually do that for the bridged Foundation types, but anything else is probably best using the ObjC description string)
  }
  
  objcMethodPtr(sel) { // looks up and returns the C pointer to the specified class method; used by introspectMethod
    return runtime.class_getClassMethod(this.ptr, sel);
  }
  
  bindMethod(methodName) { // create a wrapper for the named ObjC class method and bind it to this ObjClass
    // note: this is  called by method Proxy wrapper, once for each class method used
    let methodDefinition = this.introspectMethod(this, methodName);
    let method = wrapMethod(this, methodDefinition);
    this.cachedMethods[methodName] = method;
    return method;
  }
  
  bindInstanceMethod(instanceObject, methodName) { // this is called once for each instance method
    // instanceObject : ObjCObject -- unwrapped
    // methodName : string
    let methodDefinition = this.instanceMethodDefinitions[methodName];
    if (!methodDefinition) {
      methodDefinition = this.introspectMethod(instanceObject, methodName);
      this.instanceMethodDefinitions[methodName] = methodDefinition;
    }
    return wrapMethod(instanceObject, methodDefinition);
  }
}


class ObjCInstance extends ObjCObject {
  
  constructor(classObject, ptr) {
    // class:Object : Proxy(ObjCClass) -- the wrapped ObjC class of which this is an instance
    // ptr : pointer -- the ObjC instance; caution: this ptr be non-NULL but this is not checked
    super(ptr);
    this.classObject = classObject;
    // cache the wrapped ObjC instance methods (also includes internal keys for extracting the instance's C pointer)
    this.cachedMethods = {
      'class': () => this.classObject, // TO DO: is it good/safe/wise to override the ObjC object's own -class method like this? yes, the caller will want the proxied ObjCClass, but what if ObjC runtime does swizzling (and what about class clusters)? e.g. if true class is __NSCFBoolean, what does -[NSNumber class] return?
      [constants.__objcClassPtr]: null,
      [constants.__objcInstancePtr]: ptr,
    };
  }
  
  get name() {
    return runtime.object_getClassName(this.ptr);
  }
  
  tojs(hint = 'default') { // we won't define [toPrimitive] on ObjCObjects as it all gets very confusing and unhelpful, but the method Proxy's [toPrimitive](hint) calls ObjCObject.tojs(hint)
    // hint : 'number' | 'string' | 'default'
    // Result: number | string
    switch (hint) {
    case 'number':
      return Number.NaN; // TO DO: should handle NSNumber
    case 'string':
      return this[Symbol.toString](); // ObjC description string // for now, this invokes [NSObject description] and returns that ObjC-style string, though we might want to adjust that later to bring it more in line with JS's toPrimitive
    default:
      return this[Symbol.toString](); // TO DO: need exception for NSNumber (not __NSCFBoolean) and NSArray containing a single NSNumber (since JS seems to like reducing `[3]` to `3`); also, should we allow this to return undefined/null, so Proxy can use it for valueOf too? (on returning undefined, the Proxy would return the proxyObject unchanged, which I believe is ther expected behavior for valueOf when it encounters JS objects that can't be reduced to primitives without data loss, whereas toPrimitive always forces objects to string or number and damn all the data loss)
    }
  }
  
  objcMethodPtr(sel) { // looks up and returns the C pointer to the specified instance method; used by bindMethod()
    // sel : Buffer -- pointer to ObjC selector
    // Result : Buffer -- pointer to ObjC method; may be NULL
    return runtime.class_getInstanceMethod(runtime.object_getClass(this.ptr), sel); // TO DO: or constructor could get Class ptr: `this.classPtr = classObject[constants.__objcClassPtr]`? (TBH, I doubt it makes any difference to performance either way)
  }
  
  bindMethod(methodName) {
    // methodName : string
    // Result: function
    // get the method wrapper and bind it to this ObjCInstance
    let method = this.classObject[constants.__objcObject].bindInstanceMethod(this, methodName);
    this.cachedMethods[methodName] = method;
    return method;
  }
}


/******************************************************************************/
// wraps ObjCObjects in a Proxy object that gives JS access to the underlying ObjC methods
// this lazily generates function wrappers for ObjC methods the first time they’re called by client code
// (creating ObjC method wrappers is expensive as libobjc's introspection functions are sloooow)
// note that this wrapper is largely transparent to JS, so e.g. `obj instanceof ObjCInstance` will still return true if obj is a method proxy wrapper around an ObjCInstance (which is what we want)

// TO DO: is there a way to rename Proxy to MethodProxy? (we don't really want to call the function MethodProxy as it's not a `new`-based constructor, even though it constructs an object, and there's good reason for es-lint wanting to associate CapNames with `new` constructors for visual consistency [ignoring entrenched warts such as `Date()`])

// TO DO: to what extent can NSNumber, NSString, NSDate, NSArray, NSDictionary ObjCInstances be made interchangeable with corresponding JS types (boolean/Number, String, Date, Array, object)? e.g. can `nsString + toDescription`, `toDescription + nsString`, and `nsString + nsString` all be made to work the same as `toDescription + toDescription`, or are we going to hit a wall with JS's cranky type system (i.e. while JS's string primitives are non-objects, it also provides String objects, so if we can masquerade an NSString as one of those - and likewise for Date, Array, and object (NSNumbers are not as common so we could live with the discrepancy there, although toPrimitive should reduce it) - then this reduces the need for user to call obj.js())



const createMethodProxy = obj => {
  // wrap an ObjCObject in a Proxy that converts property lookups to ObjC method lookups, e.g. `foo.some_method_(1,2)` will return an ObjC method wrapped in a callObjCMethod function so that when that function is called the underlying ObjC method is invoked, `[foo some:1 method:2]`
  // obj : ObjCObject -- the ObjC class/instance wrapper
  // Result : Proxy(ObjCObject)
  //
  // important: to access the underlying ObjCObject from outside the Proxy, use `foo[constants.__objcObject]` (where `foo` is a Proxy-wrapped ObjCObject, e.g. the `objc.NSString` class, or an instance of that class)
  //
  // important: to access the underlying ObjC pointer, use `foo[constants.__objcObject].ptr`, `foo[constants.__objcClassPtr]`, or `foo[constants.__objcInstancePtr]`
  //
  // As a rule, client code should not need to access the underlying ObjCObject or ObjC pointer, except when working with ffi directly, e.g. when calling a C function that takes a `Class` or `id` argument (i.e. the underlying ObjC pointer); it is also possible to call CoreFoundation functions passing a toll-free-bridged ObjC pointer where a CFTYPERef is expected, caveat ownership remains with ObjC's ARC (transferring ObjC object ownership to/from CF's manual refcounting is left as an exercise to brave/expert/foolhardy readers)
  //
  if (!(obj instanceof ObjCObject)) {
    throw new Error(`createMethodProxy expected an ObjCObject but received ${typeof obj}: ${String(obj)}`);
  }
  return new Proxy(obj, { // note: no way to customize the Proxy's name, unfortunately, or we'd name it MethodProxy so that it's easy to identify in stack traces
    get: function(objcObject, methodName, proxyObject) {
      
 //     console.log(`method Proxy is looking up ${typeof methodName}: ${String(methodName)}…`);
      
      // 1. see if there's already a method wrapper by this name (this also handles __objcClassPtr/__objcInstancePtr)
      let method = objcObject.cachedMethods[methodName];
//      console.log('getting method: `'+String(methodName)+'`: '+typeof method);
      // note: method = null for __objcClassPtr key if objcObject is ObjCInstance, or null for __objcInstancePtr key if objcObject is ObjCClass; for any other key, it will be a function or undefined (this allows __objcTYPEPtr lookups to bypass the switch block below, and it's slightly simpler to put those 2 keys in cachedMethods than in switch block)
      if (method === undefined) {
        
        
        
        /* TO DO: this is proper weird bug:
        
        Error: FUBAR
          at Object.get (/Users/has/dev/javascript/objc/src/instance.js:602:77)
          at Proxy.[nodejs.util.inspect.custom] (/Users/has/dev/javascript/objc/src/instance.js:347:40)
          at formatValue (node:internal/util/inspect:763:19)
          at inspect (node:internal/util/inspect:340:10)
          at formatWithOptionsInternal (node:internal/util/inspect:2006:40)
          at formatWithOptions (node:internal/util/inspect:1888:10)
          at console.value (node:internal/console/constructor:323:14)
          at console.log (node:internal/console/constructor:359:61)
          at AppData.pack (/Users/has/dev/javascript/nodeautomation/lib/aeappdata.js:890:14)
          at Object.packObjectSpecifier [as pack] (/Users/has/dev/javascript/nodeautomation/lib/aeselectors.js:71:44)
        */
        if (methodName === 'function toString() { [native code] }') { throw new Error('BUG: methodName: '+methodName) }

        
        
        //console.log('…method not found, so SWITCH on special keys…')
        
    // TO DO: need to check this to be sure, but when forwarding a method lookup directly to objcObject, it may be best to return a function that closes over objcObject and perform the forwarding there, as returning the objcObject's method directly seems to rebind its `this` to the Proxy (I think, or I might've confused myself while figuring this stuff out)

        
        // 2. next, deal with special cases (Symbol keys)
        switch (methodName) {
        case constants.__objcObject:
          //console.log('unwrapping objcObject (key __objcObject)')
          return objcObject;
        
        case '__callObjCMethod__': // TO DO: make this a Symbol? or can we live with one "magic method" exposed as string? (fairly sure ObjC doesn't use double underscores in any method names; and if there was an ObjC method named `_call_` then it’d have zero extra arguments whereas this has at least one, so any collision will soon be resolved by something barfing an error)
          return (name, ...args) => objcObject.__callObjCMethod__(name, ...args);
          
        // TO DO: should be able to delete the next 2 cases now, as cachedMethods lookup will always return these
        case constants.__objcClassPtr:
        case constants.__objcInstancePtr:
          console.log(`Warning: method Proxy 'switch' is getting ${methodName} property`);
          return objcObject.cachedMethods[methodName];
        
        case 'constructor':
          console.log('BUG: looking up "constructor" on method Proxy\n'+(new Error().stack)+'\n\n')
          break;
        
        // inspection/coercion
        
        case util.inspect.custom:
          //console.log(`returning function for method Proxy's util.inspect.custom`)
          return (depth, options) => {
            //console.log(`calling method Proxy's returned util.inspect.custom function`)
            /*
              TO DO: return a formatted string representation of object's structure; see:
            
              https://nodejs.org/dist./v8.14.1/docs/api/util.html#util_util_inspect_object_options

              // may want to call util.inspect(objcObject), allowing it to show more details (e.g. its ObjC description)
              
            */
            return `[${proxyObject[Symbol.toStringTag]}]`;
          }
          
  //      case Symbol.valueOf: // TO DO: IIRC, valueOf should return objcObject as a JS primitive (e.g. string, number, array) if a lossless conversion is available, otherwise it should return objcObject as-is
 
        case Symbol.toString: // TO DO: do we also need to define 'toString' and 'toPrimitive' as strings (pretty sure toPrimitive only needs defined as symbol; what about toString)? or does JS runtime/Proxy automatically recognize those names and convert them from strings to symbols?
          //console.log('returning Proxy[toString] function')
          return () => {
            //console.log('calling Proxy[toString] function')
            objcObject.toPrimitive('string'); // quick-n-dirty
          }
        case Symbol.toStringTag: // describes the ObjC object's construction, including presence of method Proxy wrapper; JS will call this when generating its '[object TAG]' representation
          //console.log('calling Proxy[toStringTag]')
          return `Wrapped-${objcObject[Symbol.toStringTag]}`; // TO DO: how best to indicate wrapper's addition? parens/brackets/braces/'wrapped-'?
        case Symbol.toPrimitive: // caution: while we'd like this switch block to return the ObjCObject's method directly, JS's Here Be Dragons implementation (which might be aided and abetted here by Proxy's own special behavior) means that if we return the toPrimitive method directly, JS treats that method's `this` as now bound to this Proxy, not to the class that actually owns that method; which is to say, at least within the Proxy's implementation, don't grab methods off the proxied objects (in this case the wrapped ObjCObject) and pass them around like closures because, while that sort of thing works perfectly in the likes of Python, JS makes an absolute arse of it
          // TO DO: for now, only ObjCClass implements its own toPrimitive; once we have optimized NS<->JS converter functions that work on __ptrs directly, ObjCInstance[Symbol.toPrimitive] can use that to convert itself directly, but for now js() needs the method wrapper to work so we have to call it from here
          // TO DO: when determining if a non-boolean object is equivalent to boolean true or false, does JS call toPrimitive? ideally an empty NSString or an NSNumber whose value is False/0/0.0 would also appear false-equivalent to JS; e.g. in Python, objects can implement a 'magic' __bool__ method if they wish to appear as True or False equivalent (any objects that don't implement __bool__ are always equivalent to True), and this is used by PyObjC's NSNumber, NSString, NSArray, and NSDictionary proxies to make those appear False equivalent when 0 or empty (i.e. consistent with its native 0, "", [], and {} values)
            //console.log('returning toPrimitive closure for '+objcObject.constructor.name)
                        
          return (hint => {
            // hint : 'number' | 'string' | 'default'
            // Result: number | string
            //console.log('...calling toPrimitive('+hint+') closure for '+this.constructor.name+' = '+objcObject[Symbol.toStringTag])

            //console.log('proxyObject is a wrapped ObjCInstance: '+isWrappedObjCInstance(proxyObject))
            //console.log('proxyObject is an unwrapped ObjCInstance: '+(proxyObject instanceof ObjCInstance))
  
            if (objcObject instanceof ObjCClass) {
              return objcObject.tojs(hint);
            }
            let obj = js(proxyObject, true); // quick-n-dirty (it is simpler to convert the ObjCInstance to JS value and have JS convert that, rather than go straight from ObjCInstance to JS retval - which would require replicating JS's own convoluted rules here); note: this should be non-strict, as unconvertible values will be turned below; that said, js() will be more efficient once it maps the ObjC ptr for NSString, NSNumber, etc directly to their corresponding JS types, as JS will already be quite efficient at getting those JS objects' string/number representation (although I wonder why it only does those and not 'boolean' too; but…JS)
            //console.log('tried converting to js => '+typeof obj)
            // first, deal with any types that must/can be reduced to numbers...
            if (hint === 'number' || (hint === 'default' && (constants.isBoolean(obj) || constants.isNumber(obj)))) {
              return Number(obj); // returns NaN for objects that can't be converted to numbers; this is expected behavior (thus, any ObjCObjects that get to here, will return NaN)
            // ...now deal with string representations; first, ObjCInstance...
            } else if (obj !== undefined && obj !== null && obj[constants.__objcInstancePtr]) { // null or undefined = not a wrapped ObjCInstance
              // we need to handle ObjCInstances here, so we can call their -[NSObject description] to get a nice descriptive Cocoa-style string, which is typically of the format '<NSSomeClass address-or-other-identifying-info>', e.g. "[<NSWorkspace: 0x600000b186c0>]"; we then wrap this string in square brackets as is the JS tradition, and hope that users don't mistake the result for a single-item Array (we might want to work on ObjC instance representations some more later on)
              //console.log('getting unconvertible ObjCInstances ObjC description')
              return `[${proxyObject.description().UTF8String()}]`; // 
            // ...and finally, ObjCClasses (which can stringify themselves) and JS values are left for JS to stringify
            } else {
              //console.log('…toPrimitive returning JS string: '+ typeof obj)
              return String(obj); // let JS do its own formatting of native JS values; this will also format (just to be JS-awkward, Array doesn't appear to have a Symbol.toPrimitive method, so I’m guessing JS runtime calls its toString method which it does have)
            }
          });
          
          
          case Symbol.iterator: // TO DO: what if objcObject is already an enumerator? (A. it will fall through to the 'non-enumerable' error below, same as for all other types)
            let enumerator;

            if (proxyObject.isKindOfClass_(getClassByName('NSArray')) 
                || proxyObject.isKindOfClass_(getClassByName('NSSet'))) {
              enumerator = proxyObject.objectEnumerator();
            } else if (proxyObject.isKindOfClass_(getClassByName('NSDictionary'))) {
              // TO DO: can we achieve `Object.entries()` compatibility/equivalency? - I assume the Object.entries() generator applies the extra operations (get next key, get value for key, yield [key,value] array) in:
              //
              //  for (const [key, value] of Object.entries(obj)) {...}
              //
              // however, that will be using JS's object keys, which would collide with method names if we made JS's [] operator polymorphic to look up the dictionary's values as well as its methods (and are too limited in the types they can represent in any case); TBH, the answer is "no", and if user wants to iterate both keys and values they should use the appropriate ObjC methods
              enumerator = proxyObject.keyEnumerator();
            } else {
              throw new Error(`Can't iterate over non-enumerable type ${objcObject.class()}`);
            }

            return function * objcEnumerator() {
              let nextObject;
              while ((nextObject = enumerator.nextObject()) && nextObject !== null) {
                yield nextObject;
              }
            };
          // default: best to fall-thru here, in case an above case needs to break instead of return
        }
        
        // 3. anything else is either an unsupported Symbol key or a string, which is assumed to be the name of an ObjC method which has not previously been used so will be looked up (and also cached for resuse) now
        if (!constants.isString(methodName)) { // TO DO: forward all symbol key lookups to underlying ObjCObject? (need to check who owns `this`; also, above switch block may still want/need to handle symbol keys itself)
     //   return objcObject[methodName]
          return undefined; // we can't just return objcObject[methodName] as those methods' `this` appears to rebind to Proxy, resulting in incorrect behavior
//          console.log("proxy did not find ${String(methodName)}")
//          return undefined; // if methodName is a symbol, it can't be an ObjC method, and it's not one of the known special keys, so return it // caution: nodeautomation (and probably other libraries) check for object.NAME returning undefined as part of their type checking/internal access, so throwing here will break their assumption that non-existent = undefined
        }
        method = objcObject.bindMethod(methodName); // TO DO: this will throw if name not found
      }
      
//console.log('lookup '+methodName+': '+(Number(process.hrtime.bigint() - t)/1e6))
      
      // 4. return the result 
      return method;
    },
    
    set: function(objcObject, methodName, _) {
     throw new Error(`method Proxy cannot set ${objcObject}.${key}`);
    }
  });
}


const isWrappedObjCObject = object => object && object[constants.__objcObject] !== undefined;

const isWrappedObjCClass = object => {
  if (!object) { return false; }
  let ptr = object[constants.__objcClassPtr];
  return ptr !== undefined && ptr !== null;
}

const isWrappedObjCInstance = object => {
  if (!object) { return false; }
  let ptr = object[constants.__objcInstancePtr];
  return ptr !== undefined && ptr !== null;
}


/******************************************************************************/


module.exports = {

  // important: external callers must always use `wrapClass`/`wrapInstance`/`wrap` to convert an ObjC object ptr to a correctly wrapped ObjCClass/ObjCInstance, and ensure its class is correctly registed in the internal cache
  getClassByName,
  getClassByPtr,
  wrap: ptr => (runtime.object_isClass(ptr) ? getClassByPtr(ptr) : wrapInstance(ptr)),
  wrapClass: getClassByPtr,
  wrapInstance,
  
  createMethodProxy, // used by ./codecs
  
  // these internal classes are exported here for [largely internal] type-checking; external code should not instantiate them directly
  ObjCObject,
  ObjCClass,
  ObjCInstance,
  
  // note: these type-checking functions check for an ObjCObject that is wrapped in its method Proxy, which is what user code should normally interact with (users should not interact with the unwrapped objects, C ptrs, etc unless they really know what they're doing and why they need to do it)
  // e.g. to check for an unwrapped ObjCInstance: `(object instanceof ObjCInstance && !isWrappedObjCInstance(object))`
  isWrappedObjCObject,
  isWrappedObjCClass,
  isWrappedObjCInstance,
  
  keyObjCObject: constants.__objcObject, // symbol key for extracting an ObjCObject from its method Proxy wrapper
  
  // objc exports instance module as objc.__internal__, so export low-level runtime and types modules on that
  runtime,
  
  [util.inspect.custom]: (depth, inspectOptions, inspect) => '[object objc.__internal__]',
};
