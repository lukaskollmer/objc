#!/usr/bin/env node

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

const getClipboard = () => {
  return pasteboard.stringForType_(NSPasteboardTypeString);
};

const setClipboard = text => {
  text = NSString.stringWithUTF8String_(text);
  console.log(`new text: ${text}`);
  let oldValue = getClipboard();
  pasteboard.setString_forType_(text, NSPasteboardTypeString);
  return oldValue;
};


setClipboard('Hello World!');

let contents = getClipboard(); // This is now still an `NSString`

console.log(String(contents)); // The `String(...)` call converts the `NSString` to a native JavaScript string object
