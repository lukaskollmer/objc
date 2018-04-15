const objc = require('../src/index');

const {NSAppleScript} = objc;

const script = NSAppleScript.alloc().initWithSource_(`tell application "System Events" to get name of current user`);

const err = objc.allocRef();
const result = script.executeAndReturnError_(err);
console.log(result, err);
