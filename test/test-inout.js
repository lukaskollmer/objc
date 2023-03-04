#!/usr/bin/env node 

const ref = require('ref-napi')
const objc = require('objc')

//let v = objc.NSString.stringWithString_('')


objc.defineStruct('{AEDesc="descriptorType"I"dataHandle"?}');

// <opaque name='AEDataStorageType' type64='^{OpaqueAEDataStorageType=}'/>
objc.defineStruct('{OpaqueAEDataStorageType=}');


let desc = objc.NSAppleEventDescriptor.descriptorWithString_('test')

//console.log(desc.aeDesc())

const ptrType = ref.refType(ref.types.void)

const b = Buffer.alloc(8)

b.writeUInt64LE(Math.pow(2, 32))

console.log(b)

const p = ref.alloc(ptrType)

console.log(p)

console.log(p.deref())

console.log(p.deref().deref())


/*

let code = "<invalid AppleScript code>"

//code = "2 + 2"

let scpt = objc.NSAppleScript.alloc().initWithSource_(code)


console.log("did compile="+scpt.isCompiled())
//console.log(objc.js(scpt.isCompiled())) // js() will throw type error here, as isCompiled method returns an ObjC primitive, not an ObjC object, so no unwrapping required
console.log("source code="+objc.js(scpt.source()))



//let error = null //objc.NSString.stringWithString_('')

let errorRef = new objc.Ref()

let res = scpt.compileAndReturnError_(errorRef)

console.log('RES =', res)

error = errorRef.value

console.log("error="+typeof error + '  ' + error instanceof objc.__internal__.ObjCObject)
if (error) { error = error.description().UTF8String() }

console.log("compileAndReturnError: success=" + res + '  err=' + error)
//console.log('J: <'+v.description().UTF8String()+'>')

console.log('test class: '+objc.NSString)

*/

