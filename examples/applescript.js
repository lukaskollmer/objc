'use strict';

const objc = require('../src/index.js');

const {
	NSAppleScript
} = objc;


let source = "tell application \"Safari\" to get URL of current tab of window 1";

let script = NSAppleScript.alloc().initWithSource_(source);
console.log(`Initialized AppleScript object: ${script}`);

// Compile
let error = objc.ref(null);
let result = script.executeAndReturnError_(error);

console.log(result);