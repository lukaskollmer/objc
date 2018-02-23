'use strict';

const objc = require('../src/index');

objc.import('AppKit');

const {
  NSPasteboard,
  NSString,
  NSMutableArray,
  NSPasteboardTypeString
} = objc;


let pasteboard = NSPasteboard.generalPasteboard();
pasteboard.declareTypes_owner_([NSPasteboardTypeString], null);

const get = () => {
  return pasteboard.stringForType_(NSPasteboardTypeString);
};

const set = text => {
  text = NSString.stringWithUTF8String_(text);
  console.log(`new text: ${text}`);
  let oldValue = get();
  pasteboard.setString_forType_(text, NSPasteboardTypeString);
  return oldValue;
};


set('Hello World!');

let contents = get(); // This is now still an `NSString`

console.log(String(contents)); // The `String(...)` call converts the `NSString to a native JavaScript string object`
