'use strict';

const objc = require('../src/index');
const ref = require('ref');

const {
	NSAppleScript
} = objc;


let source = `tell application "Safari" to get URL of current tab of window 1`;

let script = NSAppleScript.alloc().initWithSource_(source);
console.log(`Initialized AppleScript object: ${script}`);

let result = script.executeAndReturnError_(null);

console.log(result);
