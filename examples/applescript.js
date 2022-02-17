#!/usr/bin/env node

const objc = require('../src/index');

const {NSAppleScript, Ref} = objc;

const script = NSAppleScript.alloc().initWithSource_(`tell application "System Events" to get name of current user`);

const err = new Ref();
const result = script.executeAndReturnError_(err);
console.log(result, err.deref()); // [objc: <NSAppleEventDescriptor: 'utxt'("NAME")>] null
