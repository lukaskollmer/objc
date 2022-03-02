#!/usr/bin/env node

const ffi = require('ffi-napi');

const objc = require('../src/index');

const NSObjectType = objc.__internal__.types.objc_instance_t;


// note: NSStringFromRect and NSRectFromString are C functions, so for now must be manually bridged // TO DO: add `objc.functions` object to simplify this
const foundation = new ffi.Library(null, {
  NSStringFromRect: [NSObjectType, [objc.structs.NSRect]],
  NSRectFromString: [objc.structs.NSRect, [NSObjectType]],
});


// create a new NSRect value:

const rect = new objc.structs.NSRect({
  origin: new objc.structs.NSPoint({x: 5, y: 10}),
  size: new objc.structs.NSSize({width: 100, height: 250}),
});


//console.log(rect) // TO DO: ref-struct-di's StructType works, but it has an awful unreadable inspection string; we should provide our own implementation for usability, troubleshooting, etc


const string = foundation.NSStringFromRect(rect);

console.log(string); // [objc: {{5, 10}, {100, 250}}]

console.log(objc.js(string)); // '{{5, 10}, {100, 250}}'



const string2 = objc.ns('{{1, 2}, {3, 4}}');

const rect2 = foundation.NSRectFromString(string2);

//console.log(rect2);

// TO DO: again, Structs should generate their own human-readable representations, but for now we must format manually
console.log(`
NSRect {
  origin: {x: ${rect2.origin.x}, y: ${rect2.origin.y}},
  size: {width: ${rect2.size.width}, height: ${rect2.size.height}}
}
`);

