#!/usr/bin/env node 

const objc = require('objc')

/*
Here's the error that was throwing when the method Proxy, on receiving a Symbol.toPrimitive key, tried to return self[Symbol.toPrimitive] - the resulting method's 'this' was being rebound to the Proxy, not to the ObjCClass which actually owned that method; the solution is for the Proxy always to return a function closure that it creates itself, which correctly captures the underlying ObjCObject as 'self', because 'this' cannot be left to its own devices - whether due to Proxy's own magic behavior or JS's general sloppiness as to what 'this' actually points to in any given context - 

method Proxy is looking up symbol: Symbol(Symbol.toPrimitive)
switching on toPrimitive
found it
method Proxy is looking up symbol: Symbol(__objcObject)
/Users/has/dev/javascript/objc/src/instance.js:380
      throw new Error(`BUG: ObjCClass[Symbol.toPrimitive] thinks 'this' is a method Proxy, not itself`);
      ^

Error: BUG: ObjCClass[Symbol.toPrimitive] thinks 'this' is a method Proxy, not itself
    at Proxy.[Symbol.toPrimitive] (/Users/has/dev/javascript/objc/src/instance.js:380:13)
    at Object.<anonymous> (/Users/has/dev/javascript/objc/test/test-js.js:9:27)
    at Module._compile (node:internal/modules/cjs/loader:1101:14)
    at Object.Module._extensions..js (node:internal/modules/cjs/loader:1153:10)
    at Module.load (node:internal/modules/cjs/loader:981:32)
    at Function.Module._load (node:internal/modules/cjs/loader:822:12)
    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:81:12)
    at node:internal/main/run_main_module:17:47

*/

//objc.NSString.blahBlah
//console.log()

console.log(`class representation: '${objc.NSString}'`) // "[ObjCClass: NSString]" -- this is currently returned by ObjCClass.tojs()

//console.log(Boolean) // [Function: Boolean]
class Foo extends Array {}
console.log(Foo) // [class Foo extends Array]
class Bar {}
console.log(Bar) // [class Bar]


// console.log(objc.NSData.data()) // this needs workΩ as it's returning a raw inspection string of the ObjCInstance and its contents, which is NOT what we want to display

let s = objc.NSString.stringWithString_('a test string')

// console.log(s) // this is raw inspect string (eventually we should implement [util.inspect.custom] methods that return a shorter, neater,friendlier representation)

console.log(`${s}`) // 'a test string'



// TO DO: getting representations seems to require an excessive number of ObjC method calls for what it does (objc.js is a particularly bad offender, for obvious reasons, though bouncing around toString,toStringTag,toPrimitive,etc does too)

let v = 44

v = objc.NSMutableArray.arrayWithObject_(v)

v = objc.ns(v)

v.addObject_(objc.NSAppleScriptErrorAppName)

console.log('v is ObjC instance = '+objc.isInstance(v))
console.log(`test-js: instance representation = '${v}'`) // "[ObjCInstance NSString]"


