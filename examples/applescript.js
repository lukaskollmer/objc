'use strict';

const objc = require('../src/index');

const {NSAppleScript} = objc;

const source = `tell application "System Events" to get name of current user`;

const script = NSAppleScript.alloc().initWithSource_(source);
console.log(`Initialized AppleScript object: ${script}`);

const err = objc.allocRef();
const result = script.executeAndReturnError_(err);
console.log(result, err.description());

