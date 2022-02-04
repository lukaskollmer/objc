#!/usr/bin/env node

const objc = require('../src/index');

const {NSAppleScript, InOutRef} = objc;

const script = NSAppleScript.alloc().initWithSource_(`tell application "System Events" to get name of current user`);

const err = new InOutRef();
const result = script.executeAndReturnError_(err);
console.log(result, err.deref()); // [objc: <NSAppleEventDescriptor: 'utxt'("NAME")>] null
