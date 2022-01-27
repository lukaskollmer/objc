#!/usr/bin/env node 

const objc = require('objc')

//let v = objc.NSString.stringWithString_('')


let code = "<invalid AppleScript code>"

//code = "2 + 2"

let scpt = objc.NSAppleScript.alloc().initWithSource_(code)


console.log("did compile="+scpt.isCompiled())
//console.log(objc.js(scpt.isCompiled())) // js() will throw type error here, as isCompiled method returns an ObjC primitive, not an ObjC object, so no unwrapping required
console.log("source code="+objc.js(scpt.source()))


// TO DO: InOutRef currently doesn't work with either nil or @
// msgSend error: TypeError: error setting argument 3 - writePointer: Buffer instance expected as third argument

let error = null //objc.NSString.stringWithString_('')

let errorRef = new objc.InOutRef(error)

let res = scpt.compileAndReturnError_(errorRef)

error = errorRef.deref()

console.log("error="+typeof error + '  ' + error instanceof objc.__internal__.ObjCObject)
if (error) { error = error.description().UTF8String() }

console.log("compileAndReturnError: success=" + res + '  err=' + error)
//console.log('J: <'+v.description().UTF8String()+'>')

console.log('test class: '+objc.NSString)

