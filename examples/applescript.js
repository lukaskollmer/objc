#!/usr/bin/env node

const objc = require('../src/index');

const {NSAppleScript, Ref} = objc;

{
  const script = NSAppleScript.alloc().initWithSource_(`
    tell application "System Events" to get name of current user
  `);

  const err = new Ref();
  const result = script.executeAndReturnError_(err);
  console.log('result:', result);     // [objc: <NSAppleEventDescriptor: 'utxt'("lukas")>]
  console.log('error:', err.deref()); // null
}

{
  const script = NSAppleScript.alloc().initWithSource_(`
    this is not valid code
  `);

  const err = new Ref();
  const result = script.executeAndReturnError_(err);
  console.log('result:', result);     // null
  console.log('error:', err.deref()); // [objc { NSAppleScriptErrorBriefMessage = "Expected end of line, etc. but found identifier."; NSAppleScriptErrorMessage = "Expected end of line, etc. but found identifier."; NSAppleScriptErrorNumber = "-2741"; NSAppleScriptErrorRange = "NSRange: {23, 4}"; }]
}
